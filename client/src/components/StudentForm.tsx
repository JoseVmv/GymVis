import type { Plan, Promotion, StudentPayload, StudentStatus } from '@gymvis/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  DateInput,
  Field,
  MoneyInput,
  centavosToInput,
  inputToCentavos,
  todayStr,
} from './fields';
import { Modal } from './Modal';

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inadimplente', label: 'Inadimplente' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'cancelado', label: 'Cancelado' },
];

/** Valores iniciais do formulário; `initial` vem do aluno em edição. */
export interface StudentFormValues {
  id?: number;
  nome: string;
  email: string;
  telefone: string;
  planoId: number | null;
  promocaoId: number | null;
  mensalidade: string;
  dataEntrada: string;
  dataSaida: string;
  status: StudentStatus;
}

export function emptyStudentForm(): StudentFormValues {
  return {
    nome: '',
    email: '',
    telefone: '',
    planoId: null,
    promocaoId: null,
    mensalidade: '',
    dataEntrada: todayStr(),
    dataSaida: '',
    status: 'ativo',
  };
}

export function StudentFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** undefined = novo aluno. */
  initial?: StudentFormValues;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<StudentFormValues>(initial ?? emptyStudentForm());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyStudentForm());
      setErr(null);
    }
  }, [open, initial]);

  // Planos e promoções alimentam os seletores e o preenchimento do valor.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .settings()
      .then((res) => {
        if (!alive) return;
        setPlans(res.plans);
        setPromotions(res.promotions);
      })
      .catch(() => {
        if (alive) setErr('Não foi possível carregar planos e promoções.');
      });
    return () => {
      alive = false;
    };
  }, [open]);

  /** Trocar o plano sugere o valor dele, sem sobrescrever edição manual. */
  function selectPlan(planoId: number) {
    const plano = plans.find((p) => p.id === planoId);
    const mensalidadeVazia = form.mensalidade.trim() === '';
    const igualAoPlanoAnterior = plans.some(
      (p) => p.id === form.planoId && centavosToInput(p.valorCentavos) === form.mensalidade,
    );
    setForm({
      ...form,
      planoId,
      mensalidade:
        plano && (mensalidadeVazia || igualAoPlanoAnterior)
          ? centavosToInput(plano.valorCentavos)
          : form.mensalidade,
    });
  }

  async function save() {
    const mensalidadeCentavos = inputToCentavos(form.mensalidade);
    if (form.nome.trim() === '') return setErr('Informe o nome do aluno.');
    if (form.planoId === null) return setErr('Selecione um plano.');
    if (mensalidadeCentavos === null) return setErr('Mensalidade inválida.');
    if (form.dataSaida !== '' && form.dataSaida < form.dataEntrada) {
      return setErr('A data de saída não pode ser anterior à de entrada.');
    }

    const payload: StudentPayload = {
      nome: form.nome,
      email: form.email.trim() === '' ? null : form.email.trim(),
      telefone: form.telefone.trim() === '' ? null : form.telefone.trim(),
      planoId: form.planoId,
      promocaoId: form.promocaoId,
      mensalidadeCentavos,
      dataEntrada: form.dataEntrada,
      dataSaida: form.dataSaida === '' ? null : form.dataSaida,
      status: form.status,
    };

    setSaving(true);
    setErr(null);
    try {
      if (form.id !== undefined) await api.updateStudent(form.id, payload);
      else await api.createStudent(payload);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const promocoesVisiveis = promotions.filter((p) => p.ativa || p.id === form.promocaoId);

  return (
    <Modal
      open={open}
      title={form.id !== undefined ? 'Editar aluno' : 'Novo aluno'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
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
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        )}
      </Field>

      <div className="field-row">
        <Field label="E-mail" hint="Opcional">
          {(id) => (
            <input
              id={id}
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
        </Field>
        <Field label="Telefone" hint="Opcional">
          {(id) => (
            <input
              id={id}
              className="input"
              value={form.telefone}
              placeholder="(11) 98888-7777"
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          )}
        </Field>
      </div>

      <div className="field-row">
        <Field label="Plano">
          {(id) => (
            <select
              id={id}
              className="select"
              value={form.planoId ?? ''}
              onChange={(e) => selectPlan(Number(e.target.value))}
            >
              <option value="" disabled>
                Selecione
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Mensalidade">
          {(id) => (
            <MoneyInput
              id={id}
              value={form.mensalidade}
              onChange={(v) => setForm({ ...form, mensalidade: v })}
            />
          )}
        </Field>
      </div>

      <div className="field-row">
        <Field label="Entrada">
          {(id) => (
            <DateInput
              id={id}
              value={form.dataEntrada}
              max={todayStr()}
              onChange={(v) => setForm({ ...form, dataEntrada: v })}
            />
          )}
        </Field>
        <Field label="Status">
          {(id) => (
            <select
              id={id}
              className="select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="field-row">
        <Field label="Promoção" hint="Opcional">
          {(id) => (
            <select
              id={id}
              className="select"
              value={form.promocaoId ?? ''}
              onChange={(e) =>
                setForm({ ...form, promocaoId: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">Nenhuma</option>
              {promocoesVisiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.ativa ? '' : ' (encerrada)'}
                </option>
              ))}
            </select>
          )}
        </Field>
        {form.status === 'cancelado' && (
          <Field label="Saída" hint="Data do cancelamento">
            {(id) => (
              <DateInput
                id={id}
                value={form.dataSaida}
                max={todayStr()}
                onChange={(v) => setForm({ ...form, dataSaida: v })}
              />
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
