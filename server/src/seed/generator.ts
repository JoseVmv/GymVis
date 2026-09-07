/**
 * Gerador determinístico de dados fictícios realistas para uma academia.
 *
 * Pressupõe que a academia já existe: cria plans, students e access_events
 * apenas dela — não cria usuário/academia e não apaga nada.
 *
 * Toda a aleatoriedade passa pelo PRNG (mulberry32): a mesma seed produz o
 * mesmo banco para uma mesma data de execução.
 */
import type { EventType, RiskLevel, StudentStatus } from '@gymvis/shared';
import { classifyRisk, riskConfig } from '../config/risk';
import { sqlite } from '../db/client';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { Rng } from './rng';

export interface GenerateOptions {
  academyId: number;
  students: number;
  months: number;
  seed?: number;
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- calendário

function fmtDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Segunda-feira da semana de `d` (semanas começam na segunda). */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

// ------------------------------------------------------------------- modelos

/**
 * `commitmentMonths` é o período cobrado de uma vez: em plano mensal a pessoa
 * decide pagar de novo a cada 30 dias; nos demais ela já pagou o período
 * inteiro à frente e a academia só reencontra a decisão na renovação.
 */
const PLAN_SPECS = [
  { nome: 'Mensal', valorCentavos: 12990, share: 0.4, commitmentMonths: 1 },
  { nome: 'Trimestral', valorCentavos: 11490, share: 0.18, commitmentMonths: 3 },
  { nome: 'Semestral', valorCentavos: 9990, share: 0.14, commitmentMonths: 6 },
  { nome: 'Anual', valorCentavos: 8490, share: 0.16, commitmentMonths: 12 },
  { nome: 'Estudante', valorCentavos: 7990, share: 0.12, commitmentMonths: 1 },
] as const;

const PLAN_SHARES = PLAN_SPECS.map((p) => p.share);

type ArchetypeId =
  | 'dedicado'
  | 'regular'
  | 'casual'
  | 'esporadico'
  | 'fim-de-semana'
  | 'em-queda'
  | 'sumido';

interface ArchetypeSpec {
  id: ArchetypeId;
  /** Alvo de visitas por semana. */
  weekly: number;
  share: number;
}

const ARCHETYPES: readonly ArchetypeSpec[] = [
  { id: 'dedicado', weekly: 4.5, share: 0.15 },
  { id: 'regular', weekly: 3, share: 0.3 },
  { id: 'casual', weekly: 2, share: 0.22 },
  { id: 'esporadico', weekly: 1, share: 0.13 },
  { id: 'fim-de-semana', weekly: 1.5, share: 0.07 },
  { id: 'em-queda', weekly: 3, share: 0.08 },
  { id: 'sumido', weekly: 2.8, share: 0.05 },
];

const ARCHETYPE_SHARES = ARCHETYPES.map((a) => a.share);

type Persona = 'manha' | 'almoco' | 'noite';

const PERSONAS: readonly Persona[] = ['manha', 'almoco', 'noite'];
const PERSONA_SHARES = [0.3, 0.2, 0.5];

/** Janelas de horário em minutos desde a meia-noite. */
const PERSONA_WINDOWS: Record<Persona, readonly [number, number]> = {
  manha: [360, 540], // 06:00–09:00
  almoco: [690, 810], // 11:30–13:30
  noite: [1050, 1290], // 17:30–21:30 (pico)
};
const WEEKEND_WINDOW: readonly [number, number] = [480, 720]; // 08:00–12:00
/** Nem toda visita cabe na rotina do aluno: parte da tarde tem movimento. */
const AFTERNOON_WINDOW: readonly [number, number] = [840, 1020]; // 14:00–17:00
const AFTERNOON_CHANCE = 0.07;

/** Sazonalidade de matrículas por mês-calendário (0 = janeiro). */
const ENTRY_SEASONALITY: Record<number, number> = {
  0: 1.9,
  1: 1.2,
  2: 1.3,
  7: 1.2,
  10: 0.8,
  11: 0.55,
};

/** Sazonalidade de presença por mês-calendário. */
const PRESENCE_SEASONALITY: Record<number, number> = { 0: 1.15, 11: 0.7 };

/** Meses de base de veteranos antes da janela pedida. */
const PRE_WINDOW_MONTHS = 24;
const PRE_WINDOW_DAMP = 0.6;
const GROWTH_PER_MONTH = 1.02;

const EMAIL_DOMAINS = ['gmail.com', 'gmail.com', 'gmail.com', 'outlook.com', 'hotmail.com'];
const DDDS = [
  '11', '11', '11', '19', '21', '21', '24', '27', '31', '31', '32', '41', '43',
  '47', '48', '51', '54', '61', '62', '67', '71', '75', '81', '83', '85', '92', '98',
];

interface SeedEvent {
  ts: number;
  tipo: EventType;
}

interface StudentDraft {
  nome: string;
  email: string | null;
  telefone: string | null;
  planIndex: number;
  mensalidadeCentavos: number;
  join: Date;
  exit: Date | null;
  status: StudentStatus;
  archetype: ArchetypeId;
  weeklyBase: number;
  persona: Persona;
  /** Dias preferidos, 0 = segunda ... 6 = domingo. */
  preferredDays: number[];
  /** Dias de afastamento planejados para quem segue matriculado. */
  lapseDays: number;
  /** Último dia com atividade permitida (saída ou início do afastamento). */
  activityEnd: Date;
  events: SeedEvent[];
}

// ------------------------------------------------------- identidade e contato

function stripAccents(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    // Remove marcas diacríticas combinantes (U+0300–U+036F).
    if (code < 0x300 || code > 0x36f) out += ch;
  }
  return out;
}

function makeUniqueName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    let nome = `${first} ${last}`;
    if (attempt > 1 || rng.chance(0.35)) {
      const middle = rng.pick(LAST_NAMES);
      if (middle !== last) nome = `${first} ${middle} ${last}`;
    }
    if (!used.has(nome)) {
      used.add(nome);
      return nome;
    }
  }
  throw new Error('Não foi possível gerar um nome único para o aluno.');
}

function makeEmail(rng: Rng, nome: string, used: Set<string>): string | null {
  if (!rng.chance(0.85)) return null;
  const parts = stripAccents(nome).toLowerCase().split(' ');
  const first = parts[0];
  const last = parts[parts.length - 1];
  const styles = [`${first}.${last}`, `${first}${last}`, `${first}_${last}`, `${first[0]}${last}`];
  let local = styles[rng.int(0, styles.length - 1)];
  if (rng.chance(0.3)) local += String(rng.int(1, 99));
  const domain = rng.pick(EMAIL_DOMAINS);
  let email = `${local}@${domain}`;
  while (used.has(email)) email = `${local}${rng.int(1, 999)}@${domain}`;
  used.add(email);
  return email;
}

function makePhone(rng: Rng): string | null {
  if (!rng.chance(0.9)) return null;
  const p1 = String(rng.int(0, 9999)).padStart(4, '0');
  const p2 = String(rng.int(0, 9999)).padStart(4, '0');
  return `(${rng.pick(DDDS)}) 9${p1}-${p2}`;
}

// ------------------------------------------------- entradas, churn e status

interface MonthAllocation {
  monthStart: Date;
  count: number;
}

/**
 * Distribui o total de alunos pelos meses da linha do tempo (janela pedida
 * mais a base de veteranos), com sazonalidade brasileira de matrícula e
 * tendência de crescimento de +2% ao mês. A soma é exatamente `total`.
 */
function allocateEntriesPerMonth(
  rng: Rng,
  today: Date,
  windowMonths: number,
  total: number,
): MonthAllocation[] {
  const totalMonths = PRE_WINDOW_MONTHS + windowMonths;
  const monthStarts: Date[] = [];
  const weights: number[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() - (totalMonths - 1 - i), 1);
    const seasonal = ENTRY_SEASONALITY[start.getMonth()] ?? 1;
    const damp = i < PRE_WINDOW_MONTHS ? PRE_WINDOW_DAMP : 1;
    monthStarts.push(start);
    weights.push(seasonal * damp * Math.pow(GROWTH_PER_MONTH, i) * rng.range(0.85, 1.15));
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  const allocation: MonthAllocation[] = [];
  let acc = 0;
  let assigned = 0;
  for (let i = 0; i < totalMonths; i++) {
    acc += (weights[i] / sum) * total;
    const count = Math.round(acc) - assigned;
    assigned += count;
    allocation.push({ monthStart: monthStarts[i], count });
  }
  return allocation;
}

/**
 * Simula o cancelamento por hazard mensal de tenure. Coortes de janeiro têm
 * hazard extra nos meses 2–3 (efeito resolução de ano novo). Retorna a data
 * de saída ou null se o aluno segue matriculado.
 */
function simulateChurn(rng: Rng, join: Date, today: Date): Date | null {
  const januaryCohort = join.getMonth() === 0;
  for (let t = 1; t <= 600; t++) {
    const tenureStart = addMonths(join, t - 1);
    if (tenureStart.getTime() > today.getTime()) return null;
    let hazard = t <= 3 ? 0.08 : t <= 6 ? 0.05 : t <= 12 ? 0.03 : 0.015;
    if (januaryCohort && (t === 2 || t === 3)) hazard += 0.08;
    if (rng.chance(hazard)) {
      const exit = addDays(tenureStart, t === 1 ? rng.int(5, 27) : rng.int(2, 27));
      if (exit.getTime() > today.getTime()) return null;
      const nextTenure = addMonths(join, t);
      return exit.getTime() < nextTenure.getTime() ? exit : addDays(nextTenure, -1);
    }
  }
  return null;
}

/** Ausência que ainda passa por rotina normal (viagem, semana cheia, gripe). */
const SHORT_ABSENCE_DAYS = 6;
/** Trancar a matrícula é afastamento de 1 a 3 semanas: acima disso não é 'pausado'. */
const PAUSE_ABSENCE_MAX_DAYS = 21;
/** A partir daqui a ausência já atravessou uma virada de cobrança mensal. */
const LONG_ABSENCE_DAYS = 30;
/** Ausência máxima que ainda admite 'ativo' fora do período já pago. */
const UNCOVERED_ACTIVE_MAX_DAYS = 35;

/**
 * Dias desde a última visita de quem segue matriculado. A cauda longa é a
 * matéria-prima dos alertas: sem ela o painel não teria risco alto nem crítico.
 */
function drawLapseDays(rng: Rng, archetype: ArchetypeId): number {
  if (archetype === 'sumido') return rng.int(24, 75);
  const r = rng.float();
  if (archetype === 'em-queda') {
    if (r < 0.4) return 0;
    if (r < 0.75) return rng.int(7, 20);
    return rng.int(21, 45);
  }
  if (r < 0.82) return 0;
  if (r < 0.94) return rng.int(7, 20);
  return rng.int(21, 50);
}

/** Dias decorridos desde o início do período já pago (última renovação). */
function paidCycleDays(join: Date, today: Date, commitmentMonths: number): number {
  let cycleStart = join;
  for (let k = 1; k <= 600; k++) {
    const next = addMonths(join, k * commitmentMonths);
    if (next.getTime() > today.getTime()) break;
    cycleStart = next;
  }
  return Math.max(0, daysBetween(cycleStart, today));
}

interface StatusContext {
  absenceDays: number;
  commitmentMonths: number;
  /** Dias corridos do período já pago; a ausência cabe dentro dele? */
  paidCycleDays: number;
}

/**
 * Status de quem não cancelou, em função da ausência e do compromisso
 * financeiro do plano. Quem paga mês a mês e parou de ir deixa de pagar na
 * virada da cobrança sem formalizar a saída — vira inadimplente. Quem já pagou
 * o período à frente segue legitimamente matriculado até a renovação, e é
 * justamente esse aluno que o produto precisa apontar antes que ela chegue.
 */
function deriveEnrolledStatus(rng: Rng, ctx: StatusContext): StudentStatus {
  const covered = ctx.commitmentMonths > 1 && ctx.absenceDays <= ctx.paidCycleDays;
  const r = rng.float();

  if (ctx.absenceDays <= SHORT_ABSENCE_DAYS) return r < 0.02 ? 'inadimplente' : 'ativo';

  if (ctx.absenceDays <= PAUSE_ABSENCE_MAX_DAYS) {
    if (r < 0.32) return 'pausado';
    if (r < 0.32 + (covered ? 0.05 : 0.12)) return 'inadimplente';
    return 'ativo';
  }

  // Ainda dentro do mês corrente de cobrança: a mensalidade costuma seguir paga.
  if (ctx.absenceDays <= LONG_ABSENCE_DAYS) {
    return r < (covered ? 0.1 : 0.3) ? 'inadimplente' : 'ativo';
  }

  if (covered) return r < 0.12 ? 'inadimplente' : 'ativo';

  if (r < 0.6) return 'inadimplente';
  if (r < 0.92) return 'cancelado';
  return ctx.absenceDays <= UNCOVERED_ACTIVE_MAX_DAYS ? 'ativo' : 'inadimplente';
}

function pickPreferredDays(rng: Rng, archetype: ArchetypeId): number[] {
  if (archetype === 'fim-de-semana') return [5, 6];
  const weekdays = rng.shuffle([0, 1, 2, 3, 4]);
  if (archetype === 'dedicado') {
    const days = weekdays.slice(0, 5);
    if (rng.chance(0.5)) days.push(5);
    return days;
  }
  if (archetype === 'regular' || archetype === 'em-queda' || archetype === 'sumido') {
    const days = weekdays.slice(0, rng.int(3, 4));
    if (rng.chance(0.25)) days.push(5);
    return days;
  }
  // casual e esporádico
  const days = weekdays.slice(0, rng.int(2, 3));
  if (rng.chance(0.3)) days.push(rng.pick([5, 6]));
  return days;
}

/**
 * O status definitivo de quem segue matriculado só é decidido em
 * `assignEnrolledStatuses`, depois que a ausência real é conhecida; aqui o
 * aluno sai como 'ativo' provisório ou 'cancelado' quando o churn já decidiu.
 */
function buildDraft(
  rng: Rng,
  join: Date,
  today: Date,
  usedNames: Set<string>,
  usedEmails: Set<string>,
): StudentDraft {
  const nome = makeUniqueName(rng, usedNames);
  const email = makeEmail(rng, nome, usedEmails);
  const telefone = makePhone(rng);

  const planIndex = rng.weightedIndex(PLAN_SHARES);
  const desconto = rng.chance(0.15) ? rng.int(10, 30) * 100 : 0;
  const mensalidadeCentavos = PLAN_SPECS[planIndex].valorCentavos - desconto;

  const archetype = ARCHETYPES[rng.weightedIndex(ARCHETYPE_SHARES)];
  const persona = PERSONAS[rng.weightedIndex(PERSONA_SHARES)];

  const exit = simulateChurn(rng, join, today);
  const drawnLapse = drawLapseDays(rng, archetype.id);

  let lapseDays = 0;
  let activityEnd: Date;
  if (exit) {
    // Quem some costuma parar de aparecer bem antes de formalizar a saída.
    const antecipacao = archetype.id === 'sumido' ? rng.int(10, 45) : 0;
    activityEnd = addDays(exit, -antecipacao);
    if (activityEnd.getTime() < join.getTime()) activityEnd = join;
  } else {
    lapseDays = Math.min(drawnLapse, Math.max(0, daysBetween(join, today)));
    activityEnd = addDays(today, -lapseDays);
  }

  return {
    nome,
    email,
    telefone,
    planIndex,
    mensalidadeCentavos,
    join,
    exit,
    status: exit ? 'cancelado' : 'ativo',
    archetype: archetype.id,
    weeklyBase: archetype.weekly,
    persona,
    preferredDays: pickPreferredDays(rng, archetype.id),
    lapseDays,
    activityEnd,
    events: [],
  };
}

// ------------------------------------------------------------ frequência

function pushVisit(rng: Rng, draft: StudentDraft, date: Date, minutes: number, now: number): void {
  // Os três sorteios são consumidos sempre, inclusive quando a visita cai no
  // futuro e é descartada: assim o fluxo do PRNG depende só da seed e do dia,
  // e não da hora em que o seed rodou.
  const tsIn = date.getTime() + minutes * 60_000 + rng.int(0, 59) * 1000;
  const hasExit = rng.chance(0.85);
  const exitAfterMinutes = rng.int(45, 120);

  if (tsIn > now) return;
  draft.events.push({ ts: tsIn, tipo: 'entrada' });
  if (hasExit) {
    const tsOut = tsIn + exitAfterMinutes * 60_000;
    if (tsOut <= now) draft.events.push({ ts: tsOut, tipo: 'saida' });
  }
}

function pickVisitDays(rng: Rng, preferred: number[], count: number): number[] {
  const others = [0, 1, 2, 3, 4, 5, 6].filter((day) => !preferred.includes(day));
  const pool = rng.shuffle([...preferred]).concat(rng.shuffle(others));
  const chosen = new Set<number>();
  for (let i = 0; i < count && i < pool.length; i++) {
    chosen.add(rng.chance(0.15) ? rng.int(0, 6) : pool[i]);
  }
  return [...chosen];
}

/** Gera as visitas semana a semana, da entrada até o fim da atividade. */
function buildEvents(rng: Rng, draft: StudentDraft, now: number): void {
  if (draft.activityEnd.getTime() < draft.join.getTime()) return;

  const endMonday = mondayOf(draft.activityEnd);
  const cancelWeeks = draft.exit ? rng.int(2, 4) : 0;
  const declineWeeks = draft.archetype === 'em-queda' ? rng.int(3, 6) : 0;
  const declineFloor =
    draft.archetype === 'em-queda' ? rng.range(0.5, 1.0) / draft.weeklyBase : 1;

  let vacationLeft = 0;
  for (
    let monday = mondayOf(draft.join);
    monday.getTime() <= draft.activityEnd.getTime();
    monday = addDays(monday, 7)
  ) {
    if (vacationLeft > 0) {
      vacationLeft--;
      continue;
    }
    // ~4% ao mês de "férias" que pulam 1–2 semanas.
    if (rng.chance(0.01)) {
      vacationLeft = rng.int(0, 1);
      continue;
    }

    const weeksFromEnd = Math.round(daysBetween(monday, endMonday) / 7);
    let target = draft.weeklyBase;
    if (daysBetween(draft.join, monday) < 42) target *= 1.2; // empolgação inicial
    target *= PRESENCE_SEASONALITY[monday.getMonth()] ?? 1;
    target *= rng.range(0.7, 1.3); // ruído pessoal da semana
    if (cancelWeeks > 0 && weeksFromEnd < cancelWeeks) target *= 0.4;
    if (declineWeeks > 0 && weeksFromEnd < declineWeeks) {
      target *= declineFloor + (1 - declineFloor) * (weeksFromEnd / declineWeeks);
    }

    let visits = Math.floor(target);
    if (rng.chance(target - visits)) visits++;
    if (visits > 7) visits = 7;
    if (visits <= 0) continue;

    for (const day of pickVisitDays(rng, draft.preferredDays, visits)) {
      const date = addDays(monday, day);
      if (date.getTime() < draft.join.getTime()) continue;
      if (date.getTime() > draft.activityEnd.getTime()) continue;
      const weekdayWindow = rng.chance(AFTERNOON_CHANCE)
        ? AFTERNOON_WINDOW
        : PERSONA_WINDOWS[draft.persona];
      const window = day >= 5 ? WEEKEND_WINDOW : weekdayWindow;
      const minutes = rng.int(window[0], window[1]);
      pushVisit(rng, draft, date, minutes, now);
      // ~2% de chance de uma segunda visita no mesmo dia.
      if (rng.chance(0.02)) {
        const second = minutes + rng.int(240, 420);
        if (second <= 1260) pushVisit(rng, draft, date, second, now);
      }
    }
  }
}

// --------------------------------------------------- ausência real e status

function lastEntrada(draft: StudentDraft): number | null {
  let last: number | null = null;
  for (const e of draft.events) {
    if (e.tipo === 'entrada' && (last === null || e.ts > last)) last = e.ts;
  }
  return last;
}

/** Dias sem acesso, contados desde a entrada quando nunca houve acesso. */
function absenceDays(draft: StudentDraft, today: Date, now: number): number {
  const last = lastEntrada(draft);
  if (last === null) return Math.max(0, daysBetween(draft.join, today));
  return Math.max(0, Math.floor((now - last) / DAY_MS));
}

/**
 * Aproxima a ausência real da ausência planejada. Sem isso, uma sequência de
 * semanas fracas criaria afastamentos longos não intencionais, e o status
 * derivado deles seria ruído do gerador em vez de decisão do modelo.
 */
function enforcePlannedLapse(rng: Rng, drafts: StudentDraft[], today: Date, now: number): void {
  for (const draft of drafts) {
    if (draft.exit) continue;
    // Quem treina 1x por semana pode ter uma folga natural maior que quem treina 5x.
    const limit = draft.lapseDays + Math.ceil(7 / draft.weeklyBase) + 3;
    if (absenceDays(draft, today, now) <= limit) continue;

    let date = addDays(draft.activityEnd, -rng.int(0, 2));
    if (date.getTime() < draft.join.getTime()) date = draft.join;
    const window = PERSONA_WINDOWS[draft.persona];
    pushVisit(rng, draft, date, rng.int(window[0], window[1]), now);
    if (absenceDays(draft, today, now) <= limit) continue;

    // A janela de horário caiu no futuro (aluno muito recente, por exemplo):
    // registra a entrada no instante alvo, dentro de [entrada, agora].
    const alvo = now - draft.lapseDays * DAY_MS - rng.int(30, 600) * 60_000;
    draft.events.push({ ts: Math.max(draft.join.getTime(), Math.min(alvo, now)), tipo: 'entrada' });
  }
}

/** Saída logo depois do último acesso: nunca antes dele, nunca no futuro. */
function pickExitDate(rng: Rng, draft: StudentDraft, today: Date): Date {
  const last = lastEntrada(draft);
  const base = last === null ? draft.join : startOfDay(new Date(last));
  let exit = addDays(base, rng.int(1, 10));
  if (exit.getTime() > today.getTime()) exit = today;
  if (exit.getTime() < draft.join.getTime()) exit = draft.join;
  return exit;
}

/** Decide o status de quem o churn deixou matriculado, já sabendo a ausência. */
function assignEnrolledStatuses(rng: Rng, drafts: StudentDraft[], today: Date, now: number): void {
  for (const draft of drafts) {
    if (draft.exit) continue;
    const { commitmentMonths } = PLAN_SPECS[draft.planIndex];
    draft.status = deriveEnrolledStatus(rng, {
      absenceDays: absenceDays(draft, today, now),
      commitmentMonths,
      paidCycleDays: paidCycleDays(draft.join, today, commitmentMonths),
    });
    if (draft.status === 'cancelado') draft.exit = pickExitDate(rng, draft, today);
  }
}

// ------------------------------------------------------------- validação

/** Classifica um aluno com as mesmas janelas usadas pelo produto (riskConfig). */
function classifyDraft(draft: StudentDraft, today: Date, now: number): RiskLevel | null {
  const entradas: number[] = [];
  for (const e of draft.events) if (e.tipo === 'entrada') entradas.push(e.ts);

  let last: number | null = null;
  for (const ts of entradas) if (last === null || ts > last) last = ts;

  const daysSinceJoin = daysBetween(draft.join, today);
  const daysSinceLastAccess = last === null ? null : Math.floor((now - last) / DAY_MS);

  const recentMs = riskConfig.recentWindowDays * DAY_MS;
  let recentCount = 0;
  for (const ts of entradas) if (ts >= now - recentMs) recentCount++;
  const recentWeekly = recentCount / (riskConfig.recentWindowDays / 7);

  const availDays = Math.min(riskConfig.baselineWindowDays, daysSinceJoin - riskConfig.recentWindowDays);
  let baselineWeekly: number | null = null;
  if (availDays >= riskConfig.minBaselineWeeks * 7) {
    const start = now - recentMs - availDays * DAY_MS;
    let count = 0;
    for (const ts of entradas) if (ts >= start && ts < now - recentMs) count++;
    baselineWeekly = count / (availDays / 7);
  }

  return classifyRisk({
    status: draft.status,
    daysSinceLastAccess,
    daysSinceJoin,
    baselineWeekly,
    recentWeekly,
  }).level;
}

/** A ausência informada continua coerente com o status já atribuído? */
function absenceFitsStatus(draft: StudentDraft, days: number, today: Date): boolean {
  if (draft.status === 'inadimplente') return true;
  if (draft.status !== 'ativo') return false;
  if (days <= UNCOVERED_ACTIVE_MAX_DAYS) return true;
  const { commitmentMonths } = PLAN_SPECS[draft.planIndex];
  return commitmentMonths > 1 && days <= paidCycleDays(draft.join, today, commitmentMonths);
}

/**
 * Garante que os quatro níveis de risco existem: se faltar algum, apara os
 * eventos recentes de um aluno cuja ausência resultante continue coerente com
 * o status dele.
 */
function ensureRiskCoverage(rng: Rng, drafts: StudentDraft[], today: Date, now: number): void {
  const present = new Set<RiskLevel>();
  for (const draft of drafts) {
    const level = classifyDraft(draft, today, now);
    if (level !== null) present.add(level);
  }

  const targets: readonly [RiskLevel, number][] = [
    ['MEDIUM', 8],
    ['HIGH', 15],
    ['CRITICAL', 35],
  ];
  for (const [level, gapDays] of targets) {
    if (present.has(level)) continue;
    const cutoff = now - gapDays * DAY_MS;
    const candidates = drafts.filter(
      (d) =>
        (d.status === 'ativo' || d.status === 'inadimplente') &&
        (d.archetype === 'regular' || d.archetype === 'dedicado') &&
        d.events.length > 40 &&
        absenceFitsStatus(d, gapDays, today),
    );
    for (const draft of rng.shuffle(candidates).slice(0, 30)) {
      const backup = draft.events;
      draft.events = draft.events.filter((e) => e.ts < cutoff);
      if (classifyDraft(draft, today, now) === level) {
        present.add(level);
        break;
      }
      draft.events = backup;
    }
  }
}

const ABSENCE_BANDS = [
  { label: '0-6', max: 6 },
  { label: '7-13', max: 13 },
  { label: '14-29', max: 29 },
  { label: '30+', max: Number.POSITIVE_INFINITY },
] as const;

interface BandCell {
  ativo: number;
  inadimplente: number;
  pausado: number;
}

interface BandRow {
  mensal: BandCell;
  periodo: BandCell;
}

function bandIndex(days: number): number {
  for (let i = 0; i < ABSENCE_BANDS.length; i++) {
    if (days <= ABSENCE_BANDS[i].max) return i;
  }
  return ABSENCE_BANDS.length - 1;
}

/** Matriculados por faixa de ausência cruzada com o tipo de cobrança do plano. */
function crossTabAbsence(drafts: StudentDraft[], today: Date, now: number): BandRow[] {
  const rows: BandRow[] = ABSENCE_BANDS.map(() => ({
    mensal: { ativo: 0, inadimplente: 0, pausado: 0 },
    periodo: { ativo: 0, inadimplente: 0, pausado: 0 },
  }));
  for (const draft of drafts) {
    if (draft.status === 'cancelado') continue;
    const row = rows[bandIndex(absenceDays(draft, today, now))];
    const cell = PLAN_SPECS[draft.planIndex].commitmentMonths === 1 ? row.mensal : row.periodo;
    if (draft.status === 'ativo') cell.ativo++;
    else if (draft.status === 'inadimplente') cell.inadimplente++;
    else if (draft.status === 'pausado') cell.pausado++;
  }
  return rows;
}

function fmtCell(cell: BandCell): string {
  return `${String(cell.ativo).padStart(4)}/${String(cell.inadimplente).padStart(3)}/${String(cell.pausado).padStart(3)}`;
}

function validateAndReport(drafts: StudentDraft[], today: Date, now: number): void {
  const problemas: string[] = [];
  let ativosLongaAusencia = 0;
  let ativosLongaAusenciaCobertos = 0;
  let maiorAusenciaAtivoMensal = 0;

  for (const draft of drafts) {
    if (draft.status === 'cancelado') continue;
    const days = absenceDays(draft, today, now);
    const { commitmentMonths, nome } = PLAN_SPECS[draft.planIndex];
    const cycle = paidCycleDays(draft.join, today, commitmentMonths);

    if (draft.status === 'ativo' && days >= LONG_ABSENCE_DAYS) {
      ativosLongaAusencia++;
      if (commitmentMonths > 1 && days <= cycle) ativosLongaAusenciaCobertos++;
    }
    if (draft.status === 'ativo' && commitmentMonths === 1) {
      maiorAusenciaAtivoMensal = Math.max(maiorAusenciaAtivoMensal, days);
    }
    if (draft.status === 'ativo' && days > UNCOVERED_ACTIVE_MAX_DAYS) {
      if (commitmentMonths === 1) {
        problemas.push(`${draft.nome}: ativo no plano ${nome} com ${days} dias de ausência`);
      } else if (days > cycle) {
        problemas.push(
          `${draft.nome}: ativo no plano ${nome} com ${days} dias de ausência, ` +
            `além do período pago (${cycle} dias)`,
        );
      }
    }
    if (draft.status === 'pausado' && days > PAUSE_ABSENCE_MAX_DAYS) {
      problemas.push(`${draft.nome}: pausado com ${days} dias de ausência`);
    }
  }
  if (problemas.length > 0) {
    throw new Error(
      `Validação falhou: ${problemas.length} status incoerente(s) com a ausência. ` +
        `Primeiro caso — ${problemas[0]}.`,
    );
  }

  const matriculados = drafts.filter((d) => d.status !== 'cancelado').length;
  const inadimplentes = drafts.filter((d) => d.status === 'inadimplente').length;
  const shareInadimplentes = matriculados > 0 ? inadimplentes / matriculados : 0;
  if (matriculados === 0) {
    throw new Error('Validação falhou: nenhum aluno matriculado.');
  }
  if (shareInadimplentes < 0.02 || shareInadimplentes > 0.15) {
    throw new Error(
      `Validação falhou: inadimplentes em ${(shareInadimplentes * 100).toFixed(1)}% ` +
        'dos matriculados, fora da faixa plausível de 2% a 15%.',
    );
  }

  const counts: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const draft of drafts) {
    const level = classifyDraft(draft, today, now);
    if (level !== null) counts[level]++;
  }
  for (const level of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
    if (counts[level] === 0) {
      throw new Error(`Validação falhou: nenhum aluno no nível de risco ${level}.`);
    }
  }

  let futuros = 0;
  let foraDaMatricula = 0;
  for (const draft of drafts) {
    const inicio = draft.join.getTime();
    const fim = draft.exit ? addDays(draft.exit, 1).getTime() : null;
    for (const e of draft.events) {
      if (e.ts > now) futuros++;
      else if (e.ts < inicio || (fim !== null && e.ts >= fim)) foraDaMatricula++;
    }
  }
  if (futuros > 0) {
    throw new Error(`Validação falhou: ${futuros} evento(s) com timestamp no futuro.`);
  }
  if (foraDaMatricula > 0) {
    throw new Error(
      `Validação falhou: ${foraDaMatricula} evento(s) fora do intervalo entre entrada e saída.`,
    );
  }

  const rows = crossTabAbsence(drafts, today, now);
  console.log('Validação do gerador:');
  console.log(
    `  Risco (ativos e inadimplentes): LOW ${counts.LOW}, MEDIUM ${counts.MEDIUM}, ` +
      `HIGH ${counts.HIGH}, CRITICAL ${counts.CRITICAL}`,
  );
  console.log(
    `  Matriculados: ${matriculados}; inadimplentes ${inadimplentes} ` +
      `(${(shareInadimplentes * 100).toFixed(1)}%)`,
  );
  console.log('  Matriculados por faixa de ausência [ativo/inadimplente/pausado]:');
  console.log(`    ${'dias'.padEnd(7)}${'cobrança mensal'.padEnd(20)}período pago`);
  for (let i = 0; i < ABSENCE_BANDS.length; i++) {
    console.log(
      `    ${ABSENCE_BANDS[i].label.padEnd(7)}${fmtCell(rows[i].mensal).padEnd(20)}` +
        fmtCell(rows[i].periodo),
    );
  }
  console.log(
    `  Ativos com ${LONG_ABSENCE_DAYS}+ dias de ausência: ${ativosLongaAusencia}, ` +
      `dos quais ${ativosLongaAusenciaCobertos} dentro do período já pago`,
  );
  console.log(
    `  Maior ausência de um ativo em plano de cobrança mensal: ` +
      `${maiorAusenciaAtivoMensal} dias (limite ${UNCOVERED_ACTIVE_MAX_DAYS})`,
  );
  console.log('  Eventos no futuro: 0; fora do intervalo entrada–saída: 0');
}

// ------------------------------------------------------------------ geração

export function generateAcademyData(opts: GenerateOptions): {
  students: number;
  accessEvents: number;
} {
  if (!Number.isInteger(opts.students) || opts.students <= 0) {
    throw new Error('Quantidade de alunos inválida.');
  }
  if (!Number.isInteger(opts.months) || opts.months < 1) {
    throw new Error('Quantidade de meses inválida.');
  }

  const rng = new Rng(opts.seed ?? 42);
  const now = Date.now();
  const ref = new Date(now);
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  const usedNames = new Set<string>();
  const usedEmails = new Set<string>();
  const drafts: StudentDraft[] = [];

  for (const { monthStart, count } of allocateEntriesPerMonth(rng, today, opts.months, opts.students)) {
    const isCurrentMonth =
      monthStart.getFullYear() === today.getFullYear() && monthStart.getMonth() === today.getMonth();
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const maxDay = isCurrentMonth ? today.getDate() : daysInMonth;
    for (let k = 0; k < count; k++) {
      const join = new Date(monthStart.getFullYear(), monthStart.getMonth(), rng.int(1, maxDay));
      drafts.push(buildDraft(rng, join, today, usedNames, usedEmails));
    }
  }

  for (const draft of drafts) buildEvents(rng, draft, now);
  enforcePlannedLapse(rng, drafts, today, now);
  assignEnrolledStatuses(rng, drafts, today, now);
  ensureRiskCoverage(rng, drafts, today, now);
  validateAndReport(drafts, today, now);

  const insertPlan = sqlite.prepare(
    'INSERT INTO plans (academy_id, nome, valor_centavos) VALUES (?, ?, ?)',
  );
  const insertStudent = sqlite.prepare(
    'INSERT INTO students (academy_id, plano_id, nome, email, telefone, data_entrada, data_saida, status, mensalidade_centavos) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insertEvent = sqlite.prepare(
    'INSERT INTO access_events (academy_id, aluno_id, timestamp, tipo_evento) VALUES (?, ?, ?, ?)',
  );

  let accessEvents = 0;
  const persist = sqlite.transaction(() => {
    const planIds = PLAN_SPECS.map((p) =>
      Number(insertPlan.run(opts.academyId, p.nome, p.valorCentavos).lastInsertRowid),
    );
    for (const draft of drafts) {
      const studentId = Number(
        insertStudent.run(
          opts.academyId,
          planIds[draft.planIndex],
          draft.nome,
          draft.email,
          draft.telefone,
          fmtDate(draft.join),
          draft.exit ? fmtDate(draft.exit) : null,
          draft.status,
          draft.mensalidadeCentavos,
        ).lastInsertRowid,
      );
      draft.events.sort((a, b) => a.ts - b.ts);
      for (const e of draft.events) {
        insertEvent.run(opts.academyId, studentId, e.ts, e.tipo);
        accessEvents++;
      }
    }
  });
  persist();

  return { students: drafts.length, accessEvents };
}
