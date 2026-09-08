import path from 'node:path'; import process from 'node:process'; import postgres from 'postgres';
process.loadEnvFile(path.resolve('.env'));
const id = Number(process.argv[2]);
if (!Number.isInteger(id)) { console.error('uso: _remover-academia.mjs <id>'); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });
const [a] = await sql`select nome from academies where id = ${id}`;
if (!a) { console.log('academia não encontrada'); await sql.end(); process.exit(0); }
await sql.begin(async (tx) => {
  await tx`delete from access_events where academy_id = ${id}`;
  await tx`update students set promocao_id = null where academy_id = ${id}`;
  await tx`delete from students where academy_id = ${id}`;
  await tx`delete from promotions where academy_id = ${id}`;
  await tx`delete from plans where academy_id = ${id}`;
  await tx`delete from expenses where academy_id = ${id}`;
  await tx`delete from academy_settings where academy_id = ${id}`;
  await tx`delete from sessions where user_id in (select id from users where academy_id = ${id})`;
  await tx`delete from users where academy_id = ${id}`;
  await tx`delete from academies where id = ${id}`;
});
console.log(`academia ${id} "${a.nome}" removida por completo.`);
const restantes = await sql`
  select a.id, a.nome,
    (select count(*) from students s where s.academy_id = a.id) as alunos,
    (select count(*) from access_events e where e.academy_id = a.id) as eventos
  from academies a order by a.id`;
console.log('\nacademias restantes:');
for (const r of restantes) console.log(`  ${r.id}  ${r.nome.padEnd(24)} ${r.alunos} alunos, ${Number(r.eventos).toLocaleString('pt-BR')} eventos`);
await sql.end();
