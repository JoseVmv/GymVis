import type { RiskLevel, StudentStatus } from '@gymvis/shared';
import { classifyRisk, riskConfig } from '../config/risk';
import { sqlite } from '../db/client';
import { MS_PER_DAY, calendarDaysBetween, floorDaysBetween, parseDateStr } from '../lib/dates';
import { getRiskRules } from './settings';

/**
 * Métricas derivadas por aluno — implementação única usada por students,
 * alerts, revenue-at-risk e riskDistribution. Conta apenas eventos
 * tipo_evento = 'entrada'.
 */

export interface StudentMetrics {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  status: StudentStatus;
  planoId: number;
  planoNome: string;
  promocaoId: number | null;
  promocaoNome: string | null;
  mensalidadeCentavos: number;
  dataEntrada: string;
  dataSaida: string | null;
  lastAccessAt: number | null;
  daysSinceLastAccess: number | null;
  daysSinceJoin: number;
  baselineWeekly: number | null;
  recentWeekly: number;
  variation: number | null;
  risk: RiskLevel | null;
  riskReasons: string[];
}

/** Matriculado = ativo ou inadimplente. */
export function isEnrolled(status: StudentStatus): boolean {
  return status === 'ativo' || status === 'inadimplente';
}

/** Dias efetivos sem acesso: desde a entrada quando nunca acessou. */
export function effectiveDaysWithoutAccess(m: StudentMetrics): number {
  return m.daysSinceLastAccess ?? m.daysSinceJoin;
}

interface StudentRow {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  status: StudentStatus;
  data_entrada: string;
  data_saida: string | null;
  mensalidade_centavos: number;
  plano_id: number;
  plano_nome: string;
  promocao_id: number | null;
  promocao_nome: string | null;
}

const studentsStmt = sqlite.prepare(`
  SELECT s.id, s.nome, s.email, s.telefone, s.status, s.data_entrada, s.data_saida,
         s.mensalidade_centavos, s.plano_id, p.nome AS plano_nome,
         s.promocao_id, pr.nome AS promocao_nome
  FROM students s
  JOIN plans p ON p.id = s.plano_id
  LEFT JOIN promotions pr ON pr.id = s.promocao_id
  WHERE s.academy_id = ?
  ORDER BY s.nome COLLATE NOCASE
`);

const lastAccessStmt = sqlite.prepare(`
  SELECT aluno_id, MAX(timestamp) AS last_ts
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada'
  GROUP BY aluno_id
`);

const recentCountStmt = sqlite.prepare(`
  SELECT aluno_id, COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ?
  GROUP BY aluno_id
`);

const baselineCountStmt = sqlite.prepare(`
  SELECT aluno_id, COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ? AND timestamp < ?
  GROUP BY aluno_id
`);

const enrolledCountAtStmt = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM students
  WHERE academy_id = ? AND data_entrada <= ? AND (data_saida IS NULL OR data_saida > ?)
`);

/**
 * Quantos alunos estavam matriculados na data `dateStr` ('YYYY-MM-DD'),
 * pelas datas de entrada e saída. É a única contagem possível para o passado
 * (o banco guarda o status atual, não seu histórico) e serve de denominador
 * para métricas de frequência comparáveis entre períodos.
 */
export function enrolledCountAt(academyId: number, dateStr: string): number {
  return (enrolledCountAtStmt.get(academyId, dateStr, dateStr) as { c: number }).c;
}

export function computeStudentMetrics(academyId: number, now = new Date()): StudentMetrics[] {
  const rules = getRiskRules(academyId);
  const nowMs = now.getTime();
  const recentStartMs = nowMs - riskConfig.recentWindowDays * MS_PER_DAY;
  const baselineStartMs = recentStartMs - riskConfig.baselineWindowDays * MS_PER_DAY;
  const recentWeeks = riskConfig.recentWindowDays / 7;

  const rows = studentsStmt.all(academyId) as StudentRow[];

  const lastAccess = new Map<number, number>();
  for (const r of lastAccessStmt.all(academyId) as { aluno_id: number; last_ts: number }[]) {
    lastAccess.set(r.aluno_id, r.last_ts);
  }
  const recentCounts = new Map<number, number>();
  for (const r of recentCountStmt.all(academyId, recentStartMs) as {
    aluno_id: number;
    c: number;
  }[]) {
    recentCounts.set(r.aluno_id, r.c);
  }
  const baselineCounts = new Map<number, number>();
  for (const r of baselineCountStmt.all(academyId, baselineStartMs, recentStartMs) as {
    aluno_id: number;
    c: number;
  }[]) {
    baselineCounts.set(r.aluno_id, r.c);
  }

  return rows.map((row) => {
    const entryMs = parseDateStr(row.data_entrada).getTime();
    const daysSinceJoin = Math.max(0, calendarDaysBetween(entryMs, nowMs));

    const lastAccessAt = lastAccess.get(row.id) ?? null;
    const daysSinceLastAccess =
      lastAccessAt === null ? null : Math.max(0, calendarDaysBetween(lastAccessAt, nowMs));

    const recentWeekly = (recentCounts.get(row.id) ?? 0) / recentWeeks;

    // Baseline: janela [now-208d, now-28d) limitada pela data de entrada.
    const baselineDays = Math.min(
      riskConfig.baselineWindowDays,
      floorDaysBetween(entryMs, recentStartMs),
    );
    const baselineWeeks = baselineDays / 7;
    const baselineWeekly =
      baselineWeeks < riskConfig.minBaselineWeeks
        ? null
        : (baselineCounts.get(row.id) ?? 0) / baselineWeeks;

    const variation =
      baselineWeekly !== null && baselineWeekly > 0
        ? (recentWeekly - baselineWeekly) / baselineWeekly
        : null;

    const { level, reasons } = classifyRisk(
      {
        status: row.status,
        daysSinceLastAccess,
        daysSinceJoin,
        baselineWeekly,
        recentWeekly,
      },
      rules,
    );

    return {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      status: row.status,
      planoId: row.plano_id,
      planoNome: row.plano_nome,
      promocaoId: row.promocao_id,
      promocaoNome: row.promocao_nome,
      mensalidadeCentavos: row.mensalidade_centavos,
      dataEntrada: row.data_entrada,
      dataSaida: row.data_saida,
      lastAccessAt,
      daysSinceLastAccess,
      daysSinceJoin,
      baselineWeekly,
      recentWeekly,
      variation,
      risk: level,
      riskReasons: reasons,
    };
  });
}
