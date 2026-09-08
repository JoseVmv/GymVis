import type {
  AlertKey,
  AlertsResponse,
  ChartsResponse,
  OverviewResponse,
  RevenueAtRiskResponse,
  StudentListItem,
  StudentsResponse,
} from '@gymvis/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { ColumnChart, FlowChart, RiskLoadBar, TrendLineChart } from '../charts/Charts';
import { riskColor } from '../charts/palette';
import {
  Card,
  Chevron,
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

/** Quantos nomes cabem na abertura sem virar uma segunda listagem. */
const ROSTER_SIZE = 5;

interface DashboardData {
  overview: OverviewResponse;
  alerts: AlertsResponse;
  revenue: RevenueAtRiskResponse;
  charts: ChartsResponse;
  students: StudentsResponse;
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

/** Só matriculados: quem já cancelou ou pausou não representa receita em risco. */
function atRiskRoster(students: StudentListItem[]): StudentListItem[] {
  return students
    .filter(
      (s) =>
        (s.status === 'ativo' || s.status === 'inadimplente') &&
        (s.risk === 'HIGH' || s.risk === 'CRITICAL'),
    )
    .sort((a, b) => (b.daysSinceLastAccess ?? b.daysSinceJoin) - (a.daysSinceLastAccess ?? a.daysSinceJoin))
    .slice(0, ROSTER_SIZE);
}

function gapLabel(s: StudentListItem): string {
  const dias = s.daysSinceLastAccess ?? s.daysSinceJoin;
  if (s.daysSinceLastAccess === null) return `nunca veio · ${dias} d`;
  return `${fmtInt(dias)} dias sem vir`;
}

/**
 * A abertura do painel: o valor em risco e as pessoas que o compõem, lado a
 * lado. Sozinho o número é abstrato; com os nomes ao lado, o dono reconhece
 * quem são — e a lista é o caminho para agir.
 */
function RiskHero({
  revenue,
  roster,
}: {
  revenue: RevenueAtRiskResponse;
  roster: StudentListItem[];
}) {
  const emRisco = revenue.highCount + revenue.criticalCount;
  const share =
    revenue.activeMonthlyRevenueCentavos > 0
      ? revenue.totalCentavos / revenue.activeMonthlyRevenueCentavos
      : 0;

  return (
    <section className="risk-hero">
      <div className="risk-hero__money">
        <div className="risk-hero__label">Receita em risco</div>
        <div className="risk-hero__figure">{fmtCurrency(revenue.totalCentavos)}</div>
        <p className="risk-hero__note">
          {emRisco === 0
            ? 'Ninguém matriculado está sumindo agora. É o melhor número desta tela.'
            : `${fmtInt(emRisco)} ${emRisco === 1 ? 'aluno que continua pagando e parou' : 'alunos que continuam pagando e pararam'} de aparecer.`}
        </p>

        {emRisco > 0 && (
          <div className="risk-split">
            <Link className="risk-split__row" to="/alunos?risco=HIGH">
              <span className="load__dot" style={{ background: riskColor.HIGH }} />
              <span>Risco alto</span>
              <span className="risk-split__count">{fmtInt(revenue.highCount)}</span>
              <span className="risk-split__money">{fmtCurrency(revenue.highCentavos)}</span>
            </Link>
            <Link className="risk-split__row" to="/alunos?risco=CRITICAL">
              <span className="load__dot" style={{ background: riskColor.CRITICAL }} />
              <span>Risco crítico</span>
              <span className="risk-split__count">{fmtInt(revenue.criticalCount)}</span>
              <span className="risk-split__money">{fmtCurrency(revenue.criticalCentavos)}</span>
            </Link>
          </div>
        )}

        <div className="risk-hero__share">
          <div className="risk-hero__track">
            <div
              className="risk-hero__fill"
              style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
            />
          </div>
          <div className="risk-hero__caption">
            {Math.round(share * 100)}% da receita mensal de{' '}
            {fmtCurrency(revenue.activeMonthlyRevenueCentavos)}
          </div>
        </div>
      </div>

      <div className="risk-hero__roster">
        <div className="risk-hero__label">Quem está sumindo</div>
        {roster.length === 0 ? (
          <p className="risk-hero__note">
            Nenhum aluno matriculado passou dos limiares de risco no momento.
          </p>
        ) : (
          <ul className="roster">
            {roster.map((s) => (
              <li key={s.id}>
                <Link className="roster__row" to={`/alunos/${s.id}`}>
                  <span className="roster__name">{s.nome}</span>
                  <span className="roster__gap">{gapLabel(s)}</span>
                  <span className="roster__money">{fmtCurrency(s.mensalidadeCentavos)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="roster__all" to="/alunos?risco=EM_RISCO">
          <span>
            {emRisco > ROSTER_SIZE
              ? `Ver os ${fmtInt(emRisco)} alunos em risco`
              : 'Ver a lista de alunos'}
          </span>
          <Chevron />
        </Link>
      </div>
    </section>
  );
}

/** Cada alerta leva à lista de alunos já filtrada pelo mesmo critério. */
function AlertRow({ label, count, alert }: { label: string; count: number; alert: AlertKey }) {
  return (
    <Link className="alert-row alert-row--link" to={`/alunos?alerta=${alert}`}>
      <span>{label}</span>
      <span className="alert-row__count">
        {fmtInt(count)}
        <Chevron className="alert-row__chevron" />
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
      const [overview, alerts, revenue, charts, students] = await Promise.all([
        api.overview(periodDays),
        api.alerts(),
        api.revenueAtRisk(),
        api.charts(),
        api.students(),
      ]);
      setData({ overview, alerts, revenue, charts, students });
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

  const { overview, alerts, revenue, charts, students } = data;

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

      <RiskHero revenue={revenue} roster={atRiskRoster(students.students)} />

      <div className={`stat-grid mt-12${refetching ? ' is-refetching' : ''}`}>
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

      <div className="grid-2 mt-12">
        <Card title="Alertas" subtitle="Alunos matriculados que pararam de aparecer">
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
        </Card>

        <Card
          title="Carga de risco"
          subtitle="Todo o plantel matriculado, do comportamento normal ao crítico"
        >
          <RiskLoadBar data={charts.riskDistribution} />
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
