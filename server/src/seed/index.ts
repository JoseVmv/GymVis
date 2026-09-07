/**
 * CLI de seed: cria (ou reutiliza) a academia de demonstração e gera os dados
 * fictícios. Uso, a partir de server/:
 *
 *   npm run seed [-- --students 800 --months 12 --seed 42]
 *
 * Idempotente: se o usuário demo já existe, os dados da academia são
 * removidos e regenerados; caso contrário, academia e usuário são criados.
 */
import { hashPassword } from '../auth/password';
import { sqlite } from '../db/client';
import { generateAcademyData } from './generator';

const DEMO_EMAIL = 'demo@gymvis.app';
const DEMO_SENHA = 'demo1234';
const DEMO_ACADEMIA = 'Academia Movimento';
const DEMO_USUARIO = 'Marina Duarte';

interface CliArgs {
  students: number;
  months: number;
  seed: number;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, number> = { students: 800, months: 12, seed: 42 };
  const limits: Record<string, readonly [number, number]> = {
    students: [100, 5000],
    months: [3, 24],
    seed: [0, 4294967295],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`Argumento inesperado: ${arg}`);
    let key = arg.slice(2);
    let raw: string | undefined;
    const eq = key.indexOf('=');
    if (eq >= 0) {
      raw = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else {
      raw = argv[++i];
    }
    if (!(key in values)) fail(`Opção desconhecida: --${key}`);
    if (raw === undefined || raw === '') fail(`Valor ausente para --${key}`);
    const n = Number(raw);
    if (!Number.isInteger(n)) fail(`Valor inválido para --${key}: ${raw}`);
    const [min, max] = limits[key];
    if (n < min || n > max) {
      fail(`Valor de --${key} fora do intervalo permitido (${min} a ${max}).`);
    }
    values[key] = n;
  }

  return { students: values.students, months: values.months, seed: values.seed };
}

function fmtDateMs(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const demoUser = sqlite
    .prepare('SELECT id, academy_id FROM users WHERE email = ?')
    .get(DEMO_EMAIL) as { id: number; academy_id: number } | undefined;

  let academyId: number;
  if (demoUser) {
    academyId = demoUser.academy_id;
    console.log(`Academia demo encontrada (id ${academyId}); dados anteriores serão substituídos.`);
  } else {
    const now = Date.now();
    const academy = sqlite
      .prepare('INSERT INTO academies (nome, created_at) VALUES (?, ?)')
      .run(DEMO_ACADEMIA, now);
    academyId = Number(academy.lastInsertRowid);
    sqlite
      .prepare(
        'INSERT INTO users (academy_id, nome, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(academyId, DEMO_USUARIO, DEMO_EMAIL, hashPassword(DEMO_SENHA), now);
    console.log(`Academia '${DEMO_ACADEMIA}' criada (id ${academyId}).`);
  }

  // Limpeza e regeneração na mesma transação: uma falha no meio não pode
  // deixar a academia demo vazia (better-sqlite3 aninha como savepoint).
  const reseed = sqlite.transaction((id: number) => {
    if (demoUser) {
      sqlite.prepare('DELETE FROM access_events WHERE academy_id = ?').run(id);
      sqlite.prepare('DELETE FROM students WHERE academy_id = ?').run(id);
      sqlite.prepare('DELETE FROM plans WHERE academy_id = ?').run(id);
      sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(demoUser.id);
    }
    return generateAcademyData({
      academyId: id,
      students: args.students,
      months: args.months,
      seed: args.seed,
    });
  });

  const result = reseed(academyId);

  const statusRows = sqlite
    .prepare(
      'SELECT status, COUNT(*) AS n FROM students WHERE academy_id = ? GROUP BY status ORDER BY n DESC',
    )
    .all(academyId) as { status: string; n: number }[];
  const planCount = (
    sqlite.prepare('SELECT COUNT(*) AS n FROM plans WHERE academy_id = ?').get(academyId) as {
      n: number;
    }
  ).n;
  const range = sqlite
    .prepare(
      'SELECT MIN(timestamp) AS minTs, MAX(timestamp) AS maxTs FROM access_events WHERE academy_id = ?',
    )
    .get(academyId) as { minTs: number | null; maxTs: number | null };

  console.log('');
  console.log('Resumo do seed');
  console.log(
    `  Parâmetros: ${args.students} alunos, ${args.months} meses de janela, seed ${args.seed}`,
  );
  console.log(`  Alunos gerados: ${result.students}`);
  console.log('  Alunos por status:');
  for (const row of statusRows) {
    console.log(`    ${row.status.padEnd(13)} ${String(row.n).padStart(5)}`);
  }
  console.log(`  Planos: ${planCount}`);
  console.log(`  Eventos de acesso: ${result.accessEvents}`);
  if (range.minTs !== null && range.maxTs !== null) {
    console.log(`  Período coberto: ${fmtDateMs(range.minTs)} a ${fmtDateMs(range.maxTs)}`);
  }
  console.log('');
  console.log('Credenciais de demonstração');
  console.log(`  E-mail: ${DEMO_EMAIL}`);
  console.log(`  Senha: ${DEMO_SENHA}`);
}

main();
