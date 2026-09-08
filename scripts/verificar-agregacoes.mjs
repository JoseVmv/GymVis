/**
 * Roda as MESMAS agregações do motor de métricas nos dois bancos, com um
 * instante fixo. Se baterem, a diferença vista pela API é só a passagem do
 * tempo entre as duas capturas, não a migração.
 */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';
process.loadEnvFile(path.resolve('.env'));

const AGORA = 1788800000000; // instante fixo, igual para os dois bancos
const DIA = 86400000;
const recenteIni = AGORA - 28 * DIA;
const baseIni = recenteIni - 180 * DIA;

const lite = new Database(path.resolve('data/gym.db'), { readonly: true });
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });

const h = (linhas) => {
  const x = crypto.createHash('sha256');
  for (const l of linhas) x.update(Object.values(l).map((v) => (v === null ? '~' : String(v))).join('|') + ';');
  return x.digest('hex').slice(0, 16);
};

const CASOS = [
  ['último acesso por aluno',
   "SELECT aluno_id, MAX(timestamp) AS t FROM access_events WHERE academy_id=1 AND tipo_evento='entrada' GROUP BY aluno_id ORDER BY aluno_id"],
  ['acessos recentes por aluno (28d)',
   `SELECT aluno_id, COUNT(*) AS c FROM access_events WHERE academy_id=1 AND tipo_evento='entrada' AND timestamp >= ${recenteIni} GROUP BY aluno_id ORDER BY aluno_id`],
  ['acessos do baseline por aluno',
   `SELECT aluno_id, COUNT(*) AS c FROM access_events WHERE academy_id=1 AND tipo_evento='entrada' AND timestamp >= ${baseIni} AND timestamp < ${recenteIni} GROUP BY aluno_id ORDER BY aluno_id`],
  ['acessos na janela de 30 dias',
   `SELECT COUNT(*) AS c FROM access_events WHERE academy_id=1 AND tipo_evento='entrada' AND timestamp >= ${AGORA - 30 * DIA} AND timestamp < ${AGORA}`],
  ['matriculados em 2026-08-01',
   "SELECT COUNT(*) AS c FROM students WHERE academy_id=1 AND data_entrada <= '2026-08-01' AND (data_saida IS NULL OR data_saida > '2026-08-01')"],
  ['alunos por status',
   'SELECT status, COUNT(*) AS c FROM students WHERE academy_id=1 GROUP BY status ORDER BY status'],
  ['entradas por mês',
   "SELECT substr(data_entrada,1,7) AS m, COUNT(*) AS c FROM students WHERE academy_id=1 GROUP BY 1 ORDER BY 1"],
];

let todosIguais = true;
for (const [rotulo, q] of CASOS) {
  const a = lite.prepare(q).all();
  const b = (await sql.unsafe(q)).map((r) => ({ ...r }));
  const ha = h(a), hb = h(b);
  const ok = ha === hb && a.length === b.length;
  if (!ok) todosIguais = false;
  console.log((ok ? 'OK    ' : 'DIFERE') + '  ' + rotulo.padEnd(34) + String(a.length).padStart(5) + ' linhas   ' + ha + ' / ' + hb);
}
console.log('\n' + (todosIguais
  ? 'As agregações batem exatamente nos dois bancos com o mesmo instante.'
  : 'DIVERGÊNCIA REAL nas agregações.'));
lite.close(); await sql.end();
