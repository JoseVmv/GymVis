import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

// Carrega o .env da raiz do repositório quando ele existe. Em produção as
// variáveis vêm da plataforma e este arquivo simplesmente não está lá.
try {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  process.loadEnvFile(path.resolve(aqui, '../../../.env'));
} catch {
  // Sem .env: seguimos com o ambiente já definido.
}

/**
 * Conexão com o Postgres (Supabase).
 *
 * Usamos o transaction pooler, que não suporta prepared statements nomeados —
 * daí `prepare: false`.
 *
 * O parser de int8 é substituído de propósito: por padrão o driver devolve
 * bigint como string para não perder precisão, e todo o cálculo de métricas
 * deste projeto trata timestamps e contagens como number. Um `COUNT(*)`
 * chegando como "800" quebraria a aritmética em silêncio, sem erro de tipo.
 * Os valores aqui (epoch ms e contagens) cabem com folga em Number.
 */
const bigintComoNumero = {
  to: 20,
  from: [20],
  serialize: (x: number) => String(x),
  parse: (x: string) => Number(x),
};

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL não definida. Copie .env.example para .env e preencha a conexão do Supabase.',
  );
}

/*
 * Pool deliberadamente pequeno. Medindo contra o Supabase, uma consulta
 * trivial leva ~150 ms (o RTT), mas quatro consultas simultâneas num pool
 * frio levaram ~1,4 s: cada conexão nova paga um handshake TLS. Poucas
 * conexões, reaproveitadas, custam menos que muitas conexões paralelas.
 */
export const sql = postgres(url, {
  prepare: false,
  ssl: 'require',
  max: Number(process.env.DATABASE_POOL_MAX ?? 3),
  idle_timeout: 300,
  connect_timeout: 20,
  types: { bigint: bigintComoNumero },
});

/**
 * Abre as conexões do pool antes da primeira requisição, para o usuário não
 * pagar o handshake TLS no primeiro clique.
 */
export async function aquecerConexoes(): Promise<void> {
  const quantas = Number(process.env.DATABASE_POOL_MAX ?? 3);
  await Promise.all(Array.from({ length: quantas }, () => sql`select 1`));
}

/**
 * Converte os `?` das consultas para a numeração posicional do Postgres.
 * Mantém o texto SQL do projeto praticamente inalterado na migração.
 */
function posicional(texto: string): string {
  let i = 0;
  return texto.replace(/\?/g, () => `$${++i}`);
}

type Params = readonly unknown[];

/** Acesso ao banco. Os parâmetros são sempre vinculados, nunca interpolados. */
export const db = {
  /** Primeira linha, ou undefined. */
  async one<T>(texto: string, ...params: Params): Promise<T | undefined> {
    const linhas = await sql.unsafe(posicional(texto), params as never[]);
    return linhas[0] as T | undefined;
  },

  /** Todas as linhas. */
  async all<T>(texto: string, ...params: Params): Promise<T[]> {
    const linhas = await sql.unsafe(posicional(texto), params as never[]);
    return linhas as unknown as T[];
  },

  /** Comando sem retorno; devolve quantas linhas foram afetadas. */
  async run(texto: string, ...params: Params): Promise<number> {
    const resultado = await sql.unsafe(posicional(texto), params as never[]);
    return resultado.count ?? 0;
  },

  /**
   * Executa `fn` dentro de uma transação. Uma exceção desfaz tudo.
   * Dentro dela, use o `tx` recebido — não o `db` global.
   */
  transaction<T>(fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return sql.begin(async (t) => {
      const tx: Transacao = {
        async one<R>(texto: string, ...params: Params): Promise<R | undefined> {
          const linhas = await t.unsafe(posicional(texto), params as never[]);
          return linhas[0] as R | undefined;
        },
        async all<R>(texto: string, ...params: Params): Promise<R[]> {
          const linhas = await t.unsafe(posicional(texto), params as never[]);
          return linhas as unknown as R[];
        },
        async run(texto: string, ...params: Params): Promise<number> {
          const resultado = await t.unsafe(posicional(texto), params as never[]);
          return resultado.count ?? 0;
        },
      };
      return fn(tx);
    }) as Promise<T>;
  },
};

export interface Transacao {
  one<T>(texto: string, ...params: Params): Promise<T | undefined>;
  all<T>(texto: string, ...params: Params): Promise<T[]>;
  run(texto: string, ...params: Params): Promise<number>;
}

export async function fecharConexao(): Promise<void> {
  await sql.end();
}
