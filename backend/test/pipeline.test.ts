/**
 * Gemini を呼ばずに、パイプラインのつなぎ（人・話題・食い違い・答えの反映）を確かめる。
 *   npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setJsonGenerator, type JsonRequest } from '../src/gemini.ts';
import { Pipeline } from '../src/pipeline.ts';
import { Store } from '../src/store.ts';

test('食い違いの検出から答えの反映まで', async () => {
  const replies: Record<string, (r: JsonRequest) => unknown> = {
    '#1 指示の抽出': (r) =>
      r.prompt.includes('小さじ1/2')
        ? { instructions: [{ task: '味噌汁', target: '塩の量', value: '小さじ1/2', condition: null, speaker: '店長', date: null, source: 'oral', quote: '塩は小さじ1/2' }] }
        : { instructions: [{ task: '味噌汁', target: '塩の量', value: '小さじ1', condition: null, speaker: '鈴木さん', date: null, source: 'oral', quote: '塩は小さじ1' }] },
    '#9 人の特定': () => ({ matches: [{ mention: '鈴木さん', personId: null, newName: '鈴木', roleGuess: '先輩バイト', confidence: 'medium', reason: '' }] }),
    '#2 同じ話題のまとめ': (r) =>
      r.prompt.includes('id=t')
        ? { topicId: r.prompt.match(/id=(t\d+)/)![1], newTopicName: null, newTopicDescription: null, reason: '' }
        : { topicId: null, newTopicName: '味噌汁の塩', newTopicDescription: '味噌汁に入れる塩の量', reason: '' },
    '#3 食い違いの分類': () => ({ kind: 'contradiction', reason: '量が違う' }),
    '#4 確認先の提案': (r) => ({ askPersonId: r.prompt.match(/id=(p\d+) 田中/)![1], askName: '田中店長', reason: '店長だから', question: 'どちらに合わせればよいですか' }),
    '#8 答えの反映': () => ({ outcome: 'adopt_b', newValue: null, conditionA: null, conditionB: null, note: '小さじ1/2が正しい' }),
  };
  setJsonGenerator(async (r) => {
    const fn = replies[r.step];
    assert.ok(fn, `想定外の呼び出し: ${r.step}`);
    return fn(r);
  });

  const store = new Store();
  store.addPerson('田中', '店長', ['店長']);
  const p = new Pipeline(store);

  const first = await p.ingestText('鈴木さんに塩は小さじ1って言われた', '2026-11-03');
  assert.equal(first.conflicts.length, 0);
  const suzuki = store.state.persons.find((x) => x.name === '鈴木');
  assert.ok(suzuki, '#9 で新しい人が登録される');
  assert.equal(suzuki.roleConfirmed, false);

  const second = await p.ingestText('店長に塩は小さじ1/2でいいって言われた', '2026-11-05');
  assert.equal(second.instructions[0].personId, store.state.persons[0].id, '「店長」は AI なしで田中に対応づく');
  assert.equal(second.conflicts.length, 1);
  const c = second.conflicts[0];
  assert.equal(c.status, 'open');
  assert.equal(c.suggestion?.askName, '田中店長');

  const resolved = await p.answer(c.id, '店長に聞いたら小さじ1/2で合ってるって', '田中', '2026-11-06');
  assert.equal(resolved.status, 'resolved');
  assert.equal(store.instruction(c.a).status, 'rejected');
  assert.deepEqual(p.summary()[0].current.map((x) => x.text), ['味噌汁 / 塩の量: 小さじ1/2']);
  setJsonGenerator(null);
});
