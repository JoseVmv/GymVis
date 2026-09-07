/**
 * Helpers de data — sempre em horário local.
 *
 * Convenções do projeto: instantes em epoch ms, datas de calendário como
 * 'YYYY-MM-DD' (comparáveis lexicograficamente), meses 'YYYY-MM' e semanas
 * começando na segunda-feira.
 */

export const MS_PER_DAY = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Data local como 'YYYY-MM-DD'. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date à meia-noite local. */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Segunda-feira da semana de `d`, à meia-noite local. */
export function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return addDays(d, -dow);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Use apenas sobre datas no dia 1 (evita estouro de fim de mês). */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Último dia do mês de `d`, como 'YYYY-MM-DD'. */
export function lastDayOfMonthStr(d: Date): string {
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Dias completos entre dois instantes (floor). */
export function floorDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

/**
 * Dias de calendário entre dois instantes (meia-noite local a meia-noite local).
 *
 * É esta a contagem que o dono da academia espera ao ler "há 1 dia": um acesso
 * ontem à noite é "ontem", não "hoje" — o que 24 horas corridas diriam.
 */
export function calendarDaysBetween(fromMs: number, toMs: number): number {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

/** Mês de calendário como 'YYYY-MM'. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

/** Rótulo curto pt-BR do mês, ex.: 'set/25'. */
export function monthLabel(d: Date): string {
  const nome = monthFmt.format(d).replace(/[^\p{L}]/gu, '');
  return `${nome}/${pad2(d.getFullYear() % 100)}`;
}

/** Rótulo 'dd/mm', ex.: '01/09'. */
export function dayMonthLabel(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
