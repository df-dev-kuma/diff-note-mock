import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.ts';
import { traces } from './gemini.ts';
import { Pipeline } from './pipeline.ts';
import { Store } from './store.ts';

const dataFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/state.json');
const store = new Store(dataFile);
const pipeline = new Pipeline(store);

type Handler = (body: any, params: string[]) => Promise<unknown> | unknown;

/** [メソッド, パス（正規表現）, 処理] */
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/health$/, () => ({ ok: true, provider: config.provider, model: config.model })],
  ['GET', /^\/state$/, () => ({ ...store.state, summary: pipeline.summary() })],
  ['POST', /^\/reset$/, () => (store.reset(), { ok: true })],

  // 人の登録・役職の確認（#9 の推定をユーザーが直す）
  ['POST', /^\/persons$/, (b) => {
    const p = store.addPerson(b.name, b.role ?? null, b.aliases ?? []);
    store.save();
    return p;
  }],
  ['PATCH', /^\/persons\/([\w-]+)$/, (b, [id]) => {
    const p = store.person(id);
    if (!p) throw new HttpError(404, `人 ${id} が見つかりません`);
    if ('role' in b) {
      p.role = b.role;
      p.roleConfirmed = true;
    }
    if (b.name) p.name = b.name;
    store.save();
    return p;
  }],

  // 入力（#1 / #5 / #6）
  ['POST', /^\/memos\/text$/, (b) => pipeline.ingestText(required(b, 'text'), b.date)],
  ['POST', /^\/memos\/file$/, (b) =>
    pipeline.ingestFile({ data: required(b, 'data'), mimeType: required(b, 'mimeType'), name: b.name }, b.date)],
  ['POST', /^\/memos\/voice$/, (b) =>
    pipeline.ingestVoice({ audio: b.audio, transcript: b.transcript }, b.date)],

  // 答えの反映（#8）
  ['POST', /^\/conflicts\/([\w-]+)\/answer$/, (b, [id]) => pipeline.answer(id, required(b, 'text'), b.answeredBy, b.date)],

  // 出力形式（#7）
  ['POST', /^\/output-format$/, (b) => pipeline.outputFormat(b.topicId)],
];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function required(b: any, key: string): string {
  if (typeof b?.[key] !== 'string' || !b[key]) throw new HttpError(400, `${key} が必要です`);
  return b[key];
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON として読めません');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // ローカルの Flutter Web から呼べるように
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body, null, 2));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
  if (!route) return send(res, 404, { error: 'not found' });
  const params = url.pathname.match(route[1])!.slice(1);
  const before = traces.length;
  try {
    const result = await route[2](await readBody(req), params);
    send(res, 200, { result, ai: traces.slice(before) });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    send(res, status, { error: e instanceof Error ? e.message : String(e), ai: traces.slice(before) });
  }
}).listen(config.port, () => {
  console.log(`backend: http://localhost:${config.port}  (provider=${config.provider}, model=${config.model})`);
});
