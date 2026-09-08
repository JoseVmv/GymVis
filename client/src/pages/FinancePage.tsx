import type { Expense, ExpenseCategory, FinanceResponse } from '@gymvis/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { ColumnChart } from '../charts/Charts';
import {
  DateInput,
  Field,
  MoneyInput,
  centavosToInput,
  inputToCentavos,
  todayStr,
} from '../components/fields';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Card, EmptyState, PageHeader, PageLoading, SegmentedControl, StatTile } from '../components/ui';
import { fmtCurrency, fmtDate, fmtInt } from '../lib/format';

const CATEGORIAS: { value: ExpenseCategory; label: string }[] = [
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'folha', label: 'Folha de pagamento' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'utilidades', label: 'Água, luz e internet' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'limpeza', label: 'Limpeza' },
  { value: 'outros', label: 'Outros' },
];

const categoriaLabel = (c: ExpenseCategory): string =>
  CATEGORIAS.find((x) => x.value === c)?.label ?? c;

const PERIODOS = [
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
  { value: 24, label: '24 meses' },
];

interface FormState {
  descricao: string;
  categoria: ExpenseCategory;
  valor: string;
  data: string;
}

const emptyForm = (): FormState => ({
  descricao: '',
  categoria: 'manutencao',
  valor: '',
  data: todayStr(),
});

export function FinancePage() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [editing, setEditing] = useState<Expense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Expense | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .finance(months)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Algo deu errado.');
      });
    return () => {
      alive = false;
    };
  }, [months, attempt]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      descricao: e.descricao,
      categoria: e.categoria,
      valor: centavosToInput(e.valorCentavos),
      data: e.data,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    const valorCentavos = inputToCentavos(form.valor);
    if (form.descricao.trim() === '') {
      setFormError('Informe a descrição.');
      return;
    }
    if (valorCentavos === null || valorCentavos <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      descricao: form.descricao,
      categoria: form.categoria,
      valorCentavos,
      data: form.data,
    };
    try {
      if (editing) await api.updateExpense(editing.id, payload);
      else await api.createExpense(payload);
      setFormOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!removing) return;
    setBusyDelete(true);
    try {
      await api.deleteExpense(removing.id);
      setRemoving(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.');
    } finally {
      setBusyDelete(false);
    }
  }

  if (error && !data) {
    return (
      <>
        <PageHeader title="Rendimentos" />
        <EmptyState
          title="Não foi possível carregar os rendimentos"
          description={error}
          action={
            <button type="button" className="btn btn--primary" onClick={reload}>
              Tentar novamente
            </button>
          }
        />
      </>
    );
  }
  if (!data) return <PageLoading />;

  const resultadoPositivo = data.resultadoCentavos >= 0;
  const maiorCategoria = data.despesasPorCategoria[0]?.valorCentavos ?? 1;

  return (
    <>
      <PageHeader
        title="Rendimentos"
        subtitle="Faturamento estimado pelas mensalidades, menos as despesas lançadas"
        action={
          <div className="row">
            <SegmentedControl options={PERIODOS} value={months} onChange={setMonths} />
            <button type="button" className="btn btn--primary" onClick={openNew}>
              Nova despesa
            </button>
          </div>
        }
      />

      <div className="stat-grid stat-grid--4">
        <StatTile label={`Faturamento (${months} meses)`} value={fmtCurrency(data.receitaCentavos)} />
        <StatTile label="Despesas no período" value={fmtCurrency(data.despesasCentavos)} />
        <StatTile
          label="Resultado"
          value={
            <span className={resultadoPositivo ? 'money-figure--positive' : 'money-figure--negative'}>
              {fmtCurrency(data.resultadoCentavos)}
            </span>
          }
        />
        <StatTile
          label="Inadimplência"
          value={fmtCurrency(data.inadimplenciaCentavos)}
          hint="Mensalidades cobradas de alunos inadimplentes, que não entraram no caixa"
        />
      </div>

      <div className="grid-2 mt-12">
        <Card title="Faturamento por mês" subtitle="Mensalidades dos matriculados em cada mês">
          <ColumnChart
            data={data.meses.map((m) => ({ label: m.label, value: m.receitaCentavos / 100 }))}
            name="Faturamento"
            valueFormat={(v) => fmtCurrency(Math.round(v * 100))}
          />
        </Card>
        <Card title="Despesas por mês" subtitle="Total lançado em cada mês">
          <ColumnChart
            data={data.meses.map((m) => ({ label: m.label, value: m.despesasCentavos / 100 }))}
            name="Despesas"
            valueFormat={(v) => fmtCurrency(Math.round(v * 100))}
          />
        </Card>
      </div>

      <div className="grid-2 mt-12">
        <Card title="Mês atual" subtitle="Projeção pelo plantel de hoje">
          <div className="money-figure">{fmtCurrency(data.receitaMensalAtualCentavos)}</div>
          <div className="muted small" style={{ marginTop: 8 }}>
            Ticket médio de {fmtCurrency(data.ticketMedioCentavos)} por aluno matriculado.
          </div>
          <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
            O faturamento é estimado a partir das mensalidades cadastradas. O sistema não registra
            pagamentos individuais.
          </p>
        </Card>

        <Card title="Despesas por categoria" subtitle={`Últimos ${months} meses`}>
          {data.despesasPorCategoria.length === 0 ? (
            <p className="muted small" style={{ marginTop: 6 }}>
              Nenhuma despesa lançada no período.
            </p>
          ) : (
            <div className="cat-bars">
              {data.despesasPorCategoria.map((c) => (
                <div key={c.categoria} className="cat-bars__row">
                  <span className="muted">{categoriaLabel(c.categoria)}</span>
                  <div className="cat-bars__track">
                    <div
                      className="cat-bars__fill"
                      style={{ width: `${(c.valorCentavos / maiorCategoria) * 100}%` }}
                    />
                  </div>
                  <span className="cat-bars__value">{fmtCurrency(c.valorCentavos)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-20">
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <h2 className="card__title">Despesas lançadas</h2>
          <span className="muted small">{fmtInt(data.expenses.length)} no período</span>
        </div>
        {data.expenses.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhuma despesa lançada"
              description="Registre manutenções, compras de equipamento, aluguel e outros gastos para acompanhar o resultado da academia."
              action={
                <button type="button" className="btn btn--primary" onClick={openNew}>
                  Lançar primeira despesa
                </button>
              }
            />
          </Card>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="t-right">Valor</th>
                  <th style={{ width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="t-muted">{fmtDate(e.data)}</td>
                    <td>{e.descricao}</td>
                    <td className="t-muted">{categoriaLabel(e.categoria)}</td>
                    <td className="num t-right">{fmtCurrency(e.valorCentavos)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(e)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRemoving(e)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        title={editing ? 'Editar despesa' : 'Nova despesa'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        {formError && <div className="form-error">{formError}</div>}
        <Field label="Descrição">
          {(id) => (
            <input
              id={id}
              className="input"
              value={form.descricao}
              placeholder="Ex.: troca de cabo da polia"
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          )}
        </Field>
        <div className="field-row">
          <Field label="Valor">
            {(id) => (
              <MoneyInput id={id} value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
            )}
          </Field>
          <Field label="Data">
            {(id) => (
              <DateInput
                id={id}
                value={form.data}
                max={todayStr()}
                onChange={(v) => setForm({ ...form, data: v })}
              />
            )}
          </Field>
        </div>
        <Field label="Categoria">
          {(id) => (
            <select
              id={id}
              className="select"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as ExpenseCategory })}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir despesa"
        message={`A despesa "${removing?.descricao ?? ''}" será removida permanentemente.`}
        onConfirm={handleDelete}
        onCancel={() => setRemoving(null)}
        busy={busyDelete}
      />
    </>
  );
}
