/**
 * 設定。ブラウザでも動くように、ファイルや .env は読まない。
 * Node では src/node/load-env.ts が .env を読み込んでから process.env の値を使う。
 * ブラウザ（lab）では setConfig で画面の入力値を入れる。
 */
export type Provider = 'aistudio' | 'vertex';

const env = (k: string, d = ''): string =>
  ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] ?? d).trim();

export const config = {
  provider: (env('GEMINI_PROVIDER', 'aistudio') === 'vertex' ? 'vertex' : 'aistudio') as Provider,
  geminiApiKey: env('GEMINI_API_KEY'),
  gcpApiKey: env('GOOGLE_CLOUD_API_KEY'),
  model: env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
  embeddingModel: env('EMBEDDING_MODEL', 'gemini-embedding-001'),
  topicFullScanLimit: Number(env('TOPIC_FULL_SCAN_LIMIT', '30')),
  sttLanguage: env('STT_LANGUAGE', 'ja-JP'),
  port: Number(env('PORT', '8787')),
};

const listeners: (() => void)[] = [];

/** 設定を変える（キーが変わったら Gemini クライアントを作り直す） */
export function setConfig(patch: Partial<typeof config>): void {
  Object.assign(config, patch);
  listeners.forEach((fn) => fn());
}

export function onConfigChange(fn: () => void): void {
  listeners.push(fn);
}

/** Gemini 用のキー。プロバイダに応じて使い分ける */
export function geminiKey(): string {
  const key = config.provider === 'vertex' ? config.gcpApiKey : config.geminiApiKey;
  if (!key) {
    const name = config.provider === 'vertex' ? 'GOOGLE_CLOUD_API_KEY' : 'GEMINI_API_KEY';
    throw new Error(`${name} が未設定です`);
  }
  return key;
}
