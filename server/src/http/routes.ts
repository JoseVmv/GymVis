import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { MetricsConfigResponse } from '@gymvis/shared';
import { getAuth, requireAuth } from '../auth/middleware';
import { registerAuthRoutes } from '../auth/routes';
import { alertConfig } from '../config/alerts';
import { riskConfig } from '../config/risk';
import { getAlerts } from '../services/alerts';
import { getCharts } from '../services/charts';
import { academyHasStudents, generateDemoData } from '../services/demo';
import { getOverview } from '../services/overview';
import { getRetention } from '../services/retention';
import { getRevenueAtRisk } from '../services/revenue';
import { getStudentProfile, listStudents } from '../services/students';

/**
 * O Express 4 não captura rejeições de handlers async — este wrapper
 * encaminha o erro para o error handler registrado em index.ts.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

const overviewQuerySchema = z.object({
  period: z.coerce
    .number({ invalid_type_error: 'Período inválido' })
    .refine((v) => v === 7 || v === 30 || v === 90, { message: 'Período inválido' })
    .default(30),
});

const idParamSchema = z.coerce.number().int().positive();

export function registerRoutes(app: Express): void {
  const api = Router();

  registerAuthRoutes(api);

  api.get('/overview', requireAuth, (req, res) => {
    const parsed = overviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Parâmetros inválidos' });
      return;
    }
    res.json(getOverview(getAuth(res).academyId, parsed.data.period));
  });

  api.get('/alerts', requireAuth, (req, res) => {
    res.json(getAlerts(getAuth(res).academyId));
  });

  // Regras em vigor: a página Sobre explica as métricas com estes números,
  // em vez de repetir os limiares à mão e deixá-los divergir do cálculo.
  api.get('/config', requireAuth, (_req, res) => {
    const body: MetricsConfigResponse = { risk: riskConfig, alerts: alertConfig };
    res.json(body);
  });

  api.get('/revenue-at-risk', requireAuth, (req, res) => {
    res.json(getRevenueAtRisk(getAuth(res).academyId));
  });

  api.get('/charts', requireAuth, (req, res) => {
    res.json(getCharts(getAuth(res).academyId));
  });

  api.get('/students', requireAuth, (req, res) => {
    res.json(listStudents(getAuth(res).academyId));
  });

  api.get('/students/:id', requireAuth, (req, res) => {
    const parsed = idParamSchema.safeParse(req.params.id);
    const profile = parsed.success
      ? getStudentProfile(getAuth(res).academyId, parsed.data)
      : null;
    if (!profile) {
      res.status(404).json({ error: 'Aluno não encontrado' });
      return;
    }
    res.json(profile);
  });

  api.get('/retention', requireAuth, (req, res) => {
    res.json(getRetention(getAuth(res).academyId));
  });

  api.post(
    '/demo-data',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { academyId } = getAuth(res);
      if (academyHasStudents(academyId)) {
        res.status(409).json({ error: 'Esta academia já possui dados' });
        return;
      }
      res.json(await generateDemoData(academyId));
    }),
  );

  // Rotas desconhecidas sob /api (antes do fallback do index.ts).
  api.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  app.use('/api', api);
}
