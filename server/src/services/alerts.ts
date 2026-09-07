import type { AlertBucket, AlertStudent, AlertsResponse } from '@gymvis/shared';
import { alertConfig } from '../config/alerts';
import {
  computeStudentMetrics,
  effectiveDaysWithoutAccess,
  isEnrolled,
  type StudentMetrics,
} from './studentMetrics';

const MAX_SAMPLE = 100;

function toAlertStudent(m: StudentMetrics): AlertStudent {
  return {
    id: m.id,
    nome: m.nome,
    status: m.status,
    mensalidadeCentavos: m.mensalidadeCentavos,
    daysSinceLastAccess: m.daysSinceLastAccess,
    baselineWeekly: m.baselineWeekly,
    recentWeekly: m.recentWeekly,
    variation: m.variation,
  };
}

function bucket(sorted: StudentMetrics[]): AlertBucket {
  return {
    count: sorted.length,
    students: sorted.slice(0, MAX_SAMPLE).map(toAlertStudent),
  };
}

export function getAlerts(academyId: number): AlertsResponse {
  const enrolled = computeStudentMetrics(academyId).filter((m) => isEnrolled(m.status));

  // Buckets exclusivos por dias efetivos sem acesso.
  const [firstDays, secondDays, thirdDays] = alertConfig.inactivityDays;
  const inactive7: StudentMetrics[] = [];
  const inactive14: StudentMetrics[] = [];
  const inactive30: StudentMetrics[] = [];
  for (const m of enrolled) {
    const days = effectiveDaysWithoutAccess(m);
    if (days >= thirdDays) inactive30.push(m);
    else if (days >= secondDays) inactive14.push(m);
    else if (days >= firstDays) inactive7.push(m);
  }
  const byDaysDesc = (a: StudentMetrics, b: StudentMetrics): number =>
    effectiveDaysWithoutAccess(b) - effectiveDaysWithoutAccess(a);
  inactive7.sort(byDaysDesc);
  inactive14.sort(byDaysDesc);
  inactive30.sort(byDaysDesc);

  const frequencyDrop = enrolled
    .filter(
      (m) =>
        m.variation !== null &&
        m.variation <= -alertConfig.frequencyDrop &&
        m.baselineWeekly !== null &&
        m.baselineWeekly >= alertConfig.minBaselineWeekly,
    )
    .sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0));

  return {
    thresholds: alertConfig,
    inactive7: bucket(inactive7),
    inactive14: bucket(inactive14),
    inactive30: bucket(inactive30),
    frequencyDrop: bucket(frequencyDrop),
  };
}
