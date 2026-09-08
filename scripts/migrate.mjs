/**
 * Aplica os arquivos SQL de server/migrations em ordem.
 * Cada arquivo roda uma vez; o que já rodou fica registrado em schema_migrations.
 *
 *   node --env-file=.env scripts/migrate.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const dir = path.resolve('server/migrations');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });

await sql`
  create table if not exists schema_migrations (
    nome text primary key,
    aplicada_em timestamptz not null default now()
  )`;

const aplicadas = new Set(
  (await sql`select nome from schema_migrations`).map((r) => r.nome),
);

const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let novas = 0;

for (const arquivo of arquivos) {
  if (aplicadas.has(arquivo)) {
    console.log(`  já aplicada  ${arquivo}`);
    continue;
  }
  const conteudo = readFileSync(path.join(dir, arquivo), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(conteudo);
    await tx`insert into schema_migrations (nome) values (${arquivo})`;
  });
  console.log(`  aplicada     ${arquivo}`);
  novas++;
}

console.log(novas === 0 ? 'Nada a aplicar.' : `${novas} migração(ões) aplicada(s).`);
await sql.end();
