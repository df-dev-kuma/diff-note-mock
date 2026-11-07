import { generateJson } from '../gemini.ts';
import type { Source } from '../types.ts';

/** #1 / #5 / #6 が共通で返す形 */
export interface ExtractedInstruction {
  task: string;
  target: string;
  value: string;
  condition: string | null;
  speaker: string | null;
  date: string | null;
  source: Source;
  quote: string;
}

const schema = {
  type: 'object',
  properties: {
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '何の作業か（例: 味噌汁を作る、食器を片付ける）' },
          target: { type: 'string', description: '指示の対象（例: 塩の量、皿を戻す棚）' },
          value: { type: 'string', description: 'どうするか・いくつか（例: 小さじ1/2、右の棚）' },
          condition: { type: ['string', 'null'], description: '適用される条件（例: 土日のみ、ランチ時）。なければ null' },
          speaker: { type: ['string', 'null'], description: '言った人の書かれ方そのまま（例: 店長、佐藤さん）。不明なら null' },
          date: { type: ['string', 'null'], description: '言われた日 YYYY-MM-DD。基準日から計算する。不明なら null' },
          source: { type: 'string', enum: ['oral', 'manual', 'unknown'] },
          quote: { type: 'string', description: '根拠になった元の文の抜粋' },
        },
        required: ['task', 'target', 'value', 'condition', 'speaker', 'date', 'source', 'quote'],
      },
    },
  },
  required: ['instructions'],
};

const system = `あなたはアルバイトや新人が書いた業務メモから「仕事の指示」を取り出すアシスタントです。
- 1 つのメモに複数の指示があれば、すべて別々に取り出す
- 指示でない感想や雑談は取り出さない
- 主語や目的語が省略されていても、文脈から補える範囲で補う。推測しすぎない
- 「昨日」「先週の土曜」などは基準日から実際の日付に直す
- 口頭で言われたものは oral、マニュアル・掲示物・書類由来は manual、判断できなければ unknown
- 値は元の表現を大きく変えずに短くまとめる（「半分くらい」→「半分程度」はよいが、勝手に数値化しない）`;

/** #1 テキスト指示の抽出 */
export async function extractFromText(text: string, refDate: string, knownPeople: string[]): Promise<ExtractedInstruction[]> {
  const r = await generateJson<{ instructions: ExtractedInstruction[] }>({
    step: '#1 指示の抽出',
    system,
    schema,
    prompt: `基準日: ${refDate}
登録済みの人: ${knownPeople.join('、') || '（なし）'}

メモ:
${text}`,
  });
  return r.instructions;
}

/** #5 写真・PDF の読み取り（#1 と同じ形で返す） */
export async function extractFromFile(
  file: { data: string; mimeType: string },
  refDate: string,
  knownPeople: string[],
): Promise<ExtractedInstruction[]> {
  const r = await generateJson<{ instructions: ExtractedInstruction[] }>({
    step: '#5 写真・PDF の読み取り',
    system: `${system}
- 添付は手書きメモの写真、マニュアル、掲示物などの画像または PDF。書かれている指示を読み取る
- マニュアルや掲示物なら source は manual、手書きメモで「〜さんに言われた」とあれば oral`,
    schema,
    files: [file],
    prompt: `基準日: ${refDate}
登録済みの人: ${knownPeople.join('、') || '（なし）'}

添付ファイルから指示を取り出してください。`,
  });
  return r.instructions;
}
