import { GoogleGenAI, type Part } from '@google/genai';

import { config, geminiKey } from './config.ts';
import type { AiTrace } from './types.ts';

let client: GoogleGenAI | null = null;

/**
 * 検証: Google AI Studio の API キー
 * 本番: GCP（Vertex AI）の API キー
 */
export function gemini(): GoogleGenAI {
  if (client) return client;
  const apiKey = geminiKey();
  client =
    config.provider === 'vertex'
      ? new GoogleGenAI({ vertexai: true, apiKey })
      : new GoogleGenAI({ apiKey });
  return client;
}

/** 直近の AI 呼び出しの記録。CLI やサーバーのレスポンスで表示する */
export const traces: AiTrace[] = [];

export interface JsonRequest {
  step: string;
  system: string;
  prompt: string;
  schema: object;
  files?: { data: string; mimeType: string }[];
}

type JsonGenerator = (opts: JsonRequest) => Promise<unknown>;
let override: JsonGenerator | null = null;

/** テスト用: Gemini を呼ばずに決まった応答を返す関数に差し替える */
export function setJsonGenerator(fn: JsonGenerator | null): void {
  override = fn;
}

/** JSON スキーマ付きで Gemini を呼び、パース済みの結果を返す */
export async function generateJson<T>(opts: JsonRequest): Promise<T> {
  if (override) {
    traces.push({ step: opts.step, ms: 0, model: 'fake' });
    return (await override(opts)) as T;
  }
  const parts: Part[] = [
    ...(opts.files ?? []).map((f) => ({ inlineData: { data: f.data, mimeType: f.mimeType } })),
    { text: opts.prompt },
  ];
  const started = performance.now();
  const res = await gemini().models.generateContent({
    model: config.model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: 'application/json',
      responseJsonSchema: opts.schema,
      temperature: 0.2,
    },
  });
  traces.push({ step: opts.step, ms: Math.round(performance.now() - started), model: config.model });
  const text = res.text;
  if (!text) throw new Error(`${opts.step}: Gemini の応答が空でした`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${opts.step}: JSON として読めない応答でした: ${text.slice(0, 200)}`);
  }
}

/** #10 用: テキストを埋め込みベクトルにする */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const started = performance.now();
  const res = await gemini().models.embedContent({
    model: config.embeddingModel,
    contents: texts,
    config: { taskType: 'SEMANTIC_SIMILARITY' },
  });
  traces.push({ step: '#10 埋め込み', ms: Math.round(performance.now() - started), model: config.embeddingModel });
  return (res.embeddings ?? []).map((e) => e.values ?? []);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
