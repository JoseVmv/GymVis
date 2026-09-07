import type {
  AlertKey,
  AlertsResponse,
  ChartsResponse,
  OverviewResponse,
  RevenueAtRiskResponse,
} from '@gymvis/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { ColumnChart, FlowChart, RiskDistributionBars, TrendLineChart } from '../charts/Charts';
import { riskColor } from '../charts/palette';
import {
  Card,
  EmptyState,
  PageHeader,
  PageLoading,
  SegmentedControl,
  StatTile,
} from '../components/ui';
import { fmtCurrency, fmtFreq, fmtInt, fmtVariation } from '../lib/format';

type Period = 7 | 30 | 90;

const periodOptions: { value: Period; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

interface DashboardData {
  overview: OverviewResponse;
  alerts: AlertsResponse;
  revenue: RevenueAtRiskResponse;
  charts: ChartsResponse;
}

type Delta = { text: string; tone: 'good' | 'bad' | 'neutral' } | null;

/** Delta inteiro vs. período anterior. `goodWhenUp` inverte o tom para métricas ruins. */
function countDelta(current: number, prev: number, goodWhenUp: boolean): Delta {
  const diff = current - prev;
  if (diff === 0) return { text: '= vs. anterior', tone: 'neutral' };
  const sign = diff > 0 ? '+' : '−';
  const tone = diff > 0 === goodWhenUp ? 'good' : 'bad';
  return { text: `${sign}${fmtInt(Math.abs(diff))} vs. anterior`, tone };
}

/** Delta relativo (%) para frequência média. */
function freqDelta(current: number, prev: number): Delta {
  if (prev === 0) {
    if (current === 0) return { text: '= vs. anterior', tone: 'neutral' };
    return { text: `+${current.toFixed(1).replace('.', ',')} vs. anterior`, tone: 'good' };
  }
  const rel = (current - prev) / prev;
  if (Math.round(Math.abs(rel) * 100) === 0) return { text: '= vs. anterior', tone: 'neutral' };
  return { text: `${fmtVariation(rel)} vs. anterior`, tone: rel > 0 ? 'good' : 'bad' };
}

function signedInt(n: number): string {
  if (n > 0) return `+${fmtInt(n)}`;
  if (n < 0) return `−${fmtInt(Math.abs(n))}`;
  return '0';
}

const todayFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function todayLong(): string {
  const s = todayFmt.format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Não foi possível carregar os dados.';
}

const linkStyle = { color: 'var(--accent-strong)', fontWeight: 550 } as const;

function RiskLine({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div className="small" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }}
      />
      <span>{children}</span>
    </div>
  );
}

/** Cada alerta leva à lista de alunos já filtrada pelo mesmo critério. */
function AlertRow({ label, count, alert }: { label: string; count: number; alert: AlertKey }) {
  return (
    <Link className="alert-row alert-row--link" to={`/alunos?alerta=${alert}`}>
      <span>{label}</span>
      <span className="alert-row__count">
        {fmtInt(count)}
        <svg
          className="alert-row__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </Link>
  );
}

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const latestPeriod = useRef<Period>(30);

  const loadAll = useCallback(async (periodDays: Period) => {
    try {
      const [overview, alerts, revenue, charts] = await Promise.all([
        api.overview(periodDays),
        api.alerts(),
        api.revenueAtRisk(),
        api.charts(),
      ]);
      setData({ overview, alerts, revenue, charts });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadAll(30);
  }, [loadAll]);

  function handlePeriodChange(next: Period) {
    if (next === period) return;
    setPeriod(next);
    latestPeriod.current = next;
    setRefetching(true);
    api
      .overview(next)
      .then((overview) => {
        if (latestPeriod.current !== next) return;
        setData((d) => (d ? { ...d, overview } : d));
      })
      .catch((err) => {
        if (latestPeriod.current !== next) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (latestPeriod.current === next) setRefetching(false);
      });
  }

  function handleRetry() {
    setError(null);
    setData(null);
    setRefetching(false);
    void loadAll(period);
  }

  async function handleGenerateDemo() {
    setGenerating(true);
    try {
      await api.generateDemoData();
      await loadAll(period);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Visão geral" subtitle={todayLong()} />
        <Card>
          <EmptyState
            title="Não foi possível carregar os dados"
            description={error}
            action={
              <button type="button" className="btn btn--primary" onClick={handleRetry}>
                Tentar novamente
              </button>
            }
          />
        </Card>
      </>
    );
  }

  if (!data) return <PageLoading />;

  const { overview, alerts, revenue, charts } = data;

  // Os rótulos dos alertas seguem os limiares configurados no servidor.
  const [first, second, third] = alerts.thresholds.inactivityDays;
  const dropPct = Math.round(alerts.thresholds.frequencyDrop * 100);

  const isEmpty =
    overview.activeStudents === 0 &&
    overview.totalAccesses === 0 &&
    overview.newStudents === 0 &&
    overview.cancellations === 0;

  if (isEmpty) {
    return (
      <>
        <PageHeader title="Visão geral" subtitle={todayLong()} />
        <Card>
          <EmptyState
            title="Sua academia ainda não tem dados"
            description="Gere dados de demonstração para explorar o painel, ou rode npm run seed no terminal."
            action={
              <button
                type="button"
                className="btn btn--primary"
                disabled={generating}
                onClick={handleGenerateDemo}
              >
                {generating ? 'Gerando dados…' : 'Gerar dados de demonstração'}
              </button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={todayLong()}
        action={
          <SegmentedControl options={periodOptions} value={period} onChange={handlePeriodChange} />
        }
      />

      <div className={`stat-grid${refetching ? ' is-refetching' : ''}`}>
        <StatTile
          label="Alunos ativos"
          value={fmtInt(overview.activeStudents)}
          delta={
            overview.delinquentStudents > 0
              ? { text: `${fmtInt(overview.delinquentStudents)} inadimplentes`, tone: 'neutral' }
              : null
          }
        />
        <StatTile
          label="Novos alunos"
          value={fmtInt(overview.newStudents)}
          delta={countDelta(overview.newStudents, overview.newStudentsPrev, true)}
        />
        <StatTile
          label="Cancelamentos"
          value={fmtInt(overview.cancellations)}
          delta={countDelta(overview.cancellations, overview.cancellationsPrev, false)}
        />
        <StatTile
          label="Crescimento líquido"
          value={signedInt(overview.netGrowth)}
          delta={countDelta(overview.netGrowth, overview.netGrowthPrev, true)}
        />
        <StatTile
          label="Acessos"
          value={fmtInt(overview.totalAccesses)}
          delta={countDelta(overview.totalAccesses, overview.totalAccessesPrev, true)}
        />
        <StatTile
          label="Frequência média"
          value={fmtFreq(overview.avgWeeklyFrequency)}
          delta={freqDelta(overview.avgWeeklyFrequency, overview.avgWeeklyFrequencyPrev)}
        />
      </div>

      <div className="grid-3 mt-12">
        <Card
          title="Receita em risco"
          subtitle="Estimativa: mensalidades de alunos com risco alto ou crítico"
        >
          <div className="hero-figure" style={{ marginTop: 10 }}>
            {fmtCurrency(revenue.totalCentavos)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <RiskLine color={riskColor.HIGH}>
              {fmtInt(revenue.highCount)} alunos em risco alto · {fmtCurrency(revenue.highCentavos)}
            </RiskLine>
            <RiskLine color={riskColor.CRITICAL}>
              {fmtInt(revenue.criticalCount)} em risco crítico ·{' '}
              {fmtCurrency(revenue.criticalCentavos)}
            </RiskLine>
          </div>
          <div className="muted small" style={{ marginTop: 10 }}>
            de {fmtCurrency(revenue.activeMonthlyRevenueCentavos)} de receita mensal ativa
          </div>
          <div style={{ marginTop: 12 }}>
            <Link className="small" style={linkStyle} to="/alunos?risco=EM_RISCO">
              Ver alunos em risco
            </Link>
          </div>
        </Card>

        <Card title="Alertas" subtitle="Alunos sumindo da academia">
          <div style={{ marginTop: 4 }}>
            <AlertRow
              alert="inativo7"
              label={`Sem acesso há ${first}–${second - 1} dias`}
              count={alerts.inactive7.count}
            />
            <AlertRow
              alert="inativo14"
              label={`Sem acesso há ${second}–${third - 1} dias`}
              count={alerts.inactive14.count}
            />
            <AlertRow
              alert="inativo30"
              label={`Sem acesso há ${third} dias ou mais`}
              count={alerts.inactive30.count}
            />
            <AlertRow
              alert="queda"
              label={`Queda de frequência de ${dropPct}% ou mais`}
              count={alerts.frequencyDrop.count}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Link className="small" style={linkStyle} to="/alunos">
              Ver todos os alunos
            </Link>
          </div>
        </Card>

        <Card title="Distribuição de risco" subtitle="Alunos matriculados por nível">
          <RiskDistributionBars data={charts.riskDistribution} />
        </Card>
      </div>

      <div className="grid-2 mt-12">
        <Card
          title="Evolução do plantel"
          subtitle="Matriculados ao fim de cada mês, incluindo pausados"
        >
          <TrendLineChart data={charts.activeEvolution} name="Matriculados" />
        </Card>
        <Card title="Novos vs. cancelamentos" subtitle="Por mês, últimos 12 meses">
          <FlowChart data={charts.flow} />
        </Card>
        <Card title="Acessos por semana" subtitle="Últimas 12 semanas fechadas">
          <ColumnChart data={charts.weeklyAccesses} name="Acessos" />
        </Card>
        <Card title="Frequência média" subtitle="Acessos por aluno por semana">
          <TrendLineChart
            data={charts.avgFrequency}
            name="Frequência"
            valueFormat={fmtFreq}
            yFormat={(v) => v.toFixed(1).replace('.', ',')}
            allowDecimals
          />
        </Card>
      </div>
    </>
  );
}
