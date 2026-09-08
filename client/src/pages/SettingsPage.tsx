import type { AcademySettings, Plan, Promotion, SettingsResponse } from '@gymvis/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Field,
  MoneyInput,
  centavosToInput,
  inputToCentavos,
} from '../components/fields';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Card, EmptyState, PageHeader, PageLoading } from '../components/ui';
import { fmtCurrency, fmtInt } from '../lib/format';

/* --------------------------------------------------------------- Planos */

interface PlanForm {
  nome: string;
  valor: string;
  duracaoMeses: number;
}

const DURACOES = [
  { value: 1, label: 'Mensal' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Semestral' },
  { value: 12, label: 'Anual' },
];

const duracaoLabel = (m: number): string =>
  DURACOES.find((d) => d.value === m)?.label ?? `${m} meses`;

/* ----------------------------------------------------------------- Página */

export function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .settings()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Algo deu errado.');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error && !data) {
    return (
      <>
        <PageHeader title="Configurações" />
        <EmptyState
          title="Não foi possível carregar as configurações"
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

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Planos, promoções e as regras que definem quem está em risco"
      />
      <div className="stack">
        <GeneralCard settings={data.settings} defaults={data.defaults} onSaved={setData} />
        <PlansCard plans={data.plans} onChanged={reload} />
        <PromotionsCard promotions={data.promotions} onChanged={reload} />
        <IntegrationCard />
      </div>
    </>
  );
}

/* ------------------------------------------------------ Dados e limiares */

function GeneralCard({
  settings,
  defaults,
  onSaved,
}: {
  settings: AcademySettings;
  defaults: AcademySettings;
  onSaved: (res: SettingsResponse) => void;
}) {
  const [form, setForm] = useState<AcademySettings>(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setForm(settings), [settings]);

  const num = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api.saveSettings(form);
      onSaved(res);
      setMsg('Configurações salvas.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const alterado = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <Card
      title="Academia e regras de risco"
      subtitle="Estes limiares definem os alertas do painel e a classificação de cada aluno"
    >
      <div className="stack" style={{ gap: 14, marginTop: 8, maxWidth: 620 }}>
        {err && <div className="form-error">{err}</div>}
        {msg && !err && <div className="small" style={{ color: 'var(--good-text)' }}>{msg}</div>}

        <Field label="Nome da academia">
          {(id) => (
            <input
              id={id}
              className="input"
              value={form.academiaNome}
              onChange={(e) => setForm({ ...form, academiaNome: e.target.value })}
            />
          )}
        </Field>

        <div>
          <div className="card__title" style={{ marginBottom: 8 }}>
            Dias sem acesso
          </div>
          <div className="field-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Field label="Risco médio" hint="a partir de">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className="input"
                  value={form.inactivityMedium}
                  onChange={(e) =>
                    setForm({ ...form, inactivityMedium: num(e.target.value, form.inactivityMedium) })
                  }
                />
              )}
            </Field>
            <Field label="Risco alto" hint="a partir de">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className="input"
                  value={form.inactivityHigh}
                  onChange={(e) =>
                    setForm({ ...form, inactivityHigh: num(e.target.value, form.inactivityHigh) })
                  }
                />
              )}
            </Field>
            <Field label="Risco crítico" hint="a partir de">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className="input"
                  value={form.inactivityCritical}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      inactivityCritical: num(e.target.value, form.inactivityCritical),
                    })
                  }
                />
              )}
            </Field>
          </div>
        </div>

        <div>
          <div className="card__title" style={{ marginBottom: 8 }}>
            Queda de frequência
          </div>
          <div className="field-row">
            <Field label="Risco médio (%)" hint="queda em relação ao histórico">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={5}
                  max={95}
                  className="input"
                  value={Math.round(form.frequencyDropMedium * 100)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      frequencyDropMedium: num(e.target.value, 30) / 100,
                    })
                  }
                />
              )}
            </Field>
            <Field label="Risco alto (%)" hint="queda em relação ao histórico">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={5}
                  max={95}
                  className="input"
                  value={Math.round(form.frequencyDropHigh * 100)}
                  onChange={(e) =>
                    setForm({ ...form, frequencyDropHigh: num(e.target.value, 50) / 100 })
                  }
                />
              )}
            </Field>
          </div>
        </div>

        <div className="row">
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving || !alterado}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setForm({ ...defaults, academiaNome: form.academiaNome })}
            disabled={saving}
          >
            Restaurar padrão
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Planos */

function PlansCard({ plans, onChanged }: { plans: Plan[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>({ nome: '', valor: '', duracaoMeses: 1 });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm({ nome: '', valor: '', duracaoMeses: 1 });
    setErr(null);
    setOpen(true);
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setForm({ nome: p.nome, valor: centavosToInput(p.valorCentavos), duracaoMeses: p.duracaoMeses });
    setErr(null);
    setOpen(true);
  }

  async function save() {
    const valorCentavos = inputToCentavos(form.valor);
    if (form.nome.trim() === '') return setErr('Informe o nome do plano.');
    if (valorCentavos === null || valorCentavos <= 0) return setErr('Informe um valor maior que zero.');
    setSaving(true);
    setErr(null);
    const payload = { nome: form.nome, valorCentavos, duracaoMeses: form.duracaoMeses };
    try {
      if (editing) await api.updatePlan(editing.id, payload);
      else await api.createPlan(payload);
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setListError(null);
    try {
      await api.deletePlan(removing.id);
      setRemoving(null);
      onChanged();
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Não foi possível excluir.');
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Planos"
      subtitle="O valor do plano é sugerido ao cadastrar um aluno; a mensalidade de quem já está matriculado não muda"
      action={
        <button type="button" className="btn btn--sm" onClick={openNew}>
          Novo plano
        </button>
      }
    >
      {listError && (
        <div className="form-error" style={{ marginTop: 10 }}>
          {listError}
        </div>
      )}
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Plano</th>
              <th>Cobrança</th>
              <th className="t-right">Valor</th>
              <th className="t-right">Alunos</th>
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && (
              <tr>
                <td colSpan={5} className="t-muted">
                  Nenhum plano cadastrado.
                </td>
              </tr>
            )}
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td className="t-muted">{duracaoLabel(p.duracaoMeses)}</td>
                <td className="num t-right">{fmtCurrency(p.valorCentavos)}</td>
                <td className="num t-right t-muted">{fmtInt(p.alunos)}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setRemoving(p)}
                      disabled={p.alunos > 0}
                      title={p.alunos > 0 ? 'Há alunos neste plano' : undefined}
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={editing ? 'Editar plano' : 'Novo plano'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        {err && <div className="form-error">{err}</div>}
        <Field label="Nome">
          {(id) => (
            <input
              id={id}
              className="input"
              value={form.nome}
              placeholder="Ex.: Mensal"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          )}
        </Field>
        <div className="field-row">
          <Field label="Valor mensal">
            {(id) => (
              <MoneyInput id={id} value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
            )}
          </Field>
          <Field label="Cobrança" hint="Período pago de uma vez">
            {(id) => (
              <select
                id={id}
                className="select"
                value={form.duracaoMeses}
                onChange={(e) => setForm({ ...form, duracaoMeses: Number(e.target.value) })}
              >
                {DURACOES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir plano"
        message={`O plano "${removing?.nome ?? ''}" será removido.`}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
        busy={busy}
      />
    </Card>
  );
}

/* ------------------------------------------------------------- Promoções */

function PromotionsCard({
  promotions,
  onChanged,
}: {
  promotions: Promotion[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [desconto, setDesconto] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Promotion | null>(null);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setEditing(null);
    setNome('');
    setDesconto('');
    setAtiva(true);
    setErr(null);
    setOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditing(p);
    setNome(p.nome);
    setDesconto(centavosToInput(p.descontoCentavos));
    setAtiva(p.ativa);
    setErr(null);
    setOpen(true);
  }

  async function save() {
    const descontoCentavos = inputToCentavos(desconto === '' ? '0' : desconto);
    if (nome.trim() === '') return setErr('Informe o nome da promoção.');
    if (descontoCentavos === null) return setErr('Desconto inválido.');
    setSaving(true);
    setErr(null);
    try {
      const payload = { nome, descontoCentavos, ativa };
      if (editing) await api.updatePromotion(editing.id, payload);
      else await api.createPromotion(payload);
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.deletePromotion(removing.id);
      setRemoving(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Promoções"
      subtitle="Marque alunos que entraram por uma campanha; eles ganham o selo Promoção na listagem"
      action={
        <button type="button" className="btn btn--sm" onClick={openNew}>
          Nova promoção
        </button>
      }
    >
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Promoção</th>
              <th>Situação</th>
              <th className="t-right">Desconto</th>
              <th className="t-right">Alunos</th>
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 && (
              <tr>
                <td colSpan={5} className="t-muted">
                  Nenhuma promoção cadastrada.
                </td>
              </tr>
            )}
            {promotions.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>
                  <span className={`badge ${p.ativa ? 'badge--good' : 'badge--neutral'}`}>
                    {p.ativa ? 'Ativa' : 'Encerrada'}
                  </span>
                </td>
                <td className="num t-right">{fmtCurrency(p.descontoCentavos)}</td>
                <td className="num t-right t-muted">{fmtInt(p.alunos)}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRemoving(p)}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={editing ? 'Editar promoção' : 'Nova promoção'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        {err && <div className="form-error">{err}</div>}
        <Field label="Nome">
          {(id) => (
            <input
              id={id}
              className="input"
              value={nome}
              placeholder="Ex.: Matrícula de verão"
              onChange={(e) => setNome(e.target.value)}
            />
          )}
        </Field>
        <Field label="Desconto na mensalidade" hint="Opcional, apenas para referência">
          {(id) => <MoneyInput id={id} value={desconto} onChange={setDesconto} />}
        </Field>
        <Field label="Situação">
          {(id) => (
            <select
              id={id}
              className="select"
              value={ativa ? 'ativa' : 'encerrada'}
              onChange={(e) => setAtiva(e.target.value === 'ativa')}
            >
              <option value="ativa">Ativa</option>
              <option value="encerrada">Encerrada</option>
            </select>
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir promoção"
        message={
          removing && removing.alunos > 0
            ? `A promoção "${removing.nome}" será removida e ${removing.alunos} aluno(s) perderão o selo. O cadastro deles é mantido.`
            : `A promoção "${removing?.nome ?? ''}" será removida.`
        }
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
        busy={busy}
      />
    </Card>
  );
}

/* ------------------------------------------------------------ Integração */

function IntegrationCard() {
  return (
    <Card title="Integração com a catraca" subtitle="Ainda não disponível">
      <p className="muted small" style={{ marginTop: 6, maxWidth: '68ch', lineHeight: 1.55 }}>
        Hoje os acessos entram pelo banco local ou pelo cadastro manual. A conexão automática com o
        sistema da catraca será configurada aqui, sem que o GymVis passe a controlar o equipamento:
        ele continuará apenas lendo os acessos já registrados.
      </p>
      <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} disabled>
        Configurar integração
      </button>
    </Card>
  );
}
