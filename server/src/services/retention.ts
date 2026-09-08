import type { RetentionCohort, RetentionResponse } from '@gymvis/shared';
import { db } from '../db/client';
import { addMonths, monthKey, monthLabel, round4, startOfMonth, toDateStr } from '../lib/dates';

const MONTHS = 12;

const COORTES = `
  SELECT data_entrada, data_saida
  FROM students
  WHERE academy_id = ?
`;

interface CohortRow {
  data_entrada: string;
  data_saida: string | null;
}

export async function getRetention(
  academyId: number,
  now = new Date(),
): Promise<RetentionResponse> {
  const rows = await db.all<CohortRow>(COORTES, academyId);
  const today = toDateStr(now);
  const currentMonthStart = startOfMonth(now);

  // Agrupa por mês de entrada.
  const byMonth = new Map<string, CohortRow[]>();
  for (const r of rows) {
    const key = r.data_entrada.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(r);
    else byMonth.set(key, [r]);
  }

  const cohorts: RetentionCohort[] = [];
  const survivorSums = new Array<number>(MONTHS).fill(0);
  const sizeSums = new Array<number>(MONTHS).fill(0);

  for (let k = MONTHS - 1; k >= 0; k--) {
    const cohortStart = addMonths(currentMonthStart, -k);
    const key = monthKey(cohortStart);
    const members = byMonth.get(key) ?? [];
    if (members.length === 0) continue; // coortes vazias são omitidas

    const values: (number | null)[] = [];
    for (let i = 0; i < MONTHS; i++) {
      const checkpoint = toDateStr(addMonths(cohortStart, i));
      if (checkpoint > today) {
        values.push(null);
        continue;
      }
      let survivors = 0;
      for (const r of members) {
        if (r.data_saida === null || r.data_saida >= checkpoint) survivors += 1;
      }
      values.push(round4(survivors / members.length));
      survivorSums[i] += survivors;
      sizeSums[i] += members.length;
    }

    cohorts.push({
      cohort: key,
      label: monthLabel(cohortStart),
      size: members.length,
      values,
    });
  }

  const averageCurve = survivorSums.map((sum, i) =>
    sizeSums[i] > 0 ? round4(sum / sizeSums[i]) : null,
  );

  return { cohorts, months: MONTHS, averageCurve };
}
