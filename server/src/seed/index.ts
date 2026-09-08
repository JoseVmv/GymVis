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
import { db, fecharConexao } from '../db/client';
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const demoUser = await db.one<{ id: number; academy_id: number }>(
    'SELECT id, academy_id FROM users WHERE email = ?',
    DEMO_EMAIL,
  );

  let academyId: number;
  if (demoUser) {
    academyId = demoUser.academy_id;
    console.log(`Academia demo encontrada (id ${academyId}); dados anteriores serão substituídos.`);
  } else {
    const now = Date.now();
    const academia = await db.one<{ id: number }>(
      'INSERT INTO academies (nome, created_at) VALUES (?, ?) RETURNING id',
      DEMO_ACADEMIA,
      now,
    );
    academyId = academia!.id;
    await db.run(
      'INSERT INTO users (academy_id, nome, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      academyId,
      DEMO_USUARIO,
      DEMO_EMAIL,
      hashPassword(DEMO_SENHA),
      now,
    );
    console.log(`Academia '${DEMO_ACADEMIA}' criada (id ${academyId}).`);
  }

  // A limpeza vai antes da geração. O gerador abre a própria transação, então
  // os DELETEs ficam em outra: se a geração falhar, rode o seed de novo.
  if (demoUser) {
    await db.run('DELETE FROM access_events WHERE academy_id = ?', academyId);
    await db.run('UPDATE students SET promocao_id = NULL WHERE academy_id = ?', academyId);
    await db.run('DELETE FROM students WHERE academy_id = ?', academyId);
    await db.run('DELETE FROM promotions WHERE academy_id = ?', academyId);
    await db.run('DELETE FROM plans WHERE academy_id = ?', academyId);
    await db.run('DELETE FROM expenses WHERE academy_id = ?', academyId);
    await db.run('DELETE FROM sessions WHERE user_id = ?', demoUser.id);
  }

  const result = await generateAcademyData({
    academyId,
    students: args.students,
    months: args.months,
    seed: args.seed,
  });

  const statusRows = await db.all<{ status: string; n: number }>(
    'SELECT status, COUNT(*) AS n FROM students WHERE academy_id = ? GROUP BY status ORDER BY n DESC',
    academyId,
  );
  const planRow = await db.one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM plans WHERE academy_id = ?',
    academyId,
  );
  const planCount = planRow?.n ?? 0;
  const range = (await db.one<{ mints: number | null; maxts: number | null }>(
    'SELECT MIN(timestamp) AS minTs, MAX(timestamp) AS maxTs FROM access_events WHERE academy_id = ?',
    academyId,
  ))!;

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
  if (range.mints !== null && range.maxts !== null) {
    console.log(`  Período coberto: ${fmtDateMs(range.mints)} a ${fmtDateMs(range.maxts)}`);
  }
  console.log('');
  console.log('Credenciais de demonstração');
  console.log(`  E-mail: ${DEMO_EMAIL}`);
  console.log(`  Senha: ${DEMO_SENHA}`);
}

await main();
await fecharConexao();
