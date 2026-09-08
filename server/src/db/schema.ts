import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Esquema declarativo do banco — a descrição de referência das tabelas.
 *
 * As consultas são SQL cru via postgres.js; este arquivo é o espelho tipado
 * do DDL versionado em ../../migrations/. Ainda está em `sqlite-core`: ao
 * portá-lo para `pg-core` ele passa a servir também de fonte para geração
 * automática de migrações. Enquanto isso, a fonte da verdade do schema são
 * os arquivos SQL de migrations/.
 *
 * Convenções: chaves em bigint identity, instantes em epoch ms (bigint),
 * datas de calendário como texto 'YYYY-MM-DD' e dinheiro em centavos.
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
    /** Meses cobrados de uma vez: 1 = mensal, 12 = anual. */
    duracaoMeses: integer('duracao_meses').notNull().default(1),
  },
  (t) => [index('plans_academy_idx').on(t.academyId)],
);

export const promotions = sqliteTable(
  'promotions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    nome: text('nome').notNull(),
    descontoCentavos: integer('desconto_centavos').notNull().default(0),
    ativa: integer('ativa').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('promotions_academy_idx').on(t.academyId)],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academyId: integer('academy_id')
      .notNull()
      .references(() => academies.id),
    descricao: text('descricao').notNull(),
    categoria: text('categoria').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    /** 'YYYY-MM-DD' */
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('expenses_academy_data_idx').on(t.academyId, t.data)],
);

/** Limiares de risco por academia; ausente = padrões de config/risk.ts. */
export const academySettings = sqliteTable('academy_settings', {
  academyId: integer('academy_id')
    .primaryKey()
    .references(() => academies.id),
  inactivityMedium: integer('inactivity_medium').notNull(),
  inactivityHigh: integer('inactivity_high').notNull(),
  inactivityCritical: integer('inactivity_critical').notNull(),
  frequencyDropMedium: real('frequency_drop_medium').notNull(),
  frequencyDropHigh: real('frequency_drop_high').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

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
    promocaoId: integer('promocao_id').references(() => promotions.id),
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
