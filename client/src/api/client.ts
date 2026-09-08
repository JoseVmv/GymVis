import type {
  AcademySettings,
  AccessPayload,
  AlertsResponse,
  AuthResponse,
  ChartsResponse,
  DemoDataResponse,
  ExpensePayload,
  FinanceResponse,
  LoginPayload,
  MetricsConfigResponse,
  OverviewResponse,
  PlanPayload,
  PromotionPayload,
  RegisterPayload,
  RetentionResponse,
  RevenueAtRiskResponse,
  SettingsResponse,
  StudentMutationResponse,
  StudentPayload,
  StudentProfileResponse,
  StudentsResponse,
} from '@gymvis/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Requisição que envia corpo JSON (ou nenhum, no caso do DELETE). */
function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Status usado quando a requisição nem chegou ao servidor. */
export const STATUS_SEM_RESPOSTA = 0;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    // O fetch só rejeita quando não houve resposta: servidor fora do ar,
    // sem rede, DNS. Dizer "algo deu errado" aqui manda o dono da academia
    // conferir a senha, que não é o problema.
    throw new ApiError(
      'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
      STATUS_SEM_RESPOSTA,
    );
  }

  if (!res.ok) {
    let message: string | null = null;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // corpo não-JSON: o servidor caiu antes de formatar a resposta
    }
    if (message === null) {
      // 5xx sem corpo é falha do servidor, não do que o usuário digitou.
      message =
        res.status >= 500
          ? 'O servidor não respondeu. Tente de novo em alguns instantes.'
          : 'Algo deu errado. Tente novamente.';
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  // Autenticação
  me: () => request<AuthResponse>('/auth/me'),
  login: (payload: LoginPayload) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  register: (payload: RegisterPayload) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // Dados
  overview: (periodDays: number) =>
    request<OverviewResponse>(`/overview?period=${periodDays}`),
  alerts: () => request<AlertsResponse>('/alerts'),
  revenueAtRisk: () => request<RevenueAtRiskResponse>('/revenue-at-risk'),
  charts: () => request<ChartsResponse>('/charts'),
  config: () => request<MetricsConfigResponse>('/config'),
  students: () => request<StudentsResponse>('/students'),
  student: (id: number) => request<StudentProfileResponse>(`/students/${id}`),
  retention: () => request<RetentionResponse>('/retention'),
  generateDemoData: () =>
    request<DemoDataResponse>('/demo-data', { method: 'POST' }),

  // Rendimentos
  finance: (months: number) => request<FinanceResponse>(`/finance?months=${months}`),
  createExpense: (payload: ExpensePayload) => send<{ id: number }>('POST', '/expenses', payload),
  updateExpense: (id: number, payload: ExpensePayload) =>
    send<{ id: number }>('PUT', `/expenses/${id}`, payload),
  deleteExpense: (id: number) => send<{ ok: true }>('DELETE', `/expenses/${id}`),

  // Configurações
  settings: () => request<SettingsResponse>('/settings'),
  saveSettings: (payload: AcademySettings) =>
    send<SettingsResponse>('PUT', '/settings', payload),
  createPlan: (payload: PlanPayload) => send<{ id: number }>('POST', '/plans', payload),
  updatePlan: (id: number, payload: PlanPayload) =>
    send<{ id: number }>('PUT', `/plans/${id}`, payload),
  deletePlan: (id: number) => send<{ ok: true }>('DELETE', `/plans/${id}`),
  createPromotion: (payload: PromotionPayload) =>
    send<{ id: number }>('POST', '/promotions', payload),
  updatePromotion: (id: number, payload: PromotionPayload) =>
    send<{ id: number }>('PUT', `/promotions/${id}`, payload),
  deletePromotion: (id: number) => send<{ ok: true }>('DELETE', `/promotions/${id}`),

  // Cadastro manual
  createStudent: (payload: StudentPayload) =>
    send<StudentMutationResponse>('POST', '/students', payload),
  updateStudent: (id: number, payload: StudentPayload) =>
    send<StudentMutationResponse>('PUT', `/students/${id}`, payload),
  deleteStudent: (id: number) => send<{ ok: true }>('DELETE', `/students/${id}`),
  addAccess: (studentId: number, payload: AccessPayload) =>
    send<{ ok: true }>('POST', `/students/${studentId}/accesses`, payload),
};
