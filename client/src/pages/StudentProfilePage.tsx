import type { StudentProfileResponse } from '@gymvis/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { ColumnChart } from '../charts/Charts';
import { Field } from '../components/fields';
import { ConfirmDialog, Modal } from '../components/Modal';
import { StudentFormModal, type StudentFormValues } from '../components/StudentForm';
import { centavosToInput } from '../components/fields';
import {
  Card,
  Chevron,
  EmptyState,
  MetaCounts,
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
  const [formOpen, setFormOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessValue, setAccessValue] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const reload = () => setAttempt((n) => n + 1);

  async function handleAddAccess() {
    const ms = Date.parse(accessValue);
    if (!Number.isFinite(ms)) {
      setAccessError('Informe a data e a hora do acesso.');
      return;
    }
    setSavingAccess(true);
    setAccessError(null);
    try {
      await api.addAccess(studentId, { timestamp: ms });
      setAccessOpen(false);
      setAccessValue('');
      reload();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Não foi possível registrar.');
    } finally {
      setSavingAccess(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteStudent(studentId);
      navigate('/alunos');
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

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

  const subtitle = (
    <MetaCounts
      items={[
        { value: student.planoNome, label: 'plano' },
        { value: fmtCurrency(student.mensalidadeCentavos), label: 'por mês' },
        { value: fmtDate(student.dataEntrada), label: 'de entrada' },
        ...(student.dataSaida ? [{ value: fmtDate(student.dataSaida), label: 'de saída' }] : []),
      ]}
    />
  );

  const weeklyData = student.weeklySeries.map((w) => ({ label: w.label, value: w.count }));
  const accesses = student.recentAccesses.slice(0, MAX_ACCESS_ROWS);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link to="/alunos" className="btn btn--ghost btn--sm">
          <Chevron direction="left" />
          Alunos
        </Link>
      </div>

      <PageHeader
        title={student.nome}
        subtitle={subtitle}
        action={
          <div className="row row--wrap">
            <StatusBadge status={student.status} />
            <RiskBadge risk={student.risk} />
            {student.promocaoNome !== null && (
              <span className="badge badge--accent" title={`Promoção: ${student.promocaoNome}`}>
                {student.promocaoNome}
              </span>
            )}
            <button type="button" className="btn btn--sm" onClick={() => setFormOpen(true)}>
              Editar
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setAccessOpen(true)}>
              Registrar acesso
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir
            </button>
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
              <div className="table-wrap table-wrap--narrow mt-12">
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

      <StudentFormModal
        open={formOpen}
        initial={
          {
            id: student.id,
            nome: student.nome,
            email: student.email ?? '',
            telefone: student.telefone ?? '',
            planoId: student.planoId,
            promocaoId: student.promocaoId,
            mensalidade: centavosToInput(student.mensalidadeCentavos),
            dataEntrada: student.dataEntrada,
            dataSaida: student.dataSaida ?? '',
            status: student.status,
          } satisfies StudentFormValues
        }
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <Modal
        open={accessOpen}
        title="Registrar acesso"
        onClose={() => setAccessOpen(false)}
        width={400}
        footer={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setAccessOpen(false)}
              disabled={savingAccess}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleAddAccess}
              disabled={savingAccess}
            >
              {savingAccess ? 'Registrando…' : 'Registrar'}
            </button>
          </>
        }
      >
        {accessError && <div className="form-error">{accessError}</div>}
        <p className="muted small" style={{ lineHeight: 1.5 }}>
          Use quando a catraca não registrou a entrada do aluno.
        </p>
        <Field label="Data e hora">
          {(id) => (
            <input
              id={id}
              type="datetime-local"
              className="input"
              value={accessValue}
              onChange={(e) => setAccessValue(e.target.value)}
            />
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir aluno"
        message={`${student.nome} e todo o histórico de acessos dele serão removidos permanentemente.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        busy={deleting}
      />
    </>
  );
}
