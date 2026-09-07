import type {
  AlertsResponse,
  AuthResponse,
  ChartsResponse,
  DemoDataResponse,
  LoginPayload,
  MetricsConfigResponse,
  OverviewResponse,
  RegisterPayload,
  RetentionResponse,
  RevenueAtRiskResponse,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let message = 'Algo deu errado. Tente novamente.';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // corpo não-JSON: mantém a mensagem padrão
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
};
