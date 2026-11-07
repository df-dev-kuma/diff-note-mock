import { generateJson } from '../gemini.ts';
import type { ConflictKind } from '../types.ts';

/** #3 に渡す指示の情報（人は表示名に解決済み） */
export interface InstructionView {
  value: string;
  target: string;
  task: string;
  condition: string | null;
  speaker: string;
  date: string;
  source: string;
  quote: string;
}

export interface Classification {
  kind: ConflictKind;
  reason: string;
}

const schema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['contradiction', 'conditional', 'update', 'supplement', 'same'],
    },
    reason: { type: 'string', description: '判定の理由を 1〜2 文で' },
  },
  required: ['kind', 'reason'],
};

const system = `あなたは、同じ話題についての 2 つの仕事の指示を比べて、関係を判定するアシスタントです。
判定は次のどれか 1 つ:
- contradiction（矛盾）: 同じ状況なのに違うことを言っていて、どちらに従えばよいか本人には決められない
- conditional（条件違い）: 違うことを言っているが、適用される条件（曜日・時間帯・メニューなど）が違うので両立する
- update（更新）: ルールが変わったことが読み取れる（「来月から」「今日から変わった」「新しいマニュアルでは」など）。単に日付が新しいだけでは更新とみなさない
- supplement（補足）: 片方がもう片方に情報を足しているだけで、ぶつかっていない
- same（同じ）: 言い方が違うだけで内容は同じ

注意:
- 違う人が違う日に違うことを言っていても、ルール変更の根拠がなければ contradiction にする
- 条件が書かれていない側は「いつも」と解釈する。条件付きの側と両立するなら conditional
- 迷ったら contradiction にする（確認を促す方が安全）`;

const view = (label: string, v: InstructionView) =>
  `${label}: ${v.task} / ${v.target}: ${v.value}
  条件: ${v.condition ?? 'なし'} ／ 言った人: ${v.speaker} ／ 日付: ${v.date} ／ 出どころ: ${v.source}
  元の文: ${v.quote}`;

/** #3 食い違いの分類 */
export async function classifyPair(older: InstructionView, newer: InstructionView): Promise<Classification> {
  return generateJson<Classification>({
    step: '#3 食い違いの分類',
    system,
    schema,
    prompt: `${view('指示A（先に記録）', older)}\n\n${view('指示B（後から記録）', newer)}`,
  });
}
