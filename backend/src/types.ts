/** 指示の出どころ */
export type Source = 'oral' | 'manual' | 'unknown';

export type MemoKind = 'text' | 'file' | 'voice';

export interface Memo {
  id: string;
  kind: MemoKind;
  /** テキスト。ファイルなら抽出の元になったファイル名、音声なら文字起こし */
  text: string;
  /** メモの基準日（YYYY-MM-DD）。「昨日」などはこの日を基準に解釈する */
  date: string;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  aliases: string[];
  role: string | null;
  /** ユーザーが確認した役職か（false なら #9 の推定） */
  roleConfirmed: boolean;
}

export interface Instruction {
  id: string;
  memoId: string;
  task: string;
  target: string;
  value: string;
  condition: string | null;
  /** メモ中の言い方（「店長」「佐藤さん」など） */
  speakerMention: string | null;
  personId: string | null;
  date: string;
  source: Source;
  quote: string;
  topicId: string | null;
  /** superseded: 更新で古くなった / rejected: 確認の結果、正しくなかった */
  status: 'active' | 'superseded' | 'rejected';
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  embedding?: number[];
}

/** #3 の分類。same は「言い方が違うだけで同じ内容」 */
export type ConflictKind = 'contradiction' | 'conditional' | 'update' | 'supplement' | 'same';

export interface Suggestion {
  askPersonId: string | null;
  askName: string;
  reason: string;
  question: string;
}

export interface Resolution {
  outcome: 'adopt_a' | 'adopt_b' | 'new' | 'both_conditional' | 'unclear';
  note: string;
  answerMemoId: string;
  newInstructionId?: string;
}

export interface Conflict {
  id: string;
  topicId: string;
  /** 既存の指示 */
  a: string;
  /** 新しく入ってきた指示 */
  b: string;
  kind: ConflictKind;
  reason: string;
  /** open: 要確認 / resolved: 確認済み / info: 確認不要（条件違い・更新・補足・同じ） */
  status: 'open' | 'resolved' | 'info';
  suggestion?: Suggestion;
  resolution?: Resolution;
}

/** AI 呼び出しの記録（どの # がどれだけ時間を使ったか） */
export interface AiTrace {
  step: string;
  ms: number;
  model: string;
}
