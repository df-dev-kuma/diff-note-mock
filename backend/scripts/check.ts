/**
 * 接続確認: キーが読めているか、使えるモデル、テキスト生成と埋め込みが通るかを確かめる。
 *   npm run check
 */
import { config, geminiKey } from '../src/config.ts';
import { embed, gemini, generateJson } from '../src/gemini.ts';

console.log(`provider: ${config.provider}`);
console.log(`model: ${config.model} / embedding: ${config.embeddingModel}\n`);

try {
  geminiKey();
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}

const ai = gemini();

try {
  const names: string[] = [];
  const pager = await ai.models.list();
  for await (const m of pager) {
    if (m.name && /gemini/i.test(m.name)) names.push(m.name.replace(/^.*models\//, ''));
  }
  console.log(`使えるモデル（gemini を含むもの ${names.length} 件）:`);
  console.log(names.map((n) => `  ${n}${n === config.model || n === config.embeddingModel ? '  ← 設定中' : ''}`).join('\n'));
  if (!names.includes(config.model)) console.log(`\n⚠ GEMINI_MODEL=${config.model} が一覧にありません。.env で変更してください`);
} catch (e) {
  console.log(`モデル一覧の取得に失敗（生成は試します）: ${(e as Error).message}`);
}

const r = await generateJson<{ ok: boolean; echo: string }>({
  step: 'check',
  system: '指示どおりの JSON を返してください。',
  prompt: 'ok を true、echo に「疎通確認」と入れてください。',
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, echo: { type: 'string' } },
    required: ['ok', 'echo'],
  },
});
console.log(`\n生成: ${JSON.stringify(r)}`);

const [v] = await embed(['味噌汁の塩の量']);
console.log(`埋め込み: ${v.length} 次元`);
console.log('\n✓ 接続できています');
