/** Node 専用: backend/.env を読み込む。エントリポイントの最初で import する */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
