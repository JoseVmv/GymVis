import type { Plan, PlanPayload } from '@gymvis/shared';
import { sqlite } from '../db/client';

const listStmt = sqlite.prepare(`
  SELECT p.id, p.nome, p.valor_centavos, p.duracao_meses,
         (SELECT COUNT(*) FROM students s WHERE s.plano_id = p.id) AS alunos
  FROM plans p
  WHERE p.academy_id = ?
  ORDER BY p.duracao_meses, p.nome COLLATE NOCASE
`);

const insertStmt = sqlite.prepare(
  'INSERT INTO plans (academy_id, nome, valor_centavos, duracao_meses) VALUES (?, ?, ?, ?)',
);

const updateStmt = sqlite.prepare(
  'UPDATE plans SET nome = ?, valor_centavos = ?, duracao_meses = ? WHERE id = ? AND academy_id = ?',
);

const deleteStmt = sqlite.prepare('DELETE FROM plans WHERE id = ? AND academy_id = ?');

const countStudentsStmt = sqlite.prepare(
  'SELECT COUNT(*) AS c FROM students WHERE plano_id = ? AND academy_id = ?',
);

interface PlanRow {
  id: number;
  nome: string;
  valor_centavos: number;
  duracao_meses: number;
  alunos: number;
}

export function listPlans(academyId: number): Plan[] {
  return (listStmt.all(academyId) as PlanRow[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    valorCentavos: r.valor_centavos,
    duracaoMeses: r.duracao_meses,
    alunos: r.alunos,
  }));
}

export function createPlan(academyId: number, payload: PlanPayload): number {
  const info = insertStmt.run(
    academyId,
    payload.nome.trim(),
    payload.valorCentavos,
    payload.duracaoMeses,
  );
  return Number(info.lastInsertRowid);
}

/** false quando o plano não existe nesta academia. */
export function updatePlan(academyId: number, id: number, payload: PlanPayload): boolean {
  const info = updateStmt.run(
    payload.nome.trim(),
    payload.valorCentavos,
    payload.duracaoMeses,
    id,
    academyId,
  );
  return info.changes > 0;
}

export type PlanDeleteResult = 'ok' | 'nao-encontrado' | 'em-uso';

export function deletePlan(academyId: number, id: number): PlanDeleteResult {
  const usados = (countStudentsStmt.get(id, academyId) as { c: number }).c;
  if (usados > 0) return 'em-uso';
  return deleteStmt.run(id, academyId).changes > 0 ? 'ok' : 'nao-encontrado';
}

export function planBelongsToAcademy(academyId: number, planId: number): boolean {
  const row = sqlite
    .prepare('SELECT 1 AS ok FROM plans WHERE id = ? AND academy_id = ?')
    .get(planId, academyId);
  return row !== undefined;
}
