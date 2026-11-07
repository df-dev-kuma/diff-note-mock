import { config } from '../config.ts';
import { cosine, embed, generateJson } from '../gemini.ts';
import type { Instruction, Topic } from '../types.ts';

export const instructionText = (i: Pick<Instruction, 'task' | 'target' | 'value'>) =>
  `${i.task} / ${i.target}: ${i.value}`;

/**
 * #10 話題の候補の絞り込み
 * 話題が少なければ全件を返す（AI を呼ばない）。多ければ埋め込みの近さで上位 k 件に絞る。
 */
export async function narrowTopics(inst: Instruction, topics: Topic[], k = 8): Promise<Topic[]> {
  if (topics.length <= config.topicFullScanLimit) return topics;
  const missing = topics.filter((t) => !t.embedding);
  const vecs = await embed([
    instructionText(inst),
    ...missing.map((t) => `${t.name}: ${t.description}`),
  ]);
  missing.forEach((t, i) => (t.embedding = vecs[i + 1]));
  const q = vecs[0];
  return [...topics]
    .sort((a, b) => cosine(q, b.embedding!) - cosine(q, a.embedding!))
    .slice(0, k);
}

export interface TopicDecision {
  topicId: string | null;
  newTopicName: string | null;
  newTopicDescription: string | null;
  reason: string;
}

const schema = {
  type: 'object',
  properties: {
    topicId: { type: ['string', 'null'], description: '既存の話題に当てはまればその id。なければ null' },
    newTopicName: { type: ['string', 'null'], description: '新しい話題の短い名前（例: 味噌汁の塩加減）' },
    newTopicDescription: { type: ['string', 'null'], description: '新しい話題が何についてか 1 文で' },
    reason: { type: 'string' },
  },
  required: ['topicId', 'newTopicName', 'newTopicDescription', 'reason'],
};

/** #2 同じ話題のまとめ */
export async function decideTopic(
  inst: Instruction,
  candidates: { topic: Topic; examples: Instruction[] }[],
): Promise<TopicDecision> {
  return generateJson<TopicDecision>({
    step: '#2 同じ話題のまとめ',
    system: `あなたは仕事の指示を「話題」ごとに分類するアシスタントです。
- 話題とは「同じことについての指示」のまとまり。値が違っても、同じ対象についての指示なら同じ話題（例: 「塩 小さじ1」と「塩は小さじ1/2」は同じ話題）
- 「塩」「味付け」「しょっぱさ」のように言い方が違っても、実質同じことを決めているなら同じ話題
- 作業や対象が違うなら別の話題にする（例: 味噌汁の塩と、煮物の塩は別）
- 当てはまる話題がなければ新しい話題を作る`,
    schema,
    prompt: `新しい指示: ${instructionText(inst)}${inst.condition ? `（条件: ${inst.condition}）` : ''}
元の文: ${inst.quote}

既存の話題:
${candidates
  .map(
    (c) =>
      `- id=${c.topic.id} 「${c.topic.name}」: ${c.topic.description}\n  例: ${c.examples
        .slice(0, 3)
        .map((e) => instructionText(e))
        .join(' ／ ')}`,
  )
  .join('\n') || '（まだありません）'}`,
  });
}
