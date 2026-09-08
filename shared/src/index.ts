/**
 * Contrato de tipos compartilhado entre servidor e cliente.
 *
 * Este pacote contém APENAS tipos — importe sempre com `import type`.
 *
 * Convenções:
 * - dinheiro trafega em centavos (inteiro);
 * - instantes trafegam como epoch em milissegundos (number);
 * - datas de calendário trafegam como 'YYYY-MM-DD' (string);
 * - meses como 'YYYY-MM'.
 */

export type StudentStatus = 'ativo' | 'pausado' | 'cancelado' | 'inadimplente';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EventType = 'entrada' | 'saida';

/** Categorias de despesa da academia. */
export type ExpenseCategory =
  | 'manutencao'
  | 'equipamento'
  | 'folha'
  | 'aluguel'
  | 'utilidades'
  | 'marketing'
  | 'limpeza'
  | 'outros';

// ---------------------------------------------------------------- Autenticação

export interface SessionUser {
  id: number;
  nome: string;
  email: string;
  academyId: number;
  academyNome: string;
}

export interface AuthResponse {
  user: SessionUser;
}

export interface RegisterPayload {
  nome: string;
  academiaNome: string;
  email: string;
  senha: string;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

/** Corpo padrão de erro da API. */
export interface ApiErrorBody {
  error: string;
}

// ---------------------------------------------------------------- Visão geral

export interface OverviewResponse {
  periodDays: number;
  /** Matriculados hoje com status 'ativo' ou 'inadimplente'. */
  activeStudents: number;
  delinquentStudents: number;
  pausedStudents: number;
  /** Entradas (data_entrada) dentro do período. */
  newStudents: number;
  newStudentsPrev: number;
  /** Saídas (data_saida com status 'cancelado') dentro do período. */
  cancellations: number;
  cancellationsPrev: number;
  netGrowth: number;
  netGrowthPrev: number;
  totalAccesses: number;
  totalAccessesPrev: number;
  /**
   * Acessos por aluno por semana no período. O denominador é a base
   * matriculada vigente em cada janela (pelas datas de entrada e saída), para
   * que as duas janelas sejam comparáveis quando a academia cresce ou encolhe.
   */
  avgWeeklyFrequency: number;
  avgWeeklyFrequencyPrev: number;
}

// -------------------------------------------------------------------- Alertas

export interface AlertStudent {
  id: number;
  nome: string;
  status: StudentStatus;
  mensalidadeCentavos: number;
  /** null quando o aluno nunca registrou acesso (conta desde a entrada). */
  daysSinceLastAccess: number | null;
  baselineWeekly: number | null;
  recentWeekly: number;
  /** Variação relativa recente vs. histórico: -0.5 = queda de 50%. */
  variation: number | null;
}

export interface AlertBucket {
  count: number;
  /** Amostra ordenada (mais grave primeiro), no máximo 100 itens. */
  students: AlertStudent[];
}

/** Limiares que definem os alertas — a interface escreve os rótulos a partir daqui. */
export interface AlertThresholds {
  /** Faixas de dias sem acesso, em ordem crescente. Padrão: [7, 14, 30]. */
  inactivityDays: [number, number, number];
  /** Queda relativa mínima de frequência. 0.3 = 30%. */
  frequencyDrop: number;
  /** Frequência histórica mínima (x/semana) para a queda virar alerta. */
  minBaselineWeekly: number;
}

/** Identifica um alerta do painel; usado como filtro na listagem de alunos. */
export type AlertKey = 'inativo7' | 'inativo14' | 'inativo30' | 'queda';

/** Regras de risco em vigor, para a página Sobre explicar os números reais. */
export interface RiskThresholds {
  recentWindowDays: number;
  baselineWindowDays: number;
  minBaselineWeeks: number;
  inactivity: { medium: number; high: number; critical: number };
  frequencyDrop: { medium: number; high: number };
  minBaselineWeeklyForDrop: number;
}

export interface MetricsConfigResponse {
  risk: RiskThresholds;
  alerts: AlertThresholds;
}

export interface AlertsResponse {
  thresholds: AlertThresholds;
  /** Sem acesso na 1ª faixa (exclui quem já está na 2ª). */
  inactive7: AlertBucket;
  /** Sem acesso na 2ª faixa (exclui quem já está na 3ª). */
  inactive14: AlertBucket;
  /** Sem acesso na 3ª faixa ou além. */
  inactive30: AlertBucket;
  /** Queda de frequência a partir de `thresholds.frequencyDrop`. */
  frequencyDrop: AlertBucket;
}

// ------------------------------------------------------------ Receita em risco

export interface RevenueAtRiskResponse {
  /** Soma das mensalidades dos alunos em risco HIGH + CRITICAL. */
  totalCentavos: number;
  highCount: number;
  highCentavos: number;
  criticalCount: number;
  criticalCentavos: number;
  /** Receita mensal total dos matriculados (ativos + inadimplentes), para contexto. */
  activeMonthlyRevenueCentavos: number;
}

// ------------------------------------------------------------------- Gráficos

export interface MonthPoint {
  /** 'YYYY-MM' */
  month: string;
  /** Rótulo curto pt-BR, ex.: 'set/26' */
  label: string;
  value: number;
}

export interface FlowPoint {
  month: string;
  label: string;
  novos: number;
  cancelamentos: number;
}

export interface WeekPoint {
  /** Segunda-feira da semana, 'YYYY-MM-DD'. */
  weekStart: string;
  /** Rótulo curto pt-BR, ex.: '01/09'. */
  label: string;
  value: number;
}

export interface RiskSlice {
  level: RiskLevel;
  count: number;
}

export interface ChartsResponse {
  /**
   * Matriculados ao fim de cada mês, últimos 12 meses — pelas datas de entrada
   * e saída, então inclui pausados (o banco não guarda histórico de status).
   */
  activeEvolution: MonthPoint[];
  /** Novos vs. cancelamentos por mês, últimos 12 meses. */
  flow: FlowPoint[];
  /** Total de acessos por semana, últimas 12 semanas fechadas. */
  weeklyAccesses: WeekPoint[];
  /** Frequência média semanal (acessos/aluno/semana) por mês, últimos 12 meses. */
  avgFrequency: MonthPoint[];
  /** Distribuição atual dos matriculados por nível de risco. */
  riskDistribution: RiskSlice[];
}

// --------------------------------------------------------------------- Alunos

export interface StudentListItem {
  id: number;
  nome: string;
  status: StudentStatus;
  planoId: number;
  planoNome: string;
  /** Promoção em que o aluno se inscreveu, quando houver. */
  promocaoId: number | null;
  promocaoNome: string | null;
  mensalidadeCentavos: number;
  dataEntrada: string;
  dataSaida: string | null;
  lastAccessAt: number | null;
  daysSinceLastAccess: number | null;
  /**
   * Dias desde a entrada. Substitui `daysSinceLastAccess` na contagem de
   * inatividade de quem nunca registrou acesso.
   */
  daysSinceJoin: number;
  /** Frequência histórica (x/semana); null quando há pouco histórico. */
  baselineWeekly: number | null;
  /** Frequência das últimas 4 semanas (x/semana). */
  recentWeekly: number;
  variation: number | null;
  /** null para alunos cancelados ou pausados (risco não se aplica). */
  risk: RiskLevel | null;
}

export interface StudentsResponse {
  students: StudentListItem[];
  /** Os mesmos limiares de /api/alerts: a listagem reproduz os buckets ali. */
  alertThresholds: AlertThresholds;
  generatedAt: number;
}

export interface WeeklyFrequencyPoint {
  weekStart: string;
  label: string;
  count: number;
}

/**
 * Um acesso registrado. O perfil expõe apenas entradas — as saídas ficam
 * armazenadas, mas nenhuma métrica do produto as utiliza.
 */
export interface AccessRecord {
  timestamp: number;
  tipoEvento: Extract<EventType, 'entrada'>;
}

export interface StudentProfileResponse extends StudentListItem {
  email: string | null;
  telefone: string | null;
  /** Explicações da classificação de risco, em pt-BR. Vazio quando LOW/null. */
  riskReasons: string[];
  /** Acessos por semana desde a entrada (máx. 52 semanas mais recentes). */
  weeklySeries: WeeklyFrequencyPoint[];
  /** Últimos acessos, mais recentes primeiro (máx. 60). */
  recentAccesses: AccessRecord[];
}

// ------------------------------------------------------------------- Retenção

export interface RetentionCohort {
  /** Mês de entrada da coorte, 'YYYY-MM'. */
  cohort: string;
  label: string;
  /** Quantos alunos entraram nesse mês. */
  size: number;
  /**
   * values[i] = fração da coorte ainda matriculada i meses após a entrada
   * (0..1). null para meses ainda no futuro.
   */
  values: (number | null)[];
}

export interface RetentionResponse {
  cohorts: RetentionCohort[];
  /** Número de colunas (meses desde a entrada) na matriz. */
  months: number;
  /** Curva média entre coortes com dado disponível. */
  averageCurve: (number | null)[];
}

// ------------------------------------------------------------ Dados de demonstração

export interface DemoDataResponse {
  ok: true;
  students: number;
  accessEvents: number;
}

// ---------------------------------------------------------------- Rendimentos

export interface Expense {
  id: number;
  descricao: string;
  categoria: ExpenseCategory;
  valorCentavos: number;
  /** 'YYYY-MM-DD' */
  data: string;
}

export interface ExpensePayload {
  descricao: string;
  categoria: ExpenseCategory;
  valorCentavos: number;
  data: string;
}

export interface FinanceMonth {
  month: string;
  label: string;
  /** Mensalidades dos matriculados no fim do mês, exceto inadimplentes. */
  receitaCentavos: number;
  /** Mensalidades de quem estava inadimplente: cobrado, mas não recebido. */
  inadimplenciaCentavos: number;
  despesasCentavos: number;
  /** receita − despesas. */
  resultadoCentavos: number;
}

export interface FinanceResponse {
  periodMonths: number;
  meses: FinanceMonth[];
  /** Totais do período coberto por `meses`. */
  receitaCentavos: number;
  inadimplenciaCentavos: number;
  despesasCentavos: number;
  resultadoCentavos: number;
  /** Faturamento projetado do mês corrente, pelos matriculados de hoje. */
  receitaMensalAtualCentavos: number;
  /** Ticket médio dos matriculados hoje. */
  ticketMedioCentavos: number;
  despesasPorCategoria: { categoria: ExpenseCategory; valorCentavos: number }[];
  expenses: Expense[];
}

// -------------------------------------------------------- Planos e promoções

export interface Plan {
  id: number;
  nome: string;
  valorCentavos: number;
  /** Meses cobrados de uma vez. 1 = mensal. */
  duracaoMeses: number;
  /** Quantos alunos usam este plano (impede exclusão quando > 0). */
  alunos: number;
}

export interface PlanPayload {
  nome: string;
  valorCentavos: number;
  duracaoMeses: number;
}

export interface Promotion {
  id: number;
  nome: string;
  /** Desconto aplicado sobre o valor do plano, em centavos. */
  descontoCentavos: number;
  ativa: boolean;
  alunos: number;
}

export interface PromotionPayload {
  nome: string;
  descontoCentavos: number;
  ativa: boolean;
}

// ------------------------------------------------------------ Configurações

/** Limiares editáveis pela academia; o servidor traz os padrões de fábrica. */
export interface AcademySettings {
  academiaNome: string;
  inactivityMedium: number;
  inactivityHigh: number;
  inactivityCritical: number;
  frequencyDropMedium: number;
  frequencyDropHigh: number;
}

export interface SettingsResponse {
  settings: AcademySettings;
  /** Valores de fábrica, para o botão "restaurar padrão". */
  defaults: AcademySettings;
  plans: Plan[];
  promotions: Promotion[];
}

// -------------------------------------------------- Cadastro manual de aluno

export interface StudentPayload {
  nome: string;
  email: string | null;
  telefone: string | null;
  planoId: number;
  promocaoId: number | null;
  mensalidadeCentavos: number;
  dataEntrada: string;
  dataSaida: string | null;
  status: StudentStatus;
}

export interface StudentMutationResponse {
  id: number;
}

/** Registro manual de um acesso (quando a catraca falhou, por exemplo). */
export interface AccessPayload {
  /** epoch ms */
  timestamp: number;
}
