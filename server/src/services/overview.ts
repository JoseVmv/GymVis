import type { OverviewResponse } from '@gymvis/shared';
import { sqlite } from '../db/client';
import { MS_PER_DAY, addDays, round2, toDateStr } from '../lib/dates';
import { enrolledCountAt } from './studentMetrics';

const statusCountsStmt = sqlite.prepare(`
  SELECT status, COUNT(*) AS c
  FROM students
  WHERE academy_id = ?
  GROUP BY status
`);

// Janelas de calendário: (início, fim] — cada uma cobre exatamente P dias.
const entriesRangeStmt = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM students
  WHERE academy_id = ? AND data_entrada > ? AND data_entrada <= ?
`);

const exitsRangeStmt = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM students
  WHERE academy_id = ? AND status = 'cancelado' AND data_saida > ? AND data_saida <= ?
`);

const accessesRangeStmt = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ? AND timestamp < ?
`);

const count = (row: unknown): number => (row as { c: number }).c;

export function getOverview(academyId: number, periodDays: number): OverviewResponse {
  const now = new Date();
  const nowMs = now.getTime();

  const statusCounts = new Map<string, number>();
  for (const r of statusCountsStmt.all(academyId) as { status: string; c: number }[]) {
    statusCounts.set(r.status, r.c);
  }
  const activeStudents = (statusCounts.get('ativo') ?? 0) + (statusCounts.get('inadimplente') ?? 0);

  const today = toDateStr(now);
  const periodAgo = toDateStr(addDays(now, -periodDays));
  const twoPeriodsAgo = toDateStr(addDays(now, -2 * periodDays));

  const newStudents = count(entriesRangeStmt.get(academyId, periodAgo, today));
  const newStudentsPrev = count(entriesRangeStmt.get(academyId, twoPeriodsAgo, periodAgo));
  const cancellations = count(exitsRangeStmt.get(academyId, periodAgo, today));
  const cancellationsPrev = count(exitsRangeStmt.get(academyId, twoPeriodsAgo, periodAgo));

  const periodMs = periodDays * MS_PER_DAY;
  const totalAccesses = count(accessesRangeStmt.get(academyId, nowMs - periodMs, nowMs + 1));
  const totalAccessesPrev = count(
    accessesRangeStmt.get(academyId, nowMs - 2 * periodMs, nowMs - periodMs),
  );

  // Cada janela é normalizada pela base matriculada vigente nela: usar o
  // plantel de hoje nas duas faria o delta degenerar na variação de acessos.
  const weeks = periodDays / 7;
  const avgWeekly = (accesses: number, enrolled: number): number =>
    enrolled > 0 ? round2(accesses / enrolled / weeks) : 0;
  const enrolledNow = enrolledCountAt(academyId, today);
  const enrolledPrev = enrolledCountAt(academyId, periodAgo);

  return {
    periodDays,
    activeStudents,
    delinquentStudents: statusCounts.get('inadimplente') ?? 0,
    pausedStudents: statusCounts.get('pausado') ?? 0,
    newStudents,
    newStudentsPrev,
    cancellations,
    cancellationsPrev,
    netGrowth: newStudents - cancellations,
    netGrowthPrev: newStudentsPrev - cancellationsPrev,
    totalAccesses,
    totalAccessesPrev,
    avgWeeklyFrequency: avgWeekly(totalAccesses, enrolledNow),
    avgWeeklyFrequencyPrev: avgWeekly(totalAccessesPrev, enrolledPrev),
  };
}
