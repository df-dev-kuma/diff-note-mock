import { generateJson } from '../gemini.ts';
import type { Person } from '../types.ts';
import type { InstructionView } from './classify.ts';

export interface SuggestionResult {
  askPersonId: string | null;
  askName: string;
  reason: string;
  question: string;
}

const schema = {
  type: 'object',
  properties: {
    askPersonId: { type: ['string', 'null'], description: '聞く相手の id。登録外の人なら null' },
    askName: { type: 'string', description: '聞く相手の呼び方' },
    reason: { type: 'string', description: 'その人に聞くべき理由を 1〜2 文で' },
    question: { type: 'string', description: 'そのまま口頭で聞ける・送れる質問文' },
  },
  required: ['askPersonId', 'askName', 'reason', 'question'],
};

/** #4 確認先の提案（理由と、角が立たない質問文つき） */
export async function suggestWhomToAsk(
  a: InstructionView,
  b: InstructionView,
  conflictReason: string,
  persons: Person[],
  today: string,
): Promise<SuggestionResult> {
  return generateJson<SuggestionResult>({
    step: '#4 確認先の提案',
    system: `あなたはアルバイトの新人を守るアシスタントです。食い違った 2 つの指示について、誰に確認すべきかと、その質問文を考えます。
確認先の選び方:
- 原則、その判断に責任を持つ立場の人（店長・社員・リーダーなど）を優先する
- ただし、その作業の担当者がはっきりしていればその人でもよい
- 役職が推定（未確認）の場合は、そのことを理由に書く
質問文の書き方:
- 新人が上の人に聞く、丁寧で短い話し言葉
- 誰かが間違っていると責めない。告げ口に聞こえないようにする
- 「〜と教わったのですが、〜とも聞いて、どちらに合わせればよいですか」のように、両方を並べて判断を仰ぐ
- 相手が指示を出した本人なら、その人の指示を否定せずに確認する形にする
- もう一方の指示を出した人の名前は、必要がなければ出さない`,
    schema,
    prompt: `今日: ${today}

指示A: ${a.task} / ${a.target}: ${a.value}（条件: ${a.condition ?? 'なし'}、${a.speaker}、${a.date}、${a.source}）
指示B: ${b.task} / ${b.target}: ${b.value}（条件: ${b.condition ?? 'なし'}、${b.speaker}、${b.date}、${b.source}）
食い違いの内容: ${conflictReason}

職場の人:
${persons.map((p) => `- id=${p.id} ${p.name} 役職=${p.role ?? '不明'}${p.role && !p.roleConfirmed ? '（推定）' : ''}`).join('\n') || '（登録なし）'}`,
  });
}
