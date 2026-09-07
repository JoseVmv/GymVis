import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

/** data/gym.db na raiz do repositório (sobrescreva com GYMVIS_DB_PATH). */
export const dbPath =
  process.env.GYMVIS_DB_PATH ?? path.resolve(here, '../../../data/gym.db');

mkdirSync(path.dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

// DDL idempotente, espelho de ./schema.ts — alterou lá, altere aqui.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS academies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  nome TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_academy_idx ON plans(academy_id);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  plano_id INTEGER NOT NULL REFERENCES plans(id),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  data_entrada TEXT NOT NULL,
  data_saida TEXT,
  status TEXT NOT NULL,
  mensalidade_centavos INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS students_academy_idx ON students(academy_id);
CREATE INDEX IF NOT EXISTS students_academy_status_idx ON students(academy_id, status);

CREATE TABLE IF NOT EXISTS access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  aluno_id INTEGER NOT NULL REFERENCES students(id),
  timestamp INTEGER NOT NULL,
  tipo_evento TEXT NOT NULL DEFAULT 'entrada'
);
CREATE INDEX IF NOT EXISTS access_aluno_ts_idx ON access_events(aluno_id, timestamp);
CREATE INDEX IF NOT EXISTS access_academy_ts_idx ON access_events(academy_id, timestamp);
`);
