import type { Plan, PlanPayload } from '@gymvis/shared';
import { invalidarCache } from './metricsCache';
import { db } from '../db/client';

const LISTAR = `
  SELECT p.id, p.nome, p.valor_centavos, p.duracao_meses,
         (SELECT COUNT(*) FROM students s WHERE s.plano_id = p.id) AS alunos
  FROM plans p
  WHERE p.academy_id = ?
  ORDER BY p.duracao_meses, lower(p.nome) COLLATE "pt-BR-x-icu", p.id
`;

const INSERIR =
  'INSERT INTO plans (academy_id, nome, valor_centavos, duracao_meses) VALUES (?, ?, ?, ?) RETURNING id';

const ATUALIZAR =
  'UPDATE plans SET nome = ?, valor_centavos = ?, duracao_meses = ? WHERE id = ? AND academy_id = ?';

const APAGAR = 'DELETE FROM plans WHERE id = ? AND academy_id = ?';

const CONTAR_ALUNOS = 'SELECT COUNT(*) AS c FROM students WHERE plano_id = ? AND academy_id = ?';

const PERTENCE = 'SELECT 1 AS ok FROM plans WHERE id = ? AND academy_id = ?';

interface PlanRow {
  id: number;
  nome: string;
  valor_centavos: number;
  duracao_meses: number;
  alunos: number;
}

export async function listPlans(academyId: number): Promise<Plan[]> {
  const linhas = await db.all<PlanRow>(LISTAR, academyId);
  return linhas.map((r) => ({
    id: r.id,
    nome: r.nome,
    valorCentavos: r.valor_centavos,
    duracaoMeses: r.duracao_meses,
    alunos: r.alunos,
  }));
}

export async function createPlan(academyId: number, payload: PlanPayload): Promise<number> {
  const linha = await db.one<{ id: number }>(
    INSERIR,
    academyId,
    payload.nome.trim(),
    payload.valorCentavos,
    payload.duracaoMeses,
  );
  invalidarCache(academyId);
  return linha!.id;
}

/** false quando o plano não existe nesta academia. */
export async function updatePlan(
  academyId: number,
  id: number,
  payload: PlanPayload,
): Promise<boolean> {
  const afetadas = await db.run(
    ATUALIZAR,
    payload.nome.trim(),
    payload.valorCentavos,
    payload.duracaoMeses,
    id,
    academyId,
  );
  invalidarCache(academyId);
  return afetadas > 0;
}

export type PlanDeleteResult = 'ok' | 'nao-encontrado' | 'em-uso';

export async function deletePlan(academyId: number, id: number): Promise<PlanDeleteResult> {
  const linha = await db.one<{ c: number }>(CONTAR_ALUNOS, id, academyId);
  if ((linha?.c ?? 0) > 0) return 'em-uso';
  invalidarCache(academyId);
  return (await db.run(APAGAR, id, academyId)) > 0 ? 'ok' : 'nao-encontrado';
}

export async function planBelongsToAcademy(academyId: number, planId: number): Promise<boolean> {
  return (await db.one(PERTENCE, planId, academyId)) !== undefined;
}
