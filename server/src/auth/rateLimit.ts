/**
 * Limitador de tentativas em memória, por IP.
 *
 * Suficiente para um processo único; se o app virar multi-instância, troque o
 * Map por um contador compartilhado (Redis, ou a própria tabela do banco).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimit {
  /** Registra uma tentativa. Retorna false quando o limite foi estourado. */
  attempt: (key: string) => boolean;
  /** Zera o contador de uma chave (use após sucesso). */
  clear: (key: string) => void;
}

export function createRateLimit(maxAttempts: number, windowMs: number): RateLimit {
  const buckets = new Map<string, Bucket>();

  function sweep(now: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    attempt(key) {
      const now = Date.now();
      if (buckets.size > 5000) sweep(now);

      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      bucket.count += 1;
      return bucket.count <= maxAttempts;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}
