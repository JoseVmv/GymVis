import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { MetricsConfigResponse } from '@gymvis/shared';
import { getAuth, requireAuth } from '../auth/middleware';
import { registerAuthRoutes } from '../auth/routes';
import { alertThresholdsFor } from '../config/alerts';
import { riskConfig } from '../config/risk';
import { getAlerts } from '../services/alerts';
import { getCharts } from '../services/charts';
import { academyHasStudents, generateDemoData } from '../services/demo';
import {
  createExpense,
  deleteExpense,
  getFinance,
  updateExpense,
} from '../services/finance';
import { getOverview } from '../services/overview';
import { createPlan, deletePlan, updatePlan } from '../services/plans';
import { createPromotion, deletePromotion, updatePromotion } from '../services/promotions';
import { getRetention } from '../services/retention';
import { getRevenueAtRisk } from '../services/revenue';
import { getRiskRules, getSettingsPage, saveSettings } from '../services/settings';
import { getStudentProfile, listStudents } from '../services/students';
import {
  addAccess,
  createStudent,
  deleteStudent,
  updateStudent,
  type WriteResult,
} from '../services/studentWrite';

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

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data inválida');

const centavosSchema = z
  .number({ invalid_type_error: 'Valor inválido' })
  .int('Valor inválido')
  .min(0, 'O valor não pode ser negativo')
  .max(100_000_000, 'Valor acima do limite');

const expenseSchema = z.object({
  descricao: z.string().trim().min(1, 'Informe a descrição').max(120, 'Descrição muito longa'),
  categoria: z.enum([
    'manutencao',
    'equipamento',
    'folha',
    'aluguel',
    'utilidades',
    'marketing',
    'limpeza',
    'outros',
  ]),
  valorCentavos: centavosSchema.min(1, 'Informe um valor maior que zero'),
  data: dateSchema,
});

const planSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do plano').max(60, 'Nome muito longo'),
  valorCentavos: centavosSchema.min(1, 'Informe um valor maior que zero'),
  duracaoMeses: z.number().int().min(1, 'Duração mínima de 1 mês').max(36, 'Duração máxima de 36 meses'),
});

const promotionSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da promoção').max(60, 'Nome muito longo'),
  descontoCentavos: centavosSchema,
  ativa: z.boolean(),
});

const settingsSchema = z
  .object({
    academiaNome: z.string().trim().min(1, 'Informe o nome da academia').max(80, 'Nome muito longo'),
    inactivityMedium: z.number().int().min(1).max(365),
    inactivityHigh: z.number().int().min(1).max(365),
    inactivityCritical: z.number().int().min(1).max(365),
    frequencyDropMedium: z.number().min(0.05).max(0.95),
    frequencyDropHigh: z.number().min(0.05).max(0.95),
  })
  .refine((s) => s.inactivityMedium < s.inactivityHigh, {
    message: 'O limiar de risco alto deve ser maior que o de risco médio',
  })
  .refine((s) => s.inactivityHigh < s.inactivityCritical, {
    message: 'O limiar de risco crítico deve ser maior que o de risco alto',
  })
  .refine((s) => s.frequencyDropMedium < s.frequencyDropHigh, {
    message: 'A queda de risco alto deve ser maior que a de risco médio',
  });

const studentSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aluno').max(120, 'Nome muito longo'),
  email: z.string().trim().email('E-mail inválido').max(160).nullable().or(z.literal('')),
  telefone: z.string().trim().max(30, 'Telefone muito longo').nullable().or(z.literal('')),
  planoId: z.number().int().positive('Selecione um plano'),
  promocaoId: z.number().int().positive().nullable(),
  mensalidadeCentavos: centavosSchema,
  dataEntrada: dateSchema,
  dataSaida: dateSchema.nullable(),
  status: z.enum(['ativo', 'pausado', 'cancelado', 'inadimplente']),
});

const accessSchema = z.object({
  timestamp: z.number().int().positive('Data e hora inválidas'),
});

/** Primeira mensagem de erro do zod, para a interface exibir. */
function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Dados inválidos';
}

const WRITE_ERROR_MESSAGES: Record<string, string> = {
  'plano-invalido': 'Plano inválido',
  'promocao-invalida': 'Promoção inválida',
  'nao-encontrado': 'Aluno não encontrado',
  'saida-antes-da-entrada': 'A data de saída não pode ser anterior à de entrada',
};

function sendWriteResult(res: Response, result: WriteResult): void {
  if (result.ok) {
    res.json({ id: result.id });
    return;
  }
  const status = result.motivo === 'nao-encontrado' ? 404 : 400;
  res.status(status).json({ error: WRITE_ERROR_MESSAGES[result.motivo] });
}

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
    const rules = getRiskRules(getAuth(res).academyId);
    const body: MetricsConfigResponse = {
      risk: { ...riskConfig, ...rules },
      alerts: alertThresholdsFor(rules),
    };
    res.json(body);
  });

  // ------------------------------------------------------------ Rendimentos

  api.get('/finance', requireAuth, (req, res) => {
    const parsed = z.coerce
      .number()
      .refine((v) => v === 6 || v === 12 || v === 24, { message: 'Período inválido' })
      .default(12)
      .safeParse(req.query.months);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    res.json(getFinance(getAuth(res).academyId, parsed.data));
  });

  api.post('/expenses', requireAuth, (req, res) => {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    res.json({ id: createExpense(getAuth(res).academyId, parsed.data) });
  });

  api.put('/expenses/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    const parsed = expenseSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ error: 'Despesa não encontrada' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    if (!updateExpense(getAuth(res).academyId, id.data, parsed.data)) {
      res.status(404).json({ error: 'Despesa não encontrada' });
      return;
    }
    res.json({ id: id.data });
  });

  api.delete('/expenses/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success || !deleteExpense(getAuth(res).academyId, id.data)) {
      res.status(404).json({ error: 'Despesa não encontrada' });
      return;
    }
    res.json({ ok: true });
  });

  // ----------------------------------------------------------- Configurações

  api.get('/settings', requireAuth, (_req, res) => {
    res.json(getSettingsPage(getAuth(res).academyId));
  });

  api.put('/settings', requireAuth, (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    saveSettings(getAuth(res).academyId, parsed.data);
    res.json(getSettingsPage(getAuth(res).academyId));
  });

  api.post('/plans', requireAuth, (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    res.json({ id: createPlan(getAuth(res).academyId, parsed.data) });
  });

  api.put('/plans/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    const parsed = planSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    if (!updatePlan(getAuth(res).academyId, id.data, parsed.data)) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    res.json({ id: id.data });
  });

  api.delete('/plans/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    const result = deletePlan(getAuth(res).academyId, id.data);
    if (result === 'em-uso') {
      res.status(409).json({ error: 'Há alunos neste plano. Mova-os antes de excluir.' });
      return;
    }
    if (result === 'nao-encontrado') {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    res.json({ ok: true });
  });

  api.post('/promotions', requireAuth, (req, res) => {
    const parsed = promotionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    res.json({ id: createPromotion(getAuth(res).academyId, parsed.data) });
  });

  api.put('/promotions/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    const parsed = promotionSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ error: 'Promoção não encontrada' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    if (!updatePromotion(getAuth(res).academyId, id.data, parsed.data)) {
      res.status(404).json({ error: 'Promoção não encontrada' });
      return;
    }
    res.json({ id: id.data });
  });

  api.delete('/promotions/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success || !deletePromotion(getAuth(res).academyId, id.data)) {
      res.status(404).json({ error: 'Promoção não encontrada' });
      return;
    }
    res.json({ ok: true });
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

  api.post('/students', requireAuth, (req, res) => {
    const parsed = studentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    const { email, telefone, ...rest } = parsed.data;
    sendWriteResult(
      res,
      createStudent(getAuth(res).academyId, {
        ...rest,
        email: email || null,
        telefone: telefone || null,
      }),
    );
  });

  api.put('/students/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    const parsed = studentSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ error: 'Aluno não encontrado' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    const { email, telefone, ...rest } = parsed.data;
    sendWriteResult(
      res,
      updateStudent(getAuth(res).academyId, id.data, {
        ...rest,
        email: email || null,
        telefone: telefone || null,
      }),
    );
  });

  api.delete('/students/:id', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success || !deleteStudent(getAuth(res).academyId, id.data)) {
      res.status(404).json({ error: 'Aluno não encontrado' });
      return;
    }
    res.json({ ok: true });
  });

  api.post('/students/:id/accesses', requireAuth, (req, res) => {
    const id = idParamSchema.safeParse(req.params.id);
    const parsed = accessSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ error: 'Aluno não encontrado' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) });
      return;
    }
    const result = addAccess(getAuth(res).academyId, id.data, parsed.data.timestamp);
    const erros: Record<string, { status: number; error: string }> = {
      'nao-encontrado': { status: 404, error: 'Aluno não encontrado' },
      'antes-da-entrada': { status: 400, error: 'O acesso é anterior à data de entrada' },
      'no-futuro': { status: 400, error: 'O acesso não pode estar no futuro' },
    };
    if (result !== 'ok') {
      const e = erros[result];
      res.status(e.status).json({ error: e.error });
      return;
    }
    res.json({ ok: true });
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
