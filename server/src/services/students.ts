import type {
  AccessRecord,
  StudentListItem,
  StudentProfileResponse,
  StudentsResponse,
  WeeklyFrequencyPoint,
} from '@gymvis/shared';
import { alertConfig } from '../config/alerts';
import { sqlite } from '../db/client';
import {
  addDays,
  dayMonthLabel,
  floorDaysBetween,
  parseDateStr,
  startOfWeek,
  toDateStr,
} from '../lib/dates';
import { computeStudentMetrics, type StudentMetrics } from './studentMetrics';

const MAX_WEEKS = 52;
const MAX_RECENT_ACCESSES = 60;

function toListItem(m: StudentMetrics): StudentListItem {
  return {
    id: m.id,
    nome: m.nome,
    status: m.status,
    planoNome: m.planoNome,
    mensalidadeCentavos: m.mensalidadeCentavos,
    dataEntrada: m.dataEntrada,
    dataSaida: m.dataSaida,
    lastAccessAt: m.lastAccessAt,
    daysSinceLastAccess: m.daysSinceLastAccess,
    daysSinceJoin: m.daysSinceJoin,
    baselineWeekly: m.baselineWeekly,
    recentWeekly: m.recentWeekly,
    variation: m.variation,
    risk: m.risk,
  };
}

export function listStudents(academyId: number): StudentsResponse {
  return {
    students: computeStudentMetrics(academyId).map(toListItem),
    alertThresholds: alertConfig,
    generatedAt: Date.now(),
  };
}

const accessTimestampsStmt = sqlite.prepare(`
  SELECT timestamp
  FROM access_events
  WHERE academy_id = ? AND aluno_id = ? AND tipo_evento = 'entrada'
  ORDER BY timestamp DESC
`);

/**
 * Acessos por semana desde a entrada (semanas com zero incluídas).
 *
 * A série termina na última semana fechada: a semana em curso apareceria como
 * uma queda de frequência que ainda não aconteceu.
 */
function buildWeeklySeries(
  dataEntrada: string,
  timestamps: number[],
  now: Date,
): WeeklyFrequencyPoint[] {
  const firstWeek = startOfWeek(parseDateStr(dataEntrada));
  const lastWeek = addDays(startOfWeek(now), -7);
  if (firstWeek.getTime() > lastWeek.getTime()) return [];

  const totalWeeks = Math.round(floorDaysBetween(firstWeek.getTime(), lastWeek.getTime()) / 7) + 1;
  const weekCount = Math.min(MAX_WEEKS, totalWeeks);
  const seriesStart = addDays(lastWeek, -7 * (weekCount - 1));

  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const weekStr = toDateStr(startOfWeek(new Date(ts)));
    counts.set(weekStr, (counts.get(weekStr) ?? 0) + 1);
  }

  const series: WeeklyFrequencyPoint[] = [];
  for (let i = 0; i < weekCount; i++) {
    const week = addDays(seriesStart, 7 * i);
    const weekStr = toDateStr(week);
    series.push({
      weekStart: weekStr,
      label: dayMonthLabel(week),
      count: counts.get(weekStr) ?? 0,
    });
  }
  return series;
}

export function getStudentProfile(
  academyId: number,
  studentId: number,
): StudentProfileResponse | null {
  const metric = computeStudentMetrics(academyId).find((m) => m.id === studentId);
  if (!metric) return null;

  const now = new Date();
  const timestamps = (accessTimestampsStmt.all(academyId, studentId) as { timestamp: number }[]).map(
    (r) => r.timestamp,
  );

  const recentAccesses: AccessRecord[] = timestamps
    .slice(0, MAX_RECENT_ACCESSES)
    .map((timestamp) => ({ timestamp, tipoEvento: 'entrada' }));

  return {
    ...toListItem(metric),
    email: metric.email,
    telefone: metric.telefone,
    riskReasons: metric.riskReasons,
    weeklySeries: buildWeeklySeries(metric.dataEntrada, timestamps, now),
    recentAccesses,
  };
}
