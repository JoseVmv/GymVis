import type { StudentPayload } from '@gymvis/shared';
import { db } from '../db/client';
import { invalidarCache } from './metricsCache';
import { planBelongsToAcademy } from './plans';
import { promotionBelongsToAcademy } from './promotions';

/** Cadastro e edição manual de alunos. */

const INSERIR = `
  INSERT INTO students
    (academy_id, plano_id, promocao_id, nome, email, telefone,
     data_entrada, data_saida, status, mensalidade_centavos)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING id
`;

const ATUALIZAR = `
  UPDATE students SET
    plano_id = ?, promocao_id = ?, nome = ?, email = ?, telefone = ?,
    data_entrada = ?, data_saida = ?, status = ?, mensalidade_centavos = ?
  WHERE id = ? AND academy_id = ?
`;

const APAGAR_ALUNO = 'DELETE FROM students WHERE id = ? AND academy_id = ?';
const APAGAR_ACESSOS = 'DELETE FROM access_events WHERE aluno_id = ? AND academy_id = ?';

const INSERIR_ACESSO =
  "INSERT INTO access_events (academy_id, aluno_id, timestamp, tipo_evento) VALUES (?, ?, ?, 'entrada')";

const ALUNO_EXISTE = 'SELECT data_entrada FROM students WHERE id = ? AND academy_id = ?';

export type WriteError =
  | { ok: false; motivo: 'plano-invalido' }
  | { ok: false; motivo: 'promocao-invalida' }
  | { ok: false; motivo: 'nao-encontrado' }
  | { ok: false; motivo: 'saida-antes-da-entrada' };

export type WriteResult = { ok: true; id: number } | WriteError;

async function validateRefs(academyId: number, p: StudentPayload): Promise<WriteError | null> {
  if (!(await planBelongsToAcademy(academyId, p.planoId))) {
    return { ok: false, motivo: 'plano-invalido' };
  }
  if (p.promocaoId !== null && !(await promotionBelongsToAcademy(academyId, p.promocaoId))) {
    return { ok: false, motivo: 'promocao-invalida' };
  }
  if (p.dataSaida !== null && p.dataSaida < p.dataEntrada) {
    return { ok: false, motivo: 'saida-antes-da-entrada' };
  }
  return null;
}

const nullIfBlank = (s: string | null): string | null => {
  const t = s?.trim() ?? '';
  return t.length > 0 ? t : null;
};

export async function createStudent(academyId: number, p: StudentPayload): Promise<WriteResult> {
  const invalid = await validateRefs(academyId, p);
  if (invalid) return invalid;

  const linha = await db.one<{ id: number }>(
    INSERIR,
    academyId,
    p.planoId,
    p.promocaoId,
    p.nome.trim(),
    nullIfBlank(p.email),
    nullIfBlank(p.telefone),
    p.dataEntrada,
    p.dataSaida,
    p.status,
    p.mensalidadeCentavos,
  );
  invalidarCache(academyId);
  return { ok: true, id: linha!.id };
}

export async function updateStudent(
  academyId: number,
  id: number,
  p: StudentPayload,
): Promise<WriteResult> {
  const invalid = await validateRefs(academyId, p);
  if (invalid) return invalid;

  const afetadas = await db.run(
    ATUALIZAR,
    p.planoId,
    p.promocaoId,
    p.nome.trim(),
    nullIfBlank(p.email),
    nullIfBlank(p.telefone),
    p.dataEntrada,
    p.dataSaida,
    p.status,
    p.mensalidadeCentavos,
    id,
    academyId,
  );

  invalidarCache(academyId);
  return afetadas > 0 ? { ok: true, id } : { ok: false, motivo: 'nao-encontrado' };
}

/** Excluir o aluno apaga também seus acessos (o histórico não faz sentido sozinho). */
export async function deleteStudent(academyId: number, id: number): Promise<boolean> {
  invalidarCache(academyId);
  return db.transaction(async (tx) => {
    await tx.run(APAGAR_ACESSOS, id, academyId);
    return (await tx.run(APAGAR_ALUNO, id, academyId)) > 0;
  });
}

export type AccessResult = 'ok' | 'nao-encontrado' | 'antes-da-entrada' | 'no-futuro';

/** Registro manual de acesso, para quando a catraca falhou. */
export async function addAccess(
  academyId: number,
  studentId: number,
  timestamp: number,
): Promise<AccessResult> {
  const row = await db.one<{ data_entrada: string }>(ALUNO_EXISTE, studentId, academyId);
  if (!row) return 'nao-encontrado';
  if (timestamp > Date.now()) return 'no-futuro';

  const d = new Date(timestamp);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dia < row.data_entrada) return 'antes-da-entrada';

  await db.run(INSERIR_ACESSO, academyId, studentId, timestamp);
  invalidarCache(academyId);
  return 'ok';
}
