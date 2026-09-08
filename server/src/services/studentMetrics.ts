import type { RiskLevel, StudentStatus } from '@gymvis/shared';
import { classifyRisk, riskConfig } from '../config/risk';
import { db } from '../db/client';
import { MS_PER_DAY, calendarDaysBetween, floorDaysBetween, parseDateStr } from '../lib/dates';
import { gravarCache, lerCache } from './metricsCache';
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

const ALUNOS = `
  SELECT s.id, s.nome, s.email, s.telefone, s.status, s.data_entrada, s.data_saida,
         s.mensalidade_centavos, s.plano_id, p.nome AS plano_nome,
         s.promocao_id, pr.nome AS promocao_nome
  FROM students s
  JOIN plans p ON p.id = s.plano_id
  LEFT JOIN promotions pr ON pr.id = s.promocao_id
  WHERE s.academy_id = ?
  ORDER BY lower(s.nome) COLLATE "pt-BR-x-icu", s.id
`;

const ULTIMO_ACESSO = `
  SELECT aluno_id, MAX(timestamp) AS last_ts
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada'
  GROUP BY aluno_id
`;

const CONTAGEM_RECENTE = `
  SELECT aluno_id, COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ?
  GROUP BY aluno_id
`;

const CONTAGEM_BASELINE = `
  SELECT aluno_id, COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ? AND timestamp < ?
  GROUP BY aluno_id
`;

const MATRICULADOS_EM = `
  SELECT COUNT(*) AS c
  FROM students
  WHERE academy_id = ? AND data_entrada <= ? AND (data_saida IS NULL OR data_saida > ?)
`;

/**
 * Quantos alunos estavam matriculados na data `dateStr` ('YYYY-MM-DD'),
 * pelas datas de entrada e saída. É a única contagem possível para o passado
 * (o banco guarda o status atual, não seu histórico) e serve de denominador
 * para métricas de frequência comparáveis entre períodos.
 */
export async function enrolledCountAt(academyId: number, dateStr: string): Promise<number> {
  const linha = await db.one<{ c: number }>(MATRICULADOS_EM, academyId, dateStr, dateStr);
  return linha?.c ?? 0;
}

export async function computeStudentMetrics(
  academyId: number,
  now = new Date(),
): Promise<StudentMetrics[]> {
  const cacheado = lerCache(academyId, now.getTime());
  if (cacheado) return cacheado;

  const rules = await getRiskRules(academyId);
  const nowMs = now.getTime();
  const recentStartMs = nowMs - riskConfig.recentWindowDays * MS_PER_DAY;
  const baselineStartMs = recentStartMs - riskConfig.baselineWindowDays * MS_PER_DAY;
  const recentWeeks = riskConfig.recentWindowDays / 7;

  // As quatro consultas são independentes: uma ida ao banco em vez de quatro
  // sequenciais importa quando o banco está a um RTT de distância.
  const [rows, ultimos, recentes, baselines] = await Promise.all([
    db.all<StudentRow>(ALUNOS, academyId),
    db.all<{ aluno_id: number; last_ts: number }>(ULTIMO_ACESSO, academyId),
    db.all<{ aluno_id: number; c: number }>(CONTAGEM_RECENTE, academyId, recentStartMs),
    db.all<{ aluno_id: number; c: number }>(
      CONTAGEM_BASELINE,
      academyId,
      baselineStartMs,
      recentStartMs,
    ),
  ]);

  const lastAccess = new Map<number, number>();
  for (const r of ultimos) lastAccess.set(r.aluno_id, r.last_ts);
  const recentCounts = new Map<number, number>();
  for (const r of recentes) recentCounts.set(r.aluno_id, r.c);
  const baselineCounts = new Map<number, number>();
  for (const r of baselines) baselineCounts.set(r.aluno_id, r.c);

  const metricas = rows.map((row) => {
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

  gravarCache(academyId, metricas, now.getTime());
  return metricas;
}
