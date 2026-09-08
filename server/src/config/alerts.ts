import type { AlertThresholds } from '@gymvis/shared';
import { riskConfig, type RiskRules } from './risk';

/**
 * Faixas dos alertas do dashboard. São um requisito de produto próprio, não
 * derivado das regras de risco — por isso ficam aqui, e não em ./risk.ts.
 *
 * Os valores viajam na resposta de /api/alerts para que a interface escreva os
 * rótulos a partir deles ("Sem acesso há 7–13 dias") em vez de repeti-los.
 */
export const alertConfig: AlertThresholds = {
  inactivityDays: [7, 14, 30],
  frequencyDrop: riskConfig.frequencyDrop.medium,
  minBaselineWeekly: riskConfig.minBaselineWeeklyForDrop,
};

/**
 * Faixas de alerta de uma academia. A faixa mais grave e o limiar de queda
 * acompanham o que o dono configurou para o risco, para o painel não dizer
 * "30 dias" enquanto a classificação usa outro número.
 */
export function alertThresholdsFor(rules: RiskRules): AlertThresholds {
  const first = rules.inactivity.medium;
  const second = Math.max(first + 1, alertConfig.inactivityDays[1]);
  const third = Math.max(second + 1, rules.inactivity.critical);
  return {
    inactivityDays: [first, second, third],
    frequencyDrop: rules.frequencyDrop.medium,
    minBaselineWeekly: alertConfig.minBaselineWeekly,
  };
}
