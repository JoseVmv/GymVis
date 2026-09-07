import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Esquema declarativo do banco — a descrição de referência das tabelas.
 *
 * As consultas são SQL cru via better-sqlite3 (síncrono, direto, adequado ao
 * tamanho deste MVP); este arquivo existe como espelho tipado do DDL em
 * ./client.ts e como ponto de partida da migração para PostgreSQL/Supabase,
 * onde basta trocar o dialeto do Drizzle: chaves inteiras (→ identity),
 * timestamps em epoch ms (→ timestamptz/bigint), datas de calendário como
 * 'YYYY-MM-DD' (→ date), dinheiro em centavos (→ integer).
 *
 * Os eventos de acesso são a fonte de verdade: frequência, risco e receita em
 * risco são sempre derivados — nada disso é persistido.
 */

export const academies = sqliteTable('academies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    nome: text('nome').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const plans = sqliteTable(
  'plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    nome: text('nome').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
  },
  (t) => [index('plans_academy_idx').on(t.academyId)],
);

export const students = sqliteTable(
  'students',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    planoId: integer('plano_id')
      .notNull()
      .references(() => plans.id),
    nome: text('nome').notNull(),
    email: text('email'),
    telefone: text('telefone'),
    /** 'YYYY-MM-DD' */
    dataEntrada: text('data_entrada').notNull(),
    /** 'YYYY-MM-DD' — null enquanto matriculado */
    dataSaida: text('data_saida'),
    /** 'ativo' | 'pausado' | 'cancelado' | 'inadimplente' */
    status: text('status').notNull(),
    mensalidadeCentavos: integer('mensalidade_centavos').notNull(),
  },
  (t) => [
    index('students_academy_idx').on(t.academyId),
    index('students_academy_status_idx').on(t.academyId, t.status),
  ],
);

export const accessEvents = sqliteTable(
  'access_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    alunoId: integer('aluno_id')
      .notNull()
      .references(() => students.id),
    /** epoch ms */
    timestamp: integer('timestamp').notNull(),
    /** 'entrada' | 'saida' */
    tipoEvento: text('tipo_evento').notNull().default('entrada'),
  },
  (t) => [
    index('access_aluno_ts_idx').on(t.alunoId, t.timestamp),
    index('access_academy_ts_idx').on(t.academyId, t.timestamp),
  ],
);
