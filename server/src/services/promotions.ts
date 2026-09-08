import type { Promotion, PromotionPayload } from '@gymvis/shared';
import { invalidarCache } from './metricsCache';
import { db } from '../db/client';

const LISTAR = `
  SELECT p.id, p.nome, p.desconto_centavos, p.ativa,
         (SELECT COUNT(*) FROM students s WHERE s.promocao_id = p.id) AS alunos
  FROM promotions p
  WHERE p.academy_id = ?
  ORDER BY p.ativa DESC, p.created_at DESC, p.id DESC
`;

const INSERIR =
  'INSERT INTO promotions (academy_id, nome, desconto_centavos, ativa, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id';

const ATUALIZAR =
  'UPDATE promotions SET nome = ?, desconto_centavos = ?, ativa = ? WHERE id = ? AND academy_id = ?';

const APAGAR = 'DELETE FROM promotions WHERE id = ? AND academy_id = ?';

const DESVINCULAR_ALUNOS =
  'UPDATE students SET promocao_id = NULL WHERE promocao_id = ? AND academy_id = ?';

const PERTENCE = 'SELECT 1 AS ok FROM promotions WHERE id = ? AND academy_id = ?';

interface PromotionRow {
  id: number;
  nome: string;
  desconto_centavos: number;
  /** No Postgres a coluna é boolean de verdade. */
  ativa: boolean;
  alunos: number;
}

export async function listPromotions(academyId: number): Promise<Promotion[]> {
  const linhas = await db.all<PromotionRow>(LISTAR, academyId);
  return linhas.map((r) => ({
    id: r.id,
    nome: r.nome,
    descontoCentavos: r.desconto_centavos,
    ativa: r.ativa,
    alunos: r.alunos,
  }));
}

export async function createPromotion(
  academyId: number,
  payload: PromotionPayload,
): Promise<number> {
  const linha = await db.one<{ id: number }>(
    INSERIR,
    academyId,
    payload.nome.trim(),
    payload.descontoCentavos,
    payload.ativa,
    Date.now(),
  );
  invalidarCache(academyId);
  return linha!.id;
}

export async function updatePromotion(
  academyId: number,
  id: number,
  payload: PromotionPayload,
): Promise<boolean> {
  const afetadas = await db.run(
    ATUALIZAR,
    payload.nome.trim(),
    payload.descontoCentavos,
    payload.ativa,
    id,
    academyId,
  );
  invalidarCache(academyId);
  return afetadas > 0;
}

/** Excluir a promoção desvincula os alunos, em vez de bloquear a exclusão. */
export async function deletePromotion(academyId: number, id: number): Promise<boolean> {
  invalidarCache(academyId);
  return db.transaction(async (tx) => {
    await tx.run(DESVINCULAR_ALUNOS, id, academyId);
    return (await tx.run(APAGAR, id, academyId)) > 0;
  });
}

export async function promotionBelongsToAcademy(
  academyId: number,
  promotionId: number,
): Promise<boolean> {
  return (await db.one(PERTENCE, promotionId, academyId)) !== undefined;
}
