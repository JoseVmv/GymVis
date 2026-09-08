import type { StudentPayload } from '@gymvis/shared';
import { sqlite } from '../db/client';
import { planBelongsToAcademy } from './plans';
import { promotionBelongsToAcademy } from './promotions';

/** Cadastro e edição manual de alunos. */

const insertStmt = sqlite.prepare(`
  INSERT INTO students
    (academy_id, plano_id, promocao_id, nome, email, telefone,
     data_entrada, data_saida, status, mensalidade_centavos)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateStmt = sqlite.prepare(`
  UPDATE students SET
    plano_id = ?, promocao_id = ?, nome = ?, email = ?, telefone = ?,
    data_entrada = ?, data_saida = ?, status = ?, mensalidade_centavos = ?
  WHERE id = ? AND academy_id = ?
`);

const deleteStudentStmt = sqlite.prepare('DELETE FROM students WHERE id = ? AND academy_id = ?');
const deleteAccessesStmt = sqlite.prepare(
  'DELETE FROM access_events WHERE aluno_id = ? AND academy_id = ?',
);

const insertAccessStmt = sqlite.prepare(
  "INSERT INTO access_events (academy_id, aluno_id, timestamp, tipo_evento) VALUES (?, ?, ?, 'entrada')",
);

const studentExistsStmt = sqlite.prepare(
  'SELECT data_entrada FROM students WHERE id = ? AND academy_id = ?',
);

export type WriteError =
  | { ok: false; motivo: 'plano-invalido' }
  | { ok: false; motivo: 'promocao-invalida' }
  | { ok: false; motivo: 'nao-encontrado' }
  | { ok: false; motivo: 'saida-antes-da-entrada' };

export type WriteResult = { ok: true; id: number } | WriteError;

function validateRefs(academyId: number, p: StudentPayload): WriteError | null {
  if (!planBelongsToAcademy(academyId, p.planoId)) return { ok: false, motivo: 'plano-invalido' };
  if (p.promocaoId !== null && !promotionBelongsToAcademy(academyId, p.promocaoId)) {
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

export function createStudent(academyId: number, p: StudentPayload): WriteResult {
  const invalid = validateRefs(academyId, p);
  if (invalid) return invalid;

  const info = insertStmt.run(
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
  return { ok: true, id: Number(info.lastInsertRowid) };
}

export function updateStudent(academyId: number, id: number, p: StudentPayload): WriteResult {
  const invalid = validateRefs(academyId, p);
  if (invalid) return invalid;

  const changes = updateStmt.run(
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
  ).changes;

  return changes > 0 ? { ok: true, id } : { ok: false, motivo: 'nao-encontrado' };
}

/** Excluir o aluno apaga também seus acessos (o histórico não faz sentido sozinho). */
const deleteTx = sqlite.transaction((academyId: number, id: number) => {
  deleteAccessesStmt.run(id, academyId);
  return deleteStudentStmt.run(id, academyId).changes > 0;
});

export function deleteStudent(academyId: number, id: number): boolean {
  return deleteTx(academyId, id);
}

export type AccessResult = 'ok' | 'nao-encontrado' | 'antes-da-entrada' | 'no-futuro';

/** Registro manual de acesso, para quando a catraca falhou. */
export function addAccess(academyId: number, studentId: number, timestamp: number): AccessResult {
  const row = studentExistsStmt.get(studentId, academyId) as { data_entrada: string } | undefined;
  if (!row) return 'nao-encontrado';
  if (timestamp > Date.now()) return 'no-futuro';

  const d = new Date(timestamp);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dia < row.data_entrada) return 'antes-da-entrada';

  insertAccessStmt.run(academyId, studentId, timestamp);
  return 'ok';
}
