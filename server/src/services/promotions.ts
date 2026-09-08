import type { Promotion, PromotionPayload } from '@gymvis/shared';
import { sqlite } from '../db/client';

const listStmt = sqlite.prepare(`
  SELECT p.id, p.nome, p.desconto_centavos, p.ativa,
         (SELECT COUNT(*) FROM students s WHERE s.promocao_id = p.id) AS alunos
  FROM promotions p
  WHERE p.academy_id = ?
  ORDER BY p.ativa DESC, p.created_at DESC
`);

const insertStmt = sqlite.prepare(
  'INSERT INTO promotions (academy_id, nome, desconto_centavos, ativa, created_at) VALUES (?, ?, ?, ?, ?)',
);

const updateStmt = sqlite.prepare(
  'UPDATE promotions SET nome = ?, desconto_centavos = ?, ativa = ? WHERE id = ? AND academy_id = ?',
);

const deleteStmt = sqlite.prepare('DELETE FROM promotions WHERE id = ? AND academy_id = ?');

const clearFromStudentsStmt = sqlite.prepare(
  'UPDATE students SET promocao_id = NULL WHERE promocao_id = ? AND academy_id = ?',
);

interface PromotionRow {
  id: number;
  nome: string;
  desconto_centavos: number;
  ativa: number;
  alunos: number;
}

export function listPromotions(academyId: number): Promotion[] {
  return (listStmt.all(academyId) as PromotionRow[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    descontoCentavos: r.desconto_centavos,
    ativa: r.ativa === 1,
    alunos: r.alunos,
  }));
}

export function createPromotion(academyId: number, payload: PromotionPayload): number {
  const info = insertStmt.run(
    academyId,
    payload.nome.trim(),
    payload.descontoCentavos,
    payload.ativa ? 1 : 0,
    Date.now(),
  );
  return Number(info.lastInsertRowid);
}

export function updatePromotion(
  academyId: number,
  id: number,
  payload: PromotionPayload,
): boolean {
  const info = updateStmt.run(
    payload.nome.trim(),
    payload.descontoCentavos,
    payload.ativa ? 1 : 0,
    id,
    academyId,
  );
  return info.changes > 0;
}

/** Excluir a promoção desvincula os alunos, em vez de bloquear a exclusão. */
const deleteTx = sqlite.transaction((academyId: number, id: number) => {
  clearFromStudentsStmt.run(id, academyId);
  return deleteStmt.run(id, academyId).changes > 0;
});

export function deletePromotion(academyId: number, id: number): boolean {
  return deleteTx(academyId, id);
}

export function promotionBelongsToAcademy(academyId: number, promotionId: number): boolean {
  const row = sqlite
    .prepare('SELECT 1 AS ok FROM promotions WHERE id = ? AND academy_id = ?')
    .get(promotionId, academyId);
  return row !== undefined;
}
