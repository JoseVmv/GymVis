import type { RiskLevel, StudentStatus } from '@gymvis/shared';

/**
 * Regras de classificação de risco de evasão — transparentes e centralizadas.
 * Ajuste os thresholds aqui; nenhum número mágico deve existir fora deste arquivo.
 */
export const riskConfig = {
  /** Janela "recente": últimas 4 semanas completas. */
  recentWindowDays: 28,
  /** Janela do histórico (baseline), terminando onde a recente começa. */
  baselineWindowDays: 180,
  /** Histórico mínimo (em semanas) para calcular baseline confiável. */
  minBaselineWeeks: 2,
  /** Dias sem acesso. */
  inactivity: { medium: 7, high: 10, critical: 30 },
  /** Queda relativa de frequência (recente vs. baseline). */
  frequencyDrop: { medium: 0.3, high: 0.5 },
  /** Queda só é significativa se o aluno frequentava ≥ 1x/semana. */
  minBaselineWeeklyForDrop: 1,
} as const;

export interface RiskInput {
  status: StudentStatus;
  /** null = nunca registrou acesso. */
  daysSinceLastAccess: number | null;
  /** Dias desde a data de entrada; usado no lugar acima quando nunca acessou. */
  daysSinceJoin: number;
  /** null = histórico insuficiente. */
  baselineWeekly: number | null;
  recentWeekly: number;
}

export interface RiskResult {
  level: RiskLevel | null;
  /** Explicações legíveis, em pt-BR, na ordem de gravidade. */
  reasons: string[];
}

/**
 * Classifica o risco de evasão de um aluno. Retorna level null para alunos
 * cancelados ou pausados (risco não se aplica).
 */
export function classifyRisk(input: RiskInput): RiskResult {
  if (input.status === 'cancelado' || input.status === 'pausado') {
    return { level: null, reasons: [] };
  }

  const { inactivity, frequencyDrop, minBaselineWeeklyForDrop } = riskConfig;
  const neverAccessed = input.daysSinceLastAccess === null;
  const days = input.daysSinceLastAccess ?? input.daysSinceJoin;
  const reasons: string[] = [];

  const variation =
    input.baselineWeekly !== null && input.baselineWeekly > 0
      ? (input.recentWeekly - input.baselineWeekly) / input.baselineWeekly
      : null;
  const dropApplies =
    variation !== null &&
    input.baselineWeekly !== null &&
    input.baselineWeekly >= minBaselineWeeklyForDrop;

  let level: RiskLevel = 'LOW';

  if (dropApplies && variation <= -frequencyDrop.medium) {
    level = 'MEDIUM';
    reasons.push(
      `Queda de ${Math.round(-variation * 100)}% na frequência ` +
        `(${input.baselineWeekly!.toFixed(1)}x → ${input.recentWeekly.toFixed(1)}x por semana)`,
    );
  }
  if (dropApplies && variation <= -frequencyDrop.high) {
    level = 'HIGH';
  }

  const inactivityReason = neverAccessed
    ? `Nunca registrou acesso (${days} dias desde a entrada)`
    : `${days} dias sem acesso`;

  if (days >= inactivity.medium && days < inactivity.high) {
    if (level === 'LOW') level = 'MEDIUM';
    reasons.unshift(inactivityReason);
  }
  if (days >= inactivity.high) {
    level = 'HIGH';
    reasons.unshift(inactivityReason);
  }
  if (days >= inactivity.critical) {
    level = 'CRITICAL';
  }

  return { level, reasons };
}
