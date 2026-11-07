import { generateJson } from '../gemini.ts';
import type { InstructionView } from './classify.ts';

export interface ResolveResult {
  outcome: 'adopt_a' | 'adopt_b' | 'new' | 'both_conditional' | 'unclear';
  /** outcome=new のときの新しい値 */
  newValue: string | null;
  /** outcome=both_conditional のときの条件 */
  conditionA: string | null;
  conditionB: string | null;
  note: string;
}

const schema = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['adopt_a', 'adopt_b', 'new', 'both_conditional', 'unclear'] },
    newValue: { type: ['string', 'null'] },
    conditionA: { type: ['string', 'null'] },
    conditionB: { type: ['string', 'null'] },
    note: { type: 'string', description: '結論を新人向けに 1 文で（例: 11月から減塩になったので小さじ1/2が正しい）' },
  },
  required: ['outcome', 'newValue', 'conditionA', 'conditionB', 'note'],
};

/** #8 答えの反映: 確認して得た答えのメモから、どちらが正しいかを判断する */
export async function resolveWithAnswer(
  a: InstructionView,
  b: InstructionView,
  answer: string,
  answeredBy: string,
): Promise<ResolveResult> {
  return generateJson<ResolveResult>({
    step: '#8 答えの反映',
    system: `あなたは、食い違った 2 つの指示について、確認して得た答えのメモから結論を整理するアシスタントです。
- adopt_a: A が正しい ／ adopt_b: B が正しい
- new: どちらでもない新しいやり方が答え（newValue に入れる）
- both_conditional: 両方正しく、条件で使い分ける（conditionA / conditionB に入れる）
- unclear: 答えから結論が読み取れない`,
    schema,
    prompt: `指示A: ${a.target}: ${a.value}（${a.speaker}、${a.date}）
指示B: ${b.target}: ${b.value}（${b.speaker}、${b.date}）

${answeredBy} に確認した答えのメモ:
${answer}`,
  });
}
