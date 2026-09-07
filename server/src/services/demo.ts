import type { DemoDataResponse } from '@gymvis/shared';
import { sqlite } from '../db/client';

const DEMO_STUDENTS = 800;
const DEMO_MONTHS = 12;

const countStudentsStmt = sqlite.prepare(
  'SELECT COUNT(*) AS c FROM students WHERE academy_id = ?',
);

export function academyHasStudents(academyId: number): boolean {
  return (countStudentsStmt.get(academyId) as { c: number }).c > 0;
}

export async function generateDemoData(academyId: number): Promise<DemoDataResponse> {
  // Import dinâmico: o gerador é pesado e só é usado nesta rota.
  const { generateAcademyData } = await import('../seed/generator');
  const result = generateAcademyData({ academyId, students: DEMO_STUDENTS, months: DEMO_MONTHS });
  return { ok: true, students: result.students, accessEvents: result.accessEvents };
}
