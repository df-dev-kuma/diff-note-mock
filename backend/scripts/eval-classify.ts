/**
 * #3 食い違いの分類の正答率を測る。
 *   npm run eval:classify
 *   GEMINI_MODEL=別のモデル npm run eval:classify   # モデルを比べる
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyPair, type InstructionView } from '../src/ai/classify.ts';
import { config } from '../src/config.ts';
import { traces } from '../src/gemini.ts';
import type { ConflictKind } from '../src/types.ts';

interface Case {
  id: string;
  expected: ConflictKind;
  note: string;
  a: InstructionView;
  b: InstructionView;
}

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../eval/classify-cases.json');
const cases = JSON.parse(readFileSync(file, 'utf8')) as Case[];
const kinds: ConflictKind[] = ['contradiction', 'conditional', 'update', 'supplement', 'same'];

console.log(`model=${config.model}  ${cases.length} 件\n`);

const confusion = new Map<string, number>();
let correct = 0;
for (const c of cases) {
  const r = await classifyPair(c.a, c.b);
  const ok = r.kind === c.expected;
  if (ok) correct++;
  confusion.set(`${c.expected}>${r.kind}`, (confusion.get(`${c.expected}>${r.kind}`) ?? 0) + 1);
  const ms = traces.at(-1)?.ms ?? 0;
  console.log(`${ok ? '✓' : '✗'} ${c.id} 正解=${c.expected} 判定=${r.kind}  ${ms}ms  ${c.note}${ok ? '' : `\n    理由: ${r.reason}`}`);
}

console.log(`\n正答率: ${correct}/${cases.length}（${Math.round((correct / cases.length) * 100)}%）`);
const ms = traces.map((t) => t.ms).sort((a, b) => a - b);
console.log(`応答時間: 中央値 ${ms[Math.floor(ms.length / 2)]}ms / 最大 ${ms.at(-1)}ms`);

console.log('\n混同行列（行=正解、列=判定）');
const short = (k: string) => k.slice(0, 6).padEnd(7);
console.log(`        ${kinds.map(short).join('')}`);
for (const e of kinds) {
  console.log(`${short(e)} ${kinds.map((g) => String(confusion.get(`${e}>${g}`) ?? 0).padEnd(7)).join('')}`);
}
// 矛盾の見逃しは「確認すべきなのに知らせない」ので特に重い
const missed = cases.filter((c) => c.expected === 'contradiction').length - (confusion.get('contradiction>contradiction') ?? 0);
console.log(`\n矛盾の見逃し: ${missed} 件 ／ 矛盾でないのに矛盾と判定: ${kinds.filter((k) => k !== 'contradiction').reduce((s, k) => s + (confusion.get(`${k}>contradiction`) ?? 0), 0)} 件`);
