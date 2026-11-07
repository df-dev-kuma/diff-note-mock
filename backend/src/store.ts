import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Conflict, Instruction, Memo, Person, Topic } from './types.ts';

export interface State {
  memos: Memo[];
  persons: Person[];
  instructions: Instruction[];
  topics: Topic[];
  conflicts: Conflict[];
  seq: number;
}

const empty = (): State => ({ memos: [], persons: [], instructions: [], topics: [], conflicts: [], seq: 0 });

/** メモリ上のストア。file を渡すと JSON に保存する（本番の DB は未定） */
export class Store {
  state: State;

  constructor(private file?: string) {
    this.state = file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as State) : empty();
  }

  id(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}${this.state.seq}`;
  }

  save(): void {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  reset(): void {
    this.state = empty();
    this.save();
  }

  person(id: string | null | undefined): Person | undefined {
    return this.state.persons.find((p) => p.id === id);
  }

  instruction(id: string): Instruction {
    const i = this.state.instructions.find((x) => x.id === id);
    if (!i) throw new Error(`指示 ${id} が見つかりません`);
    return i;
  }

  topic(id: string | null): Topic | undefined {
    return this.state.topics.find((t) => t.id === id);
  }

  conflict(id: string): Conflict {
    const c = this.state.conflicts.find((x) => x.id === id);
    if (!c) throw new Error(`食い違い ${id} が見つかりません`);
    return c;
  }

  addPerson(name: string, role: string | null, aliases: string[] = [], roleConfirmed = true): Person {
    const p: Person = { id: this.id('p'), name, role, aliases, roleConfirmed };
    this.state.persons.push(p);
    return p;
  }

  /** 人の表示名（役職つき） */
  label(personId: string | null, fallback?: string | null): string {
    const p = this.person(personId);
    if (!p) return fallback ?? '不明';
    return p.role ? `${p.name}（${p.role}${p.roleConfirmed ? '' : '・推定'}）` : p.name;
  }
}
