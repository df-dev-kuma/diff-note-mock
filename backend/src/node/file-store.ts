/** Node 専用: 状態を JSON ファイルに保存するストア */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Store, type State } from '../store.ts';

export function fileStore(file: string): Store {
  const initial = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as State) : undefined;
  return new Store(initial, (state) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2));
  });
}
