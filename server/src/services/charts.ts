import type {
  ChartsResponse,
  FlowPoint,
  MonthPoint,
  RiskLevel,
  RiskSlice,
  WeekPoint,
} from '@gymvis/shared';
import { sqlite } from '../db/client';
import {
  MS_PER_DAY,
  addDays,
  addMonths,
  dayMonthLabel,
  daysInMonth,
  lastDayOfMonthStr,
  monthKey,
  monthLabel,
  round2,
  startOfMonth,
  startOfWeek,
  toDateStr,
} from '../lib/dates';
import { computeStudentMetrics, isEnrolled } from './studentMetrics';

const MONTHS = 12;
const WEEKS = 12;
const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const studentDatesStmt = sqlite.prepare(`
  SELECT data_entrada, data_saida
  FROM students
  WHERE academy_id = ?
`);

const accessCountRangeStmt = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM access_events
  WHERE academy_id = ? AND tipo_evento = 'entrada' AND timestamp >= ? AND timestamp < ?
`);

interface StudentDates {
  data_entrada: string;
  data_saida: string | null;
}

function countAccesses(academyId: number, fromMs: number, toMs: number): number {
  return (accessCountRangeStmt.get(academyId, fromMs, toMs) as { c: number }).c;
}

/** Matriculado na data `endStr`: entrou até lá e não saiu até lá. */
function enrolledAt(rows: StudentDates[], endStr: string): number {
  let n = 0;
  for (const r of rows) {
    if (r.data_entrada <= endStr && (r.data_saida === null || r.data_saida > endStr)) n += 1;
  }
  return n;
}

export function getCharts(academyId: number, now = new Date()): ChartsResponse {
  const rows = studentDatesStmt.all(academyId) as StudentDates[];
  const currentMonthStart = startOfMonth(now);

  const activeEvolution: MonthPoint[] = [];
  const flow: FlowPoint[] = [];
  const avgFrequency: MonthPoint[] = [];

  for (let k = MONTHS - 1; k >= 0; k--) {
    const monthStart = addMonths(currentMonthStart, -k);
    const key = monthKey(monthStart);
    const label = monthLabel(monthStart);
    const isCurrent = k === 0;

    // Fim do mês (mês corrente usa hoje).
    const endStr = isCurrent ? toDateStr(now) : lastDayOfMonthStr(monthStart);
    const enrolled = enrolledAt(rows, endStr);
    activeEvolution.push({ month: key, label, value: enrolled });

    let novos = 0;
    let cancelamentos = 0;
    for (const r of rows) {
      if (r.data_entrada.slice(0, 7) === key) novos += 1;
      if (r.data_saida !== null && r.data_saida.slice(0, 7) === key) cancelamentos += 1;
    }
    flow.push({ month: key, label, novos, cancelamentos });

    const nextMonthStart = addMonths(monthStart, 1);
    const accesses = countAccesses(academyId, monthStart.getTime(), nextMonthStart.getTime());
    // Mês corrente: fração exata de dias decorridos — contar hoje como dia
    // inteiro afundaria o último ponto pela manhã.
    const days = isCurrent
      ? Math.max((now.getTime() - monthStart.getTime()) / MS_PER_DAY, 1)
      : daysInMonth(monthStart);
    const value = enrolled > 0 ? round2(accesses / enrolled / (days / 7)) : 0;
    avgFrequency.push({ month: key, label, value });
  }

  // Semanas fechadas: a semana corrente, ainda em curso, apareceria como um
  // colapso de frequência que não aconteceu.
  const lastClosedWeekStart = addDays(startOfWeek(now), -7);
  const weeklyAccesses: WeekPoint[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    const weekStart = addDays(lastClosedWeekStart, -7 * k);
    const weekEnd = addDays(weekStart, 7);
    weeklyAccesses.push({
      weekStart: toDateStr(weekStart),
      label: dayMonthLabel(weekStart),
      value: countAccesses(academyId, weekStart.getTime(), weekEnd.getTime()),
    });
  }

  const byLevel = new Map<RiskLevel, number>();
  for (const m of computeStudentMetrics(academyId, now)) {
    if (!isEnrolled(m.status) || m.risk === null) continue;
    byLevel.set(m.risk, (byLevel.get(m.risk) ?? 0) + 1);
  }
  const riskDistribution: RiskSlice[] = RISK_LEVELS.map((level) => ({
    level,
    count: byLevel.get(level) ?? 0,
  }));

  return { activeEvolution, flow, weeklyAccesses, avgFrequency, riskDistribution };
}
