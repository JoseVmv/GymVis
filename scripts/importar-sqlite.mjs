/**
 * Move os dados do SQLite local para o Postgres do Supabase.
 *
 *   node scripts/importar-sqlite.mjs [--apagar-antes]
 *
 * Preserva os ids originais — é o que permite comparar as respostas da API
 * antes e depois da migração linha a linha. Como os ids vão explícitos, as
 * sequências precisam ser reposicionadas no fim: sem isso, o primeiro
 * cadastro manual colidiria com um id já existente.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

process.loadEnvFile(path.resolve('.env'));

const LOTE = 1000;
const apagarAntes = process.argv.includes('--apagar-antes');

const lite = new Database(path.resolve('data/gym.db'), { readonly: true });
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });

/** Ordem obedece às chaves estrangeiras. */
const TABELAS = [
  { nome: 'academies', colunas: ['id', 'nome', 'created_at'] },
  { nome: 'users', colunas: ['id', 'academy_id', 'nome', 'email', 'password_hash', 'created_at'] },
  { nome: 'plans', colunas: ['id', 'academy_id', 'nome', 'valor_centavos', 'duracao_meses'] },
  {
    nome: 'promotions',
    colunas: ['id', 'academy_id', 'nome', 'desconto_centavos', 'ativa', 'created_at'],
    booleanas: ['ativa'],
  },
  {
    nome: 'students',
    colunas: [
      'id', 'academy_id', 'plano_id', 'promocao_id', 'nome', 'email', 'telefone',
      'data_entrada', 'data_saida', 'status', 'mensalidade_centavos',
    ],
  },
  {
    nome: 'expenses',
    colunas: ['id', 'academy_id', 'descricao', 'categoria', 'valor_centavos', 'data', 'created_at'],
  },
  {
    nome: 'academy_settings',
    colunas: [
      'academy_id', 'inactivity_medium', 'inactivity_high', 'inactivity_critical',
      'frequency_drop_medium', 'frequency_drop_high', 'updated_at',
    ],
  },
  { nome: 'access_events', colunas: ['id', 'academy_id', 'aluno_id', 'timestamp', 'tipo_evento'] },
];

if (apagarAntes) {
  console.log('Limpando as tabelas de destino...');
  for (const t of [...TABELAS].reverse()) {
    await sql.unsafe(`DELETE FROM ${t.nome}`);
  }
  await sql.unsafe('DELETE FROM sessions');
}

let totalLinhas = 0;

for (const t of TABELAS) {
  const cols = t.colunas.map((c) => (c === 'timestamp' ? '"timestamp"' : c));
  const linhas = lite.prepare(`SELECT ${t.colunas.join(', ')} FROM ${t.nome}`).all();
  if (linhas.length === 0) {
    console.log(`  ${t.nome.padEnd(18)} 0`);
    continue;
  }

  for (let i = 0; i < linhas.length; i += LOTE) {
    const fatia = linhas.slice(i, i + LOTE);
    const params = [];
    const valores = fatia
      .map((linha) => {
        const marcas = t.colunas.map((c) => {
          let v = linha[c];
          // No SQLite o booleano era 0/1; no Postgres a coluna é boolean.
          if (t.booleanas?.includes(c)) v = v === 1 || v === true;
          params.push(v);
          return `$${params.length}`;
        });
        return `(${marcas.join(', ')})`;
      })
      .join(', ');
    await sql.unsafe(
      `INSERT INTO ${t.nome} (${cols.join(', ')}) VALUES ${valores}`,
      params,
    );
  }
  totalLinhas += linhas.length;
  console.log(`  ${t.nome.padEnd(18)} ${linhas.length.toLocaleString('pt-BR')}`);
}

// Reposiciona as sequências das colunas identity.
console.log('\nAjustando sequências...');
for (const t of TABELAS) {
  if (!t.colunas.includes('id')) continue;
  const [r] = await sql.unsafe(`
    SELECT setval(
      pg_get_serial_sequence('${t.nome}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${t.nome}), 0) + 1,
      false
    ) AS proximo`);
  console.log(`  ${t.nome.padEnd(18)} próximo id = ${r.proximo}`);
}

console.log(`\n${totalLinhas.toLocaleString('pt-BR')} linhas importadas.`);
lite.close();
await sql.end();
