import { generateJson } from '../gemini.ts';
import type { Person } from '../types.ts';

export interface PersonMatch {
  mention: string;
  /** 登録済みの人の id。新しい人なら null */
  personId: string | null;
  /** 新しい人のときの名前 */
  newName: string | null;
  /** 推定した役職（例: 店長、社員、先輩バイト）。分からなければ null */
  roleGuess: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const schema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mention: { type: 'string' },
          personId: { type: ['string', 'null'] },
          newName: { type: ['string', 'null'] },
          roleGuess: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
        },
        required: ['mention', 'personId', 'newName', 'roleGuess', 'confidence', 'reason'],
      },
    },
  },
  required: ['matches'],
};

/** 名前・別名が完全一致すれば AI を呼ばずに対応づける */
export function matchExactly(mention: string, persons: Person[]): Person | undefined {
  const norm = (s: string) => s.replace(/(さん|くん|ちゃん|様)$/u, '').trim();
  const m = norm(mention);
  return persons.find((p) => norm(p.name) === m || p.aliases.some((a) => norm(a) === m));
}

/** #9 人の特定: 「店長」「田中さん」「田中」を登録済みの人に対応づけ、役職を推定する */
export async function identifyPeople(mentions: string[], persons: Person[], context: string): Promise<PersonMatch[]> {
  if (mentions.length === 0) return [];
  const r = await generateJson<{ matches: PersonMatch[] }>({
    step: '#9 人の特定',
    system: `あなたは職場のメモに出てくる人物の呼び方を、登録済みの人物に対応づけるアシスタントです。
- 「店長」のような役職名は、その役職の人が 1 人だけ登録されていれば対応づける
- 「田中」「田中さん」「田中店長」は同じ人とみなしてよい
- 確信が持てなければ新しい人（personId: null）とし、confidence を low にする
- 新しい人の役職は、呼び方とメモの文脈から推定する。根拠がなければ null`,
    schema,
    prompt: `登録済みの人:
${persons.map((p) => `- id=${p.id} 名前=${p.name} 役職=${p.role ?? '不明'} 別名=${p.aliases.join('、') || 'なし'}`).join('\n') || '（なし）'}

対応づけたい呼び方: ${mentions.join('、')}

メモの文脈:
${context}`,
  });
  return r.matches;
}
