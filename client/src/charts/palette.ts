import type { RiskLevel } from '@gymvis/shared';

/**
 * Paleta de visualização de dados (validada para daltonismo).
 * Cores de status são reservadas para significado (risco) e nunca
 * reutilizadas como cor de série comum.
 */
export const viz = {
  /** Série principal (magnitude/tendência). */
  blue: '#2a78d6',
  blueStrong: '#1c5cab',
  /** Polo negativo do par divergente (cancelamentos). */
  red: '#e34948',
  /** Lavagem de área sob linhas (~10% de opacidade). */
  areaWash: 'rgba(42, 120, 214, 0.10)',

  grid: '#e1e0d9',
  axis: '#c3c2b7',
  tick: '#898781',

  /** Cursor de hover sobre barras. */
  barCursor: 'rgba(21, 21, 20, 0.05)',
} as const;

export const riskColor: Record<RiskLevel, string> = {
  LOW: '#0ca30c',
  MEDIUM: '#fab219',
  HIGH: '#ec835a',
  CRITICAL: '#d03b3b',
};

/** Rampa sequencial azul (claro → escuro) para o heatmap de retenção. */
export const blueRamp = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
] as const;

/** Escolhe tinta legível (branca/escura) sobre um passo da rampa. */
export function inkOnRampStep(stepIndex: number): string {
  return stepIndex >= 6 ? '#ffffff' : '#151514';
}
