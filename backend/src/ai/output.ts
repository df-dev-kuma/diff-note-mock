import { generateJson } from '../gemini.ts';
import type { MemoKind } from '../types.ts';

export interface OutputFormat {
  format: 'chat_log' | 'checklist' | 'manual_like';
  reason: string;
}

/**
 * #7 出力と入力の整合性（今の方向性では不要かも）
 * 入力のされ方に合わせて、出力（PDF など）の形を選ぶ。
 */
export async function chooseOutputFormat(inputKinds: MemoKind[], summary: string): Promise<OutputFormat> {
  return generateJson<OutputFormat>({
    step: '#7 出力形式の選択',
    system: `あなたは、記録をどんな見た目で出力するかを決めるアシスタントです。
- chat_log: 口頭・音声中心で、誰が何と言ったかが大事なとき（会話ログ風）
- checklist: 作業手順や確認事項が中心のとき（チェックリスト風）
- manual_like: マニュアルや掲示物が元になっているとき（元の書類に寄せた体裁）`,
    schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['chat_log', 'checklist', 'manual_like'] },
        reason: { type: 'string' },
      },
      required: ['format', 'reason'],
    },
    prompt: `入力のされ方の内訳: ${inputKinds.join('、')}\n\n内容の要約:\n${summary}`,
  });
}
