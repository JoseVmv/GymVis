import type {
  ChartsResponse,
  FlowPoint,
  MonthPoint,
  RiskLevel,
  RiskSlice,
  WeekPoint,
} from '@gymvis/shared';
import { db } from '../db/client';
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

const DATAS_DOS_ALUNOS = `
  SELECT data_entrada, data_saida
  FROM students
  WHERE academy_id = ?
`;

interface StudentDates {
  data_entrada: string;
  data_saida: string | null;
}

/**
 * Conta acessos em várias faixas de tempo com UMA ida ao banco.
 *
 * As fronteiras continuam sendo calculadas em JS, no fuso local, para que o
 * resultado seja idêntico ao da versão SQLite; aqui elas viajam como uma
 * lista de intervalos contra a qual os eventos são agrupados. A alternativa
 * ingênua — uma consulta por mês e por semana — custaria 24 idas ao banco.
 */
async function contarAcessosPorFaixa(
  academyId: number,
  faixas: { fromMs: number; toMs: number }[],
): Promise<number[]> {
  if (faixas.length === 0) return [];

  const valores = faixas
    .map(() => '(?::int, ?::bigint, ?::bigint)')
    .join(', ');
  const params: unknown[] = [academyId];
  faixas.forEach((f, i) => params.push(i, f.fromMs, f.toMs));

  const texto = `
    SELECT b.idx, COUNT(e.id) AS c
    FROM (VALUES ${valores}) AS b(idx, ini, fim)
    LEFT JOIN access_events e
      ON e.academy_id = ?
     AND e.tipo_evento = 'entrada'
     AND e.timestamp >= b.ini
     AND e.timestamp < b.fim
    GROUP BY b.idx
  `;
  // O academy_id do JOIN vai por último: os `?` são numerados na ordem do texto.
  const linhas = await db.all<{ idx: number; c: number }>(texto, ...params.slice(1), academyId);

  const saida = new Array<number>(faixas.length).fill(0);
  for (const l of linhas) saida[l.idx] = l.c;
  return saida;
}

/** Matriculado na data `endStr`: entrou até lá e não saiu até lá. */
function enrolledAt(rows: StudentDates[], endStr: string): number {
  let n = 0;
  for (const r of rows) {
    if (r.data_entrada <= endStr && (r.data_saida === null || r.data_saida > endStr)) n += 1;
  }
  return n;
}

export async function getCharts(academyId: number, now = new Date()): Promise<ChartsResponse> {
  const currentMonthStart = startOfMonth(now);

  // Fronteiras dos meses e das semanas, no fuso local (mesma regra de antes).
  const faixasMes: { fromMs: number; toMs: number }[] = [];
  for (let k = MONTHS - 1; k >= 0; k--) {
    const inicio = addMonths(currentMonthStart, -k);
    faixasMes.push({ fromMs: inicio.getTime(), toMs: addMonths(inicio, 1).getTime() });
  }

  // Semanas fechadas: a semana corrente, ainda em curso, apareceria como um
  // colapso de frequência que não aconteceu.
  const lastClosedWeekStart = addDays(startOfWeek(now), -7);
  const inicioSemanas: Date[] = [];
  const faixasSemana: { fromMs: number; toMs: number }[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    const inicio = addDays(lastClosedWeekStart, -7 * k);
    inicioSemanas.push(inicio);
    faixasSemana.push({ fromMs: inicio.getTime(), toMs: addDays(inicio, 7).getTime() });
  }

  const [rows, acessosPorMes, acessosPorSemana, metricas] = await Promise.all([
    db.all<StudentDates>(DATAS_DOS_ALUNOS, academyId),
    contarAcessosPorFaixa(academyId, faixasMes),
    contarAcessosPorFaixa(academyId, faixasSemana),
    computeStudentMetrics(academyId, now),
  ]);

  const activeEvolution: MonthPoint[] = [];
  const flow: FlowPoint[] = [];
  const avgFrequency: MonthPoint[] = [];

  for (let i = 0; i < MONTHS; i++) {
    const monthStart = addMonths(currentMonthStart, -(MONTHS - 1 - i));
    const key = monthKey(monthStart);
    const label = monthLabel(monthStart);
    const isCurrent = i === MONTHS - 1;

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

    // Mês corrente: fração exata de dias decorridos — contar hoje como dia
    // inteiro afundaria o último ponto pela manhã.
    const days = isCurrent
      ? Math.max((now.getTime() - monthStart.getTime()) / MS_PER_DAY, 1)
      : daysInMonth(monthStart);
    const value = enrolled > 0 ? round2(acessosPorMes[i] / enrolled / (days / 7)) : 0;
    avgFrequency.push({ month: key, label, value });
  }

  const weeklyAccesses: WeekPoint[] = inicioSemanas.map((inicio, i) => ({
    weekStart: toDateStr(inicio),
    label: dayMonthLabel(inicio),
    value: acessosPorSemana[i],
  }));

  const byLevel = new Map<RiskLevel, number>();
  for (const m of metricas) {
    if (!isEnrolled(m.status) || m.risk === null) continue;
    byLevel.set(m.risk, (byLevel.get(m.risk) ?? 0) + 1);
  }
  const riskDistribution: RiskSlice[] = RISK_LEVELS.map((level) => ({
    level,
    count: byLevel.get(level) ?? 0,
  }));

  return { activeEvolution, flow, weeklyAccesses, avgFrequency, riskDistribution };
}
