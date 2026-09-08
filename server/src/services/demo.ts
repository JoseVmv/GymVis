import type { DemoDataResponse } from '@gymvis/shared';
import { invalidarCache } from './metricsCache';
import { db } from '../db/client';

const DEMO_STUDENTS = 800;
const DEMO_MONTHS = 12;

const CONTAR_ALUNOS = 'SELECT COUNT(*) AS c FROM students WHERE academy_id = ?';

export async function academyHasStudents(academyId: number): Promise<boolean> {
  const linha = await db.one<{ c: number }>(CONTAR_ALUNOS, academyId);
  return (linha?.c ?? 0) > 0;
}

export async function generateDemoData(academyId: number): Promise<DemoDataResponse> {
  // Import dinâmico: o gerador é pesado e só é usado nesta rota.
  const { generateAcademyData } = await import('../seed/generator');
  const result = await generateAcademyData({
    academyId,
    students: DEMO_STUDENTS,
    months: DEMO_MONTHS,
  });
  invalidarCache(academyId);
  return { ok: true, students: result.students, accessEvents: result.accessEvents };
}
