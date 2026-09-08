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

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS expenses_academy_data_idx ON expenses(academy_id, data);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academy_id INTEGER NOT NULL REFERENCES academies(id),
  nome TEXT NOT NULL,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS promotions_academy_idx ON promotions(academy_id);

CREATE TABLE IF NOT EXISTS academy_settings (
  academy_id INTEGER PRIMARY KEY REFERENCES academies(id),
  inactivity_medium INTEGER NOT NULL,
  inactivity_high INTEGER NOT NULL,
  inactivity_critical INTEGER NOT NULL,
  frequency_drop_medium REAL NOT NULL,
  frequency_drop_high REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

/**
 * Migrações aditivas de colunas. O SQLite não tem ADD COLUMN IF NOT EXISTS,
 * então a existência é checada antes — mantém bancos antigos utilizáveis.
 */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = sqlite.pragma(`table_info(${table})`) as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('students', 'promocao_id', 'INTEGER REFERENCES promotions(id)');
addColumnIfMissing('plans', 'duracao_meses', 'INTEGER NOT NULL DEFAULT 1');
