/**
 * デモシナリオを通しで流す（#1〜#4, #6, #7, #8, #9、--embed で #10 も）。
 *   npm run scenario
 *   npm run scenario -- --embed   # 話題が少なくても埋め込みで絞り込む（#10 を試す）
 *
 * 架空の定食屋でバイトを始めた大学生のメモ。登場人物はすべて架空。
 */
import { config } from '../src/config.ts';
import { traces } from '../src/gemini.ts';
import { Pipeline, type IngestResult } from '../src/pipeline.ts';
import { Store } from '../src/store.ts';
import type { Conflict } from '../src/types.ts';

if (process.argv.includes('--embed')) config.topicFullScanLimit = 0;

const store = new Store();
const p = new Pipeline(store);

const KIND = {
  contradiction: '⚠ 矛盾',
  conditional: '条件違い',
  update: '更新',
  supplement: '補足',
  same: '同じ',
} as const;

const line = (s = '') => console.log(s);
let seen = 0;
function aiLog() {
  for (const t of traces.slice(seen)) console.log(`    · ${t.step}  ${t.ms}ms`);
  seen = traces.length;
}

function showConflict(c: Conflict) {
  const a = store.instruction(c.a);
  const b = store.instruction(c.b);
  line(`  [${KIND[c.kind]}] ${store.topic(c.topicId)?.name}`);
  line(`    A: ${a.value}（${store.label(a.personId, a.speakerMention)}、${a.date}${a.condition ? `、${a.condition}` : ''}）`);
  line(`    B: ${b.value}（${store.label(b.personId, b.speakerMention)}、${b.date}${b.condition ? `、${b.condition}` : ''}）`);
  line(`    理由: ${c.reason}`);
  if (c.suggestion) {
    line(`    → 聞く相手: ${c.suggestion.askName}（${c.suggestion.reason}）`);
    line(`    → 質問文: 「${c.suggestion.question}」`);
  }
}

function show(label: string, r: IngestResult) {
  line(`\n■ ${label}（${r.memo.date}・${r.memo.kind}）`);
  line(`  ${r.memo.text.replace(/\n/g, '\n  ')}`);
  line('  抽出:');
  for (const i of r.instructions) {
    line(`    - [${store.topic(i.topicId)?.name}] ${i.target}: ${i.value}` +
      `${i.condition ? `（${i.condition}）` : ''} ／ ${store.label(i.personId, i.speakerMention)} ／ ${i.source}`);
  }
  for (const c of r.conflicts) showConflict(c);
  aiLog();
}

line(`provider=${config.provider} model=${config.model} 話題の全件比較の上限=${config.topicFullScanLimit}`);

// 事前に登録した人（ユーザーが入力する想定）
store.addPerson('田中', '店長', ['店長']);
store.addPerson('佐藤', '社員');

show('初日のメモ', await p.ingestText(
  '初日。佐藤さんに教わったこと。味噌汁の塩は小さじ1。ご飯の大盛りは250gまで。洗った皿は右の棚に戻す。',
  '2026-11-03'));

show('2 日目のメモ', await p.ingestText(
  '店長に、味噌汁の塩は小さじ1/2でいいって言われた。あと土日は混むからご飯の大盛りは受けないって。',
  '2026-11-05'));

show('3 日目（音声メモ・文字起こし済みとして）', await p.ingestVoice({
  transcript: '今日は鈴木さんと一緒だった。お客さんにしょっぱいって言われたことがあるから味付けは薄めにしてって。あとお皿は左の棚って言ってた気がする',
}, '2026-11-07'));

show('掲示物のメモ', await p.ingestText(
  'バックヤードの貼り紙: 11月10日から、ランチのご飯おかわりは1回まで無料。',
  '2026-11-08'));

// 確認して答えを記録する（#8）
const open = store.state.conflicts.filter((c) => c.status === 'open');
line(`\n■ 未解決の食い違い: ${open.length} 件`);
const salt = open.find((c) => /塩|味/.test(store.topic(c.topicId)?.name ?? '')) ?? open[0];
if (salt) {
  const r = await p.answer(salt.id, '店長に聞いたら、11月から減塩メニューにしたから小さじ1/2で合ってるって。佐藤さんにも伝えておくって。', '田中', '2026-11-09');
  line(`\n■ 答えを記録（${salt.id}）`);
  line(`  結論: ${r.resolution?.outcome} ／ ${r.resolution?.note}`);
  aiLog();
}

const fmt = await p.outputFormat();
line(`\n■ 出力形式（#7）: ${fmt.format} ／ ${fmt.reason}`);
aiLog();

line('\n■ 登録された人');
for (const person of store.state.persons) {
  line(`  ${person.id} ${person.name} 役職=${person.role ?? '不明'}${person.roleConfirmed ? '' : '（推定）'} 別名=${person.aliases.join('、') || 'なし'}`);
}

line('\n■ 話題ごとの今の正解');
for (const t of p.summary()) {
  line(`  ${t.topic}${t.openConflicts.length ? `  ⚠ 未解決 ${t.openConflicts.length}` : ''}`);
  for (const c of t.current) line(`    - ${c.text}${c.condition ? `（${c.condition}）` : ''} ／ ${c.by}`);
}

const total = traces.reduce((s, t) => s + t.ms, 0);
line(`\nAI 呼び出し ${traces.length} 回、合計 ${(total / 1000).toFixed(1)} 秒`);
