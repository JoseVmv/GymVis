import type { AlertThresholds } from '@gymvis/shared';
import { riskConfig } from './risk';

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
