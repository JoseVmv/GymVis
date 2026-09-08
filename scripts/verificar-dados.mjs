import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';
process.loadEnvFile(path.resolve('.env'));

const lite = new Database(path.resolve('data/gym.db'), { readonly: true });
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });

const TAB = {
  academies: ['id','nome','created_at'],
  users: ['id','academy_id','nome','email','password_hash','created_at'],
  plans: ['id','academy_id','nome','valor_centavos','duracao_meses'],
  promotions: ['id','academy_id','nome','desconto_centavos','ativa','created_at'],
  students: ['id','academy_id','plano_id','promocao_id','nome','email','telefone','data_entrada','data_saida','status','mensalidade_centavos'],
  expenses: ['id','academy_id','descricao','categoria','valor_centavos','data','created_at'],
  access_events: ['id','academy_id','aluno_id','timestamp','tipo_evento'],
};

const norm = (v) => (v === null || v === undefined ? '\u0000' : v === true ? '1' : v === false ? '0' : String(v));
const hashOf = (linhas, cols) => {
  const h = crypto.createHash('sha256');
  for (const l of linhas) h.update(cols.map((c) => norm(l[c])).join('\u001f') + '\u001e');
  return h.digest('hex').slice(0, 16);
};

let tudoIgual = true;
console.log('tabela'.padEnd(18), 'linhas'.padStart(9), '  sqlite'.padEnd(18), 'postgres');
for (const [tabela, cols] of Object.entries(TAB)) {
  const pcols = cols.map((c) => (c === 'timestamp' ? '"timestamp"' : c));
  const a = lite.prepare(`SELECT ${cols.join(',')} FROM ${tabela} ORDER BY ${cols[0]}`).all();
  const b = await sql.unsafe(`SELECT ${pcols.join(',')} FROM ${tabela} ORDER BY ${cols[0]}`);
  const ha = hashOf(a, cols), hb = hashOf(b, cols);
  const igual = a.length === b.length && ha === hb;
  if (!igual) tudoIgual = false;
  console.log(
    tabela.padEnd(18),
    String(a.length).padStart(9),
    ('  ' + ha).padEnd(18),
    hb,
    igual ? 'OK' : '<<< DIFERE',
  );
}
console.log('\n' + (tudoIgual ? 'Os dados no Postgres são idênticos aos do SQLite.' : 'HÁ DIVERGÊNCIA DE DADOS.'));
lite.close(); await sql.end();
