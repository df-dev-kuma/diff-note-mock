/**
 * 1 つずつ試す。
 *   npm run try -- text "店長に塩は小さじ1/2でいいって言われた"
 *   npm run try -- file ./manual.pdf          # #5（画像は .jpg / .png）
 *   npm run try -- voice ./memo.wav           # #6（GCP のキーが必要）
 *   npm run try -- transcript "今日は鈴木さんに…"  # #6 の文字起こし以降だけ
 */
import '../src/node/load-env.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { traces } from '../src/gemini.ts';
import { Pipeline } from '../src/pipeline.ts';
import { Store } from '../src/store.ts';

const [mode, arg] = process.argv.slice(2);
if (!mode || !arg) {
  console.log('使い方: npm run try -- <text|file|voice|transcript> <テキストまたはファイルパス>');
  process.exit(1);
}

const store = new Store();
store.addPerson('田中', '店長', ['店長']);
store.addPerson('佐藤', '社員');
const p = new Pipeline(store);

const mime: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.heic': 'image/heic',
};

const result =
  mode === 'text' ? await p.ingestText(arg)
  : mode === 'transcript' ? await p.ingestVoice({ transcript: arg })
  : mode === 'file' ? await p.ingestFile({
      data: readFileSync(arg).toString('base64'),
      mimeType: mime[path.extname(arg).toLowerCase()] ?? 'application/octet-stream',
      name: path.basename(arg),
    })
  : mode === 'voice' ? await p.ingestVoice({ audio: { data: readFileSync(arg).toString('base64') } })
  : null;

if (!result) {
  console.log(`不明なモード: ${mode}`);
  process.exit(1);
}

console.log(JSON.stringify({ instructions: result.instructions, persons: store.state.persons, topics: store.state.topics }, null, 2));
console.log(traces.map((t) => `${t.step} ${t.ms}ms`).join('\n'));
