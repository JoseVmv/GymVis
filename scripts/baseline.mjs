/**
 * Rede de segurança da migração para o Supabase.
 *
 *   node scripts/baseline.mjs capture <pasta>
 *   node scripts/baseline.mjs diff <pastaA> <pastaB>
 *
 * Captura a resposta de todas as rotas de leitura da API e grava uma por
 * arquivo. Depois da migração, capture de novo e compare: qualquer diferença
 * fora dos campos normalizados é uma métrica que mudou de valor.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.GYMVIS_API ?? 'http://localhost:3001';
const EMAIL = process.env.GYMVIS_EMAIL ?? 'demo@gymvis.app';
const SENHA = process.env.GYMVIS_SENHA ?? 'demo1234';

/** Campos que mudam a cada execução sem indicar erro. */
const VOLATEIS = new Set(['generatedAt']);

/**
 * Com --ordenado, listas de objetos com `id` são ordenadas por id antes de
 * comparar. Serve para separar diferença de CONTEÚDO de diferença de ORDEM:
 * a ordenação de nomes mudou de propósito na migração (o SQLite comparava
 * bytes; o Postgres usa a collation pt-BR, em que "Jéssica" vem antes de
 * "Juliana", como um brasileiro espera).
 */
const ORDENAR = process.argv.includes('--ordenado');

function normalizar(valor) {
  if (Array.isArray(valor)) {
    const itens = valor.map(normalizar);
    if (ORDENAR && itens.length > 1 && itens.every((x) => x && typeof x === 'object' && 'id' in x)) {
      itens.sort((a, b) => a.id - b.id);
    }
    return itens;
  }
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const chave of Object.keys(valor).sort()) {
      if (VOLATEIS.has(chave)) continue;
      saida[chave] = normalizar(valor[chave]);
    }
    return saida;
  }
  return valor;
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, senha: SENHA }),
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status}`);
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('login não devolveu cookie de sessão');
  return cookie.split(';')[0];
}

async function obter(cookie, rota) {
  const res = await fetch(`${BASE}/api${rota}`, { headers: { cookie } });
  if (!res.ok) throw new Error(`${rota} devolveu ${res.status}`);
  return res.json();
}

const nomeArquivo = (rota) =>
  rota.replace(/^\//, '').replace(/[/?=&]/g, '_') + '.json';

async function capturar(destino) {
  const cookie = await login();
  mkdirSync(destino, { recursive: true });

  const rotas = [
    '/config',
    '/settings',
    '/overview?period=7',
    '/overview?period=30',
    '/overview?period=90',
    '/alerts',
    '/charts',
    '/revenue-at-risk',
    '/students',
    '/retention',
    '/finance?months=6',
    '/finance?months=12',
    '/finance?months=24',
  ];

  // Amostra estável de perfis: os cinco menores ids da academia.
  const lista = await obter(cookie, '/students');
  const amostra = lista.students
    .map((s) => s.id)
    .sort((a, b) => a - b)
    .slice(0, 5);
  for (const id of amostra) rotas.push(`/students/${id}`);

  let total = 0;
  for (const rota of rotas) {
    const corpo = normalizar(await obter(cookie, rota));
    writeFileSync(path.join(destino, nomeArquivo(rota)), JSON.stringify(corpo, null, 1));
    total++;
  }
  console.log(`capturadas ${total} rotas em ${destino}`);
  console.log(`amostra de perfis: ${amostra.join(', ')}`);
}

/** Caminhos com diferença entre dois valores já normalizados. */
function diferencas(a, b, caminho = '', achados = []) {
  if (achados.length >= 40) return achados;
  const tipoA = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a;
  const tipoB = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;

  if (tipoA !== tipoB) {
    achados.push(`${caminho}: tipo ${tipoA} -> ${tipoB}`);
    return achados;
  }
  if (tipoA === 'array') {
    if (a.length !== b.length) {
      achados.push(`${caminho}: ${a.length} itens -> ${b.length} itens`);
      return achados;
    }
    for (let i = 0; i < a.length; i++) diferencas(a[i], b[i], `${caminho}[${i}]`, achados);
    return achados;
  }
  if (tipoA === 'object') {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const chave of chaves) {
      if (!(chave in a)) achados.push(`${caminho}.${chave}: ausente no primeiro`);
      else if (!(chave in b)) achados.push(`${caminho}.${chave}: ausente no segundo`);
      else diferencas(a[chave], b[chave], `${caminho}.${chave}`, achados);
    }
    return achados;
  }
  if (a !== b) achados.push(`${caminho}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return achados;
}

function comparar(dirA, dirB) {
  const arquivosA = readdirSync(dirA).filter((f) => f.endsWith('.json')).sort();
  const arquivosB = new Set(readdirSync(dirB).filter((f) => f.endsWith('.json')));

  let arquivosComDiferenca = 0;
  let totalDiferencas = 0;

  for (const arquivo of arquivosA) {
    if (!arquivosB.has(arquivo)) {
      console.log(`FALTA  ${arquivo} (ausente em ${dirB})`);
      arquivosComDiferenca++;
      continue;
    }
    const a = JSON.parse(readFileSync(path.join(dirA, arquivo), 'utf8'));
    const b = JSON.parse(readFileSync(path.join(dirB, arquivo), 'utf8'));
    const achados = diferencas(a, b);
    if (achados.length === 0) continue;
    arquivosComDiferenca++;
    totalDiferencas += achados.length;
    console.log(`DIFERE ${arquivo}`);
    for (const linha of achados.slice(0, 8)) console.log(`         ${linha}`);
    if (achados.length > 8) console.log(`         ... e mais ${achados.length - 8}`);
  }

  console.log('');
  if (arquivosComDiferenca === 0) {
    console.log(`OK: ${arquivosA.length} rotas idênticas.`);
    process.exit(0);
  }
  console.log(`${arquivosComDiferenca} de ${arquivosA.length} rotas com diferença (${totalDiferencas} campos).`);
  process.exit(1);
}

const [comando, arg1, arg2] = process.argv.slice(2);
if (comando === 'capture' && arg1) await capturar(arg1);
else if (comando === 'diff' && arg1 && arg2) comparar(arg1, arg2);
else {
  console.error('uso: baseline.mjs capture <pasta> | diff <pastaA> <pastaB>');
  process.exit(2);
}
