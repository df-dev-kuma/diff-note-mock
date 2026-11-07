import type { InstructionView } from './ai/classify.ts';
import { classifyPair } from './ai/classify.ts';
import { extractFromFile, extractFromText, type ExtractedInstruction } from './ai/extract.ts';
import { chooseOutputFormat } from './ai/output.ts';
import { identifyPeople, matchExactly } from './ai/person.ts';
import { resolveWithAnswer } from './ai/resolve.ts';
import { suggestWhomToAsk } from './ai/suggest.ts';
import { decideTopic, instructionText, narrowTopics } from './ai/topic.ts';
import { transcribe } from './ai/voice.ts';
import type { Store } from './store.ts';
import type { Conflict, Instruction, Memo, MemoKind } from './types.ts';

const today = () => new Date().toISOString().slice(0, 10);

export interface IngestResult {
  memo: Memo;
  instructions: Instruction[];
  conflicts: Conflict[];
}

export class Pipeline {
  constructor(private store: Store) {}

  private get s() {
    return this.store.state;
  }

  // ---------- 入力 ----------

  /** テキストのメモ（#1） */
  async ingestText(text: string, date = today()): Promise<IngestResult> {
    const extracted = await extractFromText(text, date, this.knownPeople());
    return this.ingest('text', text, date, extracted);
  }

  /** 写真・PDF（#5） */
  async ingestFile(file: { data: string; mimeType: string; name?: string }, date = today()): Promise<IngestResult> {
    const extracted = await extractFromFile(file, date, this.knownPeople());
    return this.ingest('file', file.name ?? `(${file.mimeType})`, date, extracted);
  }

  /** 音声（#6: Speech-to-Text → #1）。transcript を渡すと文字起こしを省略する */
  async ingestVoice(
    input: { audio?: { data: string; encoding?: string; sampleRateHertz?: number }; transcript?: string },
    date = today(),
  ): Promise<IngestResult & { transcript: string }> {
    const transcript = input.transcript ?? (input.audio ? await transcribe(input.audio) : '');
    if (!transcript) throw new Error('音声か transcript のどちらかが必要です');
    const extracted = await extractFromText(transcript, date, this.knownPeople());
    // 音声メモは口頭で言われたことの記録とみなす
    for (const e of extracted) if (e.source === 'unknown') e.source = 'oral';
    return { ...(await this.ingest('voice', transcript, date, extracted)), transcript };
  }

  private knownPeople(): string[] {
    return this.s.persons.map((p) => (p.role ? `${p.name}（${p.role}）` : p.name));
  }

  private async ingest(kind: MemoKind, text: string, date: string, extracted: ExtractedInstruction[]): Promise<IngestResult> {
    const memo: Memo = { id: this.store.id('m'), kind, text, date, createdAt: new Date().toISOString() };
    this.s.memos.push(memo);

    const personIds = await this.resolvePeople(extracted, text);

    const created: Instruction[] = extracted.map((e) => ({
      id: this.store.id('i'),
      memoId: memo.id,
      task: e.task,
      target: e.target,
      value: e.value,
      condition: e.condition,
      speakerMention: e.speaker,
      personId: e.speaker ? (personIds.get(e.speaker) ?? null) : null,
      date: e.date ?? date,
      source: e.source,
      quote: e.quote,
      topicId: null,
      status: 'active',
    }));

    const conflicts: Conflict[] = [];
    for (const inst of created) {
      await this.assignTopic(inst);
      this.s.instructions.push(inst);
      conflicts.push(...(await this.compare(inst, date)));
    }
    this.store.save();
    return { memo, instructions: created, conflicts };
  }

  // ---------- #9 人の特定 ----------

  private async resolvePeople(extracted: ExtractedInstruction[], context: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unknown: string[] = [];
    for (const m of new Set(extracted.map((e) => e.speaker).filter((x): x is string => !!x))) {
      const p = matchExactly(m, this.s.persons);
      if (p) map.set(m, p.id);
      else unknown.push(m);
    }
    if (unknown.length === 0) return map;

    for (const r of await identifyPeople(unknown, this.s.persons, context)) {
      const existing = this.store.person(r.personId);
      if (existing) {
        if (!existing.aliases.includes(r.mention)) existing.aliases.push(r.mention);
        map.set(r.mention, existing.id);
      } else {
        const name = r.newName ?? r.mention;
        const p = matchExactly(name, this.s.persons) ?? this.store.addPerson(name, r.roleGuess, name === r.mention ? [] : [r.mention], false);
        map.set(r.mention, p.id);
      }
    }
    return map;
  }

  // ---------- #10 → #2 話題 ----------

  private async assignTopic(inst: Instruction): Promise<void> {
    const candidates = await narrowTopics(inst, this.s.topics);
    const decision = await decideTopic(
      inst,
      candidates.map((topic) => ({
        topic,
        examples: this.s.instructions.filter((i) => i.topicId === topic.id),
      })),
    );
    if (decision.topicId && this.store.topic(decision.topicId)) {
      inst.topicId = decision.topicId;
      return;
    }
    const topic = {
      id: this.store.id('t'),
      name: decision.newTopicName ?? inst.target,
      description: decision.newTopicDescription ?? instructionText(inst),
    };
    this.s.topics.push(topic);
    inst.topicId = topic.id;
  }

  // ---------- #3 → #4 食い違い ----------

  view(i: Instruction): InstructionView {
    return {
      task: i.task,
      target: i.target,
      value: i.value,
      condition: i.condition,
      speaker: this.store.label(i.personId, i.speakerMention),
      date: i.date,
      source: { oral: '口頭', manual: 'マニュアル', unknown: '不明' }[i.source],
      quote: i.quote,
    };
  }

  private async compare(inst: Instruction, date: string): Promise<Conflict[]> {
    const others = this.s.instructions.filter(
      (i) => i.topicId === inst.topicId && i.id !== inst.id && i.status === 'active' && i.memoId !== inst.memoId,
    );
    const out: Conflict[] = [];
    for (const other of others) {
      const c = await classifyPair(this.view(other), this.view(inst));
      const conflict: Conflict = {
        id: this.store.id('c'),
        topicId: inst.topicId!,
        a: other.id,
        b: inst.id,
        kind: c.kind,
        reason: c.reason,
        status: c.kind === 'contradiction' ? 'open' : 'info',
      };
      if (c.kind === 'update') other.status = 'superseded';
      if (c.kind === 'contradiction') {
        const s = await suggestWhomToAsk(this.view(other), this.view(inst), c.reason, this.s.persons, date);
        conflict.suggestion = { ...s, askPersonId: this.store.person(s.askPersonId) ? s.askPersonId : null };
      }
      this.s.conflicts.push(conflict);
      out.push(conflict);
    }
    return out;
  }

  // ---------- #8 答えの反映 ----------

  async answer(conflictId: string, text: string, answeredBy?: string, date = today()): Promise<Conflict> {
    const c = this.store.conflict(conflictId);
    const a = this.store.instruction(c.a);
    const b = this.store.instruction(c.b);
    const who = answeredBy ?? c.suggestion?.askName ?? '確認した相手';
    const r = await resolveWithAnswer(this.view(a), this.view(b), text, who);

    const memo: Memo = { id: this.store.id('m'), kind: 'text', text, date, createdAt: new Date().toISOString() };
    this.s.memos.push(memo);
    const resolution: Conflict['resolution'] = { outcome: r.outcome, note: r.note, answerMemoId: memo.id };

    switch (r.outcome) {
      case 'adopt_a':
        b.status = 'rejected';
        a.status = 'active';
        break;
      case 'adopt_b':
        a.status = 'rejected';
        b.status = 'active';
        break;
      case 'new': {
        const person = matchExactly(who, this.s.persons);
        const inst: Instruction = {
          ...b,
          id: this.store.id('i'),
          memoId: memo.id,
          value: r.newValue ?? b.value,
          condition: null,
          speakerMention: who,
          personId: person?.id ?? null,
          date,
          source: 'oral',
          quote: text,
          status: 'active',
        };
        this.s.instructions.push(inst);
        a.status = 'superseded';
        b.status = 'superseded';
        resolution.newInstructionId = inst.id;
        break;
      }
      case 'both_conditional':
        a.condition = r.conditionA ?? a.condition;
        b.condition = r.conditionB ?? b.condition;
        break;
      case 'unclear':
        break;
    }
    c.resolution = resolution;
    if (r.outcome !== 'unclear') c.status = 'resolved';
    this.store.save();
    return c;
  }

  // ---------- #7 出力形式 ----------

  async outputFormat(topicId?: string) {
    const insts = this.s.instructions.filter((i) => i.status === 'active' && (!topicId || i.topicId === topicId));
    const kinds = [...new Set(insts.map((i) => this.s.memos.find((m) => m.id === i.memoId)?.kind ?? 'text'))];
    return chooseOutputFormat(kinds, insts.map((i) => `- ${instructionText(i)}`).join('\n'));
  }

  // ---------- 表示用 ----------

  /** 話題ごとの「今の正解」と未解決の食い違い */
  summary() {
    return this.s.topics.map((t) => ({
      topic: t.name,
      current: this.s.instructions
        .filter((i) => i.topicId === t.id && i.status === 'active')
        .map((i) => ({ id: i.id, text: instructionText(i), condition: i.condition, by: this.store.label(i.personId, i.speakerMention), date: i.date })),
      openConflicts: this.s.conflicts.filter((c) => c.topicId === t.id && c.status === 'open').map((c) => c.id),
    }));
  }
}
