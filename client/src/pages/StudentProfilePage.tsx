import type { StudentProfileResponse } from '@gymvis/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { ColumnChart } from '../charts/Charts';
import {
  Card,
  EmptyState,
  PageHeader,
  PageLoading,
  RiskBadge,
  StatTile,
  StatusBadge,
  variationStyle,
} from '../components/ui';
import {
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  fmtDaysAgo,
  fmtFreq,
  fmtVariation,
} from '../lib/format';

const MAX_ACCESS_ROWS = 30;

const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

function weekdayLabel(ms: number): string {
  const w = weekdayFmt.format(new Date(ms));
  return w.charAt(0).toUpperCase() + w.slice(1);
}

type LoadFailure = 'notfound' | 'error';

export function StudentProfilePage() {
  const { id } = useParams();
  const studentId = Number(id);
  const [student, setStudent] = useState<StudentProfileResponse | null>(null);
  const [failed, setFailed] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStudent(null);
    setFailed(null);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      setFailed('notfound');
      return;
    }
    let alive = true;
    api
      .student(studentId)
      .then((res) => {
        if (alive) setStudent(res);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setFailed(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error');
      });
    return () => {
      alive = false;
    };
  }, [studentId, attempt]);

  if (failed === 'notfound') {
    return (
      <EmptyState
        title="Aluno não encontrado"
        description="O aluno pode ter sido removido ou o endereço está incorreto."
        action={
          <Link to="/alunos" className="btn btn--sm">
            Voltar para alunos
          </Link>
        }
      />
    );
  }
  if (failed === 'error') {
    return (
      <EmptyState
        title="Não foi possível carregar o aluno"
        description="Verifique sua conexão e tente novamente."
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
    );
  }
  if (!student) return <PageLoading />;

  const subtitle =
    `${student.planoNome} · ${fmtCurrency(student.mensalidadeCentavos)} /mês` +
    ` · entrou em ${fmtDate(student.dataEntrada)}` +
    (student.dataSaida ? ` · saiu em ${fmtDate(student.dataSaida)}` : '');

  const weeklyData = student.weeklySeries.map((w) => ({ label: w.label, value: w.count }));
  const accesses = student.recentAccesses.slice(0, MAX_ACCESS_ROWS);

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Link to="/alunos" className="btn btn--ghost btn--sm">
          ← Alunos
        </Link>
      </div>

      <PageHeader
        title={student.nome}
        subtitle={subtitle}
        action={
          <div className="row">
            <StatusBadge status={student.status} />
            <RiskBadge risk={student.risk} />
          </div>
        }
      />

      <div className="stack">
        <div className="stat-grid stat-grid--4">
          <StatTile
            label="Último acesso"
            value={fmtDaysAgo(student.daysSinceLastAccess)}
            hint={student.lastAccessAt !== null ? fmtDateTime(student.lastAccessAt) : undefined}
          />
          <StatTile
            label="Frequência histórica"
            value={student.baselineWeekly !== null ? fmtFreq(student.baselineWeekly) : '—'}
            delta={null}
          />
          <StatTile label="Últimas 4 semanas" value={fmtFreq(student.recentWeekly)} />
          <StatTile
            label="Variação"
            value={
              <span style={variationStyle(student.variation)}>
                {fmtVariation(student.variation)}
              </span>
            }
            delta={null}
          />
        </div>

        {student.riskReasons.length > 0 && (
          <Card title="Por que este aluno está em risco">
            <ul
              style={{
                listStyle: 'none',
                margin: '8px 0 0',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
              }}
            >
              {student.riskReasons.map((reason) => (
                <li key={reason} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="muted">·</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Frequência semanal" subtitle="Acessos por semana desde a entrada">
          <div className="mt-12">
            <ColumnChart data={weeklyData} name="Acessos" height={200} />
          </div>
        </Card>

        <Card title="Últimos acessos">
          {accesses.length === 0 ? (
            <EmptyState title="Nenhum acesso registrado" />
          ) : (
            <>
              <div className="table-wrap mt-12">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Dia da semana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accesses.map((a, i) => (
                      <tr key={`${a.timestamp}-${i}`}>
                        <td className="num">{fmtDateTime(a.timestamp)}</td>
                        <td className="t-muted">{weekdayLabel(a.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {student.recentAccesses.length > MAX_ACCESS_ROWS && (
                <div className="muted small" style={{ marginTop: 8 }}>
                  Mostrando os {MAX_ACCESS_ROWS} acessos mais recentes
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
