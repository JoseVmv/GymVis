import type { StudentMetrics } from './studentMetrics';

/**
 * Cache curto das métricas por aluno.
 *
 * O painel dispara /overview, /alerts, /charts e /revenue-at-risk em paralelo,
 * e três deles recalculam exatamente o mesmo conjunto — com o banco a um RTT
 * de distância, isso é o trabalho pesado feito quatro vezes por carregamento.
 *
 * O TTL é curto e qualquer escrita na academia invalida a entrada, então o
 * dono nunca vê o resultado da própria edição desatualizado.
 */

interface Entrada {
  metricas: StudentMetrics[];
  em: number;
}

const TTL_MS = 15_000;
const cache = new Map<number, Entrada>();

export function lerCache(academyId: number, agora: number): StudentMetrics[] | null {
  const entrada = cache.get(academyId);
  if (!entrada) return null;
  if (agora - entrada.em > TTL_MS) {
    cache.delete(academyId);
    return null;
  }
  return entrada.metricas;
}

export function gravarCache(academyId: number, metricas: StudentMetrics[], agora: number): void {
  cache.set(academyId, { metricas, em: agora });
}

/** Chame após qualquer escrita que afete alunos, acessos, planos ou regras. */
export function invalidarCache(academyId: number): void {
  cache.delete(academyId);
}
