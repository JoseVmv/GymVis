import type { OverviewResponse } from '@gymvis/shared';
import { db } from '../db/client';
import { MS_PER_DAY, addDays, round2, toDateStr } from '../lib/dates';

/**
 * Todos os números do período numa consulta só.
 *
 * Antes eram nove consultas disparadas em paralelo — que, com um pool
 * pequeno, viram filas de ida e volta. Agregar tudo em subconsultas escalares
 * custa um RTT único.
 */
const RESUMO = `
  SELECT
    (SELECT COUNT(*) FROM students WHERE academy_id = ? AND status = 'ativo') AS ativos,
    (SELECT COUNT(*) FROM students WHERE academy_id = ? AND status = 'inadimplente') AS inadimplentes,
    (SELECT COUNT(*) FROM students WHERE academy_id = ? AND status = 'pausado') AS pausados,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND data_entrada > ? AND data_entrada <= ?) AS novos,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND data_entrada > ? AND data_entrada <= ?) AS novos_ant,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND status = 'cancelado' AND data_saida > ? AND data_saida <= ?) AS saidas,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND status = 'cancelado' AND data_saida > ? AND data_saida <= ?) AS saidas_ant,
    (SELECT COUNT(*) FROM access_events
      WHERE academy_id = ? AND tipo_evento = 'entrada'
        AND timestamp >= ? AND timestamp < ?) AS acessos,
    (SELECT COUNT(*) FROM access_events
      WHERE academy_id = ? AND tipo_evento = 'entrada'
        AND timestamp >= ? AND timestamp < ?) AS acessos_ant,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND data_entrada <= ? AND (data_saida IS NULL OR data_saida > ?)) AS matriculados,
    (SELECT COUNT(*) FROM students
      WHERE academy_id = ? AND data_entrada <= ? AND (data_saida IS NULL OR data_saida > ?)) AS matriculados_ant
`;

interface ResumoRow {
  ativos: number;
  inadimplentes: number;
  pausados: number;
  novos: number;
  novos_ant: number;
  saidas: number;
  saidas_ant: number;
  acessos: number;
  acessos_ant: number;
  matriculados: number;
  matriculados_ant: number;
}

export async function getOverview(
  academyId: number,
  periodDays: number,
): Promise<OverviewResponse> {
  const now = new Date();
  const nowMs = now.getTime();

  const today = toDateStr(now);
  const periodAgo = toDateStr(addDays(now, -periodDays));
  const twoPeriodsAgo = toDateStr(addDays(now, -2 * periodDays));
  const periodMs = periodDays * MS_PER_DAY;

  const r = (await db.one<ResumoRow>(
    RESUMO,
    academyId,
    academyId,
    academyId,
    academyId, periodAgo, today,
    academyId, twoPeriodsAgo, periodAgo,
    academyId, periodAgo, today,
    academyId, twoPeriodsAgo, periodAgo,
    academyId, nowMs - periodMs, nowMs + 1,
    academyId, nowMs - 2 * periodMs, nowMs - periodMs,
    academyId, today, today,
    academyId, periodAgo, periodAgo,
  ))!;

  const activeStudents = r.ativos + r.inadimplentes;
  const newStudents = r.novos;
  const newStudentsPrev = r.novos_ant;
  const cancellations = r.saidas;
  const cancellationsPrev = r.saidas_ant;
  const totalAccesses = r.acessos;
  const totalAccessesPrev = r.acessos_ant;

  // Cada janela é normalizada pela base matriculada vigente nela: usar o
  // plantel de hoje nas duas faria o delta degenerar na variação de acessos.
  const weeks = periodDays / 7;
  const avgWeekly = (accesses: number, enrolled: number): number =>
    enrolled > 0 ? round2(accesses / enrolled / weeks) : 0;

  return {
    periodDays,
    activeStudents,
    delinquentStudents: r.inadimplentes,
    pausedStudents: r.pausados,
    newStudents,
    newStudentsPrev,
    cancellations,
    cancellationsPrev,
    netGrowth: newStudents - cancellations,
    netGrowthPrev: newStudentsPrev - cancellationsPrev,
    totalAccesses,
    totalAccessesPrev,
    avgWeeklyFrequency: avgWeekly(totalAccesses, r.matriculados),
    avgWeeklyFrequencyPrev: avgWeekly(totalAccessesPrev, r.matriculados_ant),
  };
}
