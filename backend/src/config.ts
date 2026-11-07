import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

export type Provider = 'aistudio' | 'vertex';

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const config = {
  provider: (env('GEMINI_PROVIDER', 'aistudio') === 'vertex' ? 'vertex' : 'aistudio') as Provider,
  geminiApiKey: env('GEMINI_API_KEY'),
  gcpApiKey: env('GOOGLE_CLOUD_API_KEY'),
  model: env('GEMINI_MODEL', 'gemini-3.8-flash'),
  embeddingModel: env('EMBEDDING_MODEL', 'gemini-embedding-001'),
  topicFullScanLimit: Number(env('TOPIC_FULL_SCAN_LIMIT', '30')),
  sttLanguage: env('STT_LANGUAGE', 'ja-JP'),
  port: Number(env('PORT', '8787')),
};

/** Gemini 用のキー。プロバイダに応じて使い分ける */
export function geminiKey(): string {
  const key = config.provider === 'vertex' ? config.gcpApiKey : config.geminiApiKey;
  if (!key) {
    const name = config.provider === 'vertex' ? 'GOOGLE_CLOUD_API_KEY' : 'GEMINI_API_KEY';
    throw new Error(`${name} が未設定です。backend/.env.example を backend/.env にコピーしてキーを入れてください`);
  }
  return key;
}
