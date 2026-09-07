import type { RetentionResponse } from '@gymvis/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../api/client';
import { TrendLineChart } from '../charts/Charts';
import { blueRamp, inkOnRampStep } from '../charts/palette';
import { Card, EmptyState, PageHeader, PageLoading } from '../components/ui';
import { fmtInt } from '../lib/format';

/** Mapeia 0..1 para um passo 0..9 da rampa azul. */
function rampStep(v: number): number {
  return Math.max(0, Math.min(blueRamp.length - 1, Math.round(v * (blueRamp.length - 1))));
}

const cellBase: CSSProperties = {
  padding: '6px 8px',
  minWidth: 52,
  textAlign: 'center',
};

/** Corta a cauda de nulls e converte a curva média para pontos percentuais. */
function buildCurve(averageCurve: (number | null)[]): { label: string; value: number }[] {
  let end = averageCurve.length;
  while (end > 0 && averageCurve[end - 1] === null) end -= 1;
  return averageCurve.slice(0, end).map((v, i) => ({
    label: `Mês ${i}`,
    value: v === null ? 0 : Math.round(v * 100),
  }));
}

export function RetentionPage() {
  const [data, setData] = useState<RetentionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .retention()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <>
        <PageHeader title="Retenção" />
        <EmptyState
          title="Não foi possível carregar a retenção"
          description={error}
          action={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Tentar novamente
            </button>
          }
        />
      </>
    );
  }
  if (!data) return <PageLoading />;

  if (data.cohorts.length === 0) {
    return (
      <>
        <PageHeader
          title="Retenção"
          subtitle="Quanto de cada turma de entrada continua matriculada ao longo dos meses"
        />
        <EmptyState
          title="Sem coortes para exibir"
          description="Gere dados de demonstração no painel para acompanhar a retenção."
        />
      </>
    );
  }

  const columns = Array.from({ length: data.months }, (_, i) => i);
  const curve = buildCurve(data.averageCurve);

  return (
    <>
      <PageHeader
        title="Retenção"
        subtitle="Quanto de cada turma de entrada continua matriculada ao longo dos meses"
      />

      <div className="stack">
        <Card
          title="Coortes de entrada"
          subtitle="Cada linha é o mês de entrada; cada coluna, meses desde a entrada"
        >
          <div className="table-wrap mt-12">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Coorte</th>
                  {columns.map((i) => (
                    <th key={i} style={{ ...cellBase, padding: '9px 8px' }}>
                      Mês {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td style={{ padding: '6px 14px' }}>
                      <div>{c.label}</div>
                      <div className="t-muted small">{fmtInt(c.size)} alunos</div>
                    </td>
                    {columns.map((i) => {
                      const v = c.values[i] ?? null;
                      if (v === null) return <td key={i} style={cellBase} />;
                      const step = rampStep(v);
                      return (
                        <td
                          key={i}
                          style={{
                            ...cellBase,
                            background: blueRamp[step],
                            color: inkOnRampStep(step),
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {Math.round(v * 100)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Curva média de retenção" subtitle="Média das coortes com dado disponível">
          <div className="mt-12">
            <TrendLineChart
              data={curve}
              name="Retenção"
              valueFormat={(v) => `${v}%`}
              yFormat={(v) => `${v}%`}
              height={200}
            />
          </div>
        </Card>

        <p className="muted small">
          Exemplo: 84% no mês 3 significa que 84% dos alunos daquela turma ainda estavam
          matriculados três meses após a entrada.
        </p>
      </div>
    </>
  );
}
