import type { RiskLevel } from '@gymvis/shared';

/**
 * Paleta de visualização sobre o fundo escuro do produto.
 *
 * O verde da marca (#338f60) rende 3,6:1 sobre a superfície dos cartões —
 * suficiente para preenchimento, apagado demais para um traço de 2px. As
 * séries usam a versão clara; o verde da marca fica para áreas grandes.
 *
 * As cores de status são reservadas para significado (risco) e nunca
 * reutilizadas como cor de série comum.
 */
export const viz = {
  /** Série principal (magnitude/tendência). */
  green: '#4fbf83',
  greenStrong: '#338f60',
  /** Polo negativo do par divergente (cancelamentos). */
  red: '#e0524f',
  /** Lavagem de área sob linhas. */
  areaWash: 'rgba(79, 191, 131, 0.12)',

  grid: '#2e322f',
  axis: '#3d4744',
  tick: '#8a938c',

  /** Cursor de hover sobre barras. */
  barCursor: 'rgba(237, 240, 235, 0.045)',
  /** Anel do ponto ativo na linha — a cor do cartão, para recortá-lo do traço. */
  dotRing: '#242623',
} as const;

export const riskColor: Record<RiskLevel, string> = {
  LOW: '#3ea972',
  MEDIUM: '#d7a32f',
  HIGH: '#de7a3e',
  CRITICAL: '#e0524f',
};

/**
 * Rampa sequencial verde para o mapa de calor de retenção: mais escuro é
 * menos turma retida.
 *
 * A rampa fica inteira na metade escura de propósito. Um verde claro no topo
 * daria mais alcance visual, mas nenhuma cor de texto fecharia 4,5:1 no meio
 * da escala — e o número dentro da célula é o que se lê de verdade. O ganho
 * de sinal vem do croma, que sobe junto com o valor.
 */
export const retentionRamp = [
  '#1c211f',
  '#1f2924',
  '#213229',
  '#233b2e',
  '#254433',
  '#274e39',
  '#29583f',
  '#2b6245',
  '#2f6c4c',
  '#337a57',
] as const;

/**
 * Piso da escala de cor do mapa de calor.
 *
 * Coorte de academia raramente cai abaixo da metade, então esticar a rampa de
 * 0 a 100% joga fora metade dela — foi o que apareceu na primeira versão:
 * dados de 53% a 100% em cinco tons quase iguais. Ancorar em 50% dobra a
 * resolução onde os dados de fato vivem, e a escala continua absoluta (a
 * mesma cor quer dizer sempre o mesmo valor).
 */
export const RETENTION_FLOOR = 0.5;

/** Mapeia uma retenção 0..1 para um passo da rampa, com piso em 50%. */
export function retentionStep(value: number): number {
  const t = (value - RETENTION_FLOOR) / (1 - RETENTION_FLOOR);
  const step = Math.round(t * (retentionRamp.length - 1));
  return Math.max(0, Math.min(retentionRamp.length - 1, step));
}

/** Tinta legível sobre qualquer passo da rampa (todos ficam ≥ 4,5:1). */
export function inkOnRampStep(): string {
  return '#e4ede7';
}
