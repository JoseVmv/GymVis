import type { RevenueAtRiskResponse } from '@gymvis/shared';
import { computeStudentMetrics, isEnrolled } from './studentMetrics';

export async function getRevenueAtRisk(academyId: number): Promise<RevenueAtRiskResponse> {
  const todos = await computeStudentMetrics(academyId);
  const enrolled = todos.filter((m) => isEnrolled(m.status));

  let highCount = 0;
  let highCentavos = 0;
  let criticalCount = 0;
  let criticalCentavos = 0;
  let activeMonthlyRevenueCentavos = 0;

  for (const m of enrolled) {
    activeMonthlyRevenueCentavos += m.mensalidadeCentavos;
    if (m.risk === 'HIGH') {
      highCount += 1;
      highCentavos += m.mensalidadeCentavos;
    } else if (m.risk === 'CRITICAL') {
      criticalCount += 1;
      criticalCentavos += m.mensalidadeCentavos;
    }
  }

  return {
    totalCentavos: highCentavos + criticalCentavos,
    highCount,
    highCentavos,
    criticalCount,
    criticalCentavos,
    activeMonthlyRevenueCentavos,
  };
}
