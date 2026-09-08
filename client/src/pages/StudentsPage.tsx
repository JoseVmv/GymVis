import type {
  AlertKey,
  AlertThresholds,
  RiskLevel,
  StudentListItem,
  StudentStatus,
  StudentsResponse,
} from '@gymvis/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { centavosToInput } from '../components/fields';
import { StudentFormModal, type StudentFormValues } from '../components/StudentForm';
import {
  EmptyState,
  MetaCounts,
  PageHeader,
  PageLoading,
  RiskBadge,
  StatusBadge,
  variationStyle,
} from '../components/ui';
import {
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  fmtDaysAgo,
  fmtFreq,
  fmtInt,
  fmtVariation,
} from '../lib/format';

const STATUS_FILTERS: readonly StudentStatus[] = ['ativo', 'pausado', 'cancelado', 'inadimplente'];
const RISK_FILTERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'EM_RISCO'] as const;
type RiskFilter = (typeof RISK_FILTERS)[number];

const ALERT_FILTERS: readonly AlertKey[] = ['inativo7', 'inativo14', 'inativo30', 'queda'];

type SortKey = 'nome' | 'mensalidade' | 'acesso' | 'freq' | 'variacao' | 'risco';
type SortDir = 'asc' | 'desc';

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/** Direção inicial ao ativar cada coluna (variação começa pelas maiores quedas). */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  nome: 'asc',
  mensalidade: 'desc',
  acesso: 'desc',
  freq: 'desc',
  variacao: 'asc',
  risco: 'desc',
};

function parseStatus(v: string | null): StudentStatus | '' {
  return v !== null && (STATUS_FILTERS as readonly string[]).includes(v)
    ? (v as StudentStatus)
    : '';
}

function parseRisk(v: string | null): RiskFilter | '' {
  return v !== null && (RISK_FILTERS as readonly string[]).includes(v) ? (v as RiskFilter) : '';
}

function parseAlert(v: string | null): AlertKey | '' {
  return v !== null && (ALERT_FILTERS as readonly string[]).includes(v) ? (v as AlertKey) : '';
}

/**
 * Rótulos dos alertas a partir dos limiares do servidor — os mesmos textos do
 * painel, para o dono reconhecer de onde veio o filtro.
 */
function alertLabels(t: AlertThresholds): Record<AlertKey, string> {
  const [first, second, third] = t.inactivityDays;
  return {
    inativo7: `Sem acesso há ${first}–${second - 1} dias`,
    inativo14: `Sem acesso há ${second}–${third - 1} dias`,
    inativo30: `Sem acesso há ${third} dias ou mais`,
    queda: `Queda de frequência de ${Math.round(t.frequencyDrop * 100)}% ou mais`,
  };
}

/**
 * Reproduz os buckets de /api/alerts: só matriculados, inatividade contada
 * desde a entrada para quem nunca acessou, faixas mutuamente exclusivas.
 */
function matchesAlert(s: StudentListItem, alert: AlertKey, t: AlertThresholds): boolean {
  if (s.status !== 'ativo' && s.status !== 'inadimplente') return false;
  const [first, second, third] = t.inactivityDays;
  const days = s.daysSinceLastAccess ?? s.daysSinceJoin;
  switch (alert) {
    case 'inativo7':
      return days >= first && days < second;
    case 'inativo14':
      return days >= second && days < third;
    case 'inativo30':
      return days >= third;
    case 'queda':
      return (
        s.variation !== null &&
        s.variation <= -t.frequencyDrop &&
        s.baselineWeekly !== null &&
        s.baselineWeekly >= t.minBaselineWeekly
      );
  }
}

/** Busca insensível a maiúsculas e acentos. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function sortValue(s: StudentListItem, key: SortKey): string | number | null {
  switch (key) {
    case 'nome':
      return s.nome;
    case 'mensalidade':
      return s.mensalidadeCentavos;
    case 'acesso':
      return s.daysSinceLastAccess;
    case 'freq':
      return s.baselineWeekly ?? s.recentWeekly;
    case 'variacao':
      return s.variation;
    case 'risco':
      return s.risk === null ? null : RISK_RANK[s.risk];
  }
}

/** null sempre por último, independentemente da direção. */
function compare(a: string | number | null, b: string | number | null, dir: SortDir): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  const cmp =
    typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b, 'pt-BR')
      : Number(a) - Number(b);
  return dir === 'asc' ? cmp : -cmp;
}

export function StudentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('risco');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const busca = searchParams.get('busca') ?? '';
  const status = parseStatus(searchParams.get('status'));
  const risco = parseRisk(searchParams.get('risco'));
  const alerta = parseAlert(searchParams.get('alerta'));

  const [attempt, setAttempt] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<StudentFormValues | undefined>(undefined);
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);

  const reload = () => setAttempt((n) => n + 1);

  function openNewStudent() {
    setFormInitial(undefined);
    setFormOpen(true);
  }

  /**
   * A listagem não carrega e-mail nem telefone; abrir a edição com eles em
   * branco apagaria o contato do aluno ao salvar. Por isso busca o cadastro
   * completo antes de abrir o formulário.
   */
  async function openEditStudent(s: StudentListItem) {
    setEditLoadingId(s.id);
    try {
      const full = await api.student(s.id);
      setFormInitial({
        id: full.id,
        nome: full.nome,
        email: full.email ?? '',
        telefone: full.telefone ?? '',
        planoId: full.planoId,
        promocaoId: full.promocaoId,
        mensalidade: centavosToInput(full.mensalidadeCentavos),
        dataEntrada: full.dataEntrada,
        dataSaida: full.dataSaida ?? '',
        status: full.status,
      });
      setFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o aluno.');
    } finally {
      setEditLoadingId(null);
    }
  }

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .students()
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

  const setParam = (key: 'busca' | 'status' | 'risco' | 'alerta', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const students = useMemo(() => data?.students ?? [], [data]);

  const counts = useMemo(() => {
    let matriculados = 0;
    let pausados = 0;
    let cancelados = 0;
    for (const s of students) {
      if (s.status === 'ativo' || s.status === 'inadimplente') matriculados += 1;
      else if (s.status === 'pausado') pausados += 1;
      else cancelados += 1;
    }
    return { matriculados, pausados, cancelados };
  }, [students]);

  const visible = useMemo(() => {
    const q = normalize(busca.trim());
    let list = students;
    if (q) list = list.filter((s) => normalize(s.nome).includes(q));
    if (status) list = list.filter((s) => s.status === status);
    if (alerta && data) list = list.filter((s) => matchesAlert(s, alerta, data.alertThresholds));
    if (risco === 'EM_RISCO') list = list.filter((s) => s.risk === 'HIGH' || s.risk === 'CRITICAL');
    else if (risco) list = list.filter((s) => s.risk === risco);
    return [...list].sort((a, b) => {
      const cmp = compare(sortValue(a, sortKey), sortValue(b, sortKey), sortDir);
      if (cmp !== 0 || sortKey !== 'risco') return cmp;
      // Desempate do risco: mais dias sem acesso primeiro.
      return compare(a.daysSinceLastAccess, b.daysSinceLastAccess, 'desc');
    });
  }, [students, busca, status, risco, alerta, data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const sortableTh = (key: SortKey, label: string, extraClass?: string) => (
    <th
      className={`is-sortable${extraClass ? ` ${extraClass}` : ''}`}
      onClick={() => toggleSort(key)}
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label}
      {sortKey === key && (
        <span style={{ marginLeft: 4, fontSize: 8, opacity: 0.7 }}>
          {sortDir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );

  if (error) {
    return (
      <>
        <PageHeader title="Alunos" />
        <EmptyState
          title="Não foi possível carregar os alunos"
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

  const subtitle = (
    <MetaCounts
      items={[
        { value: fmtInt(counts.matriculados), label: 'matriculados' },
        { value: fmtInt(counts.pausados), label: 'pausados' },
        { value: fmtInt(counts.cancelados), label: 'cancelados' },
      ]}
    />
  );
  const labels = alertLabels(data.alertThresholds);

  if (students.length === 0) {
    return (
      <>
        <PageHeader title="Alunos" subtitle={subtitle} />
        <EmptyState
          title="Nenhum aluno cadastrado"
          description="Gere dados de demonstração no painel para explorar a plataforma."
          action={
            <Link to="/" className="btn btn--sm">
              Ir para o painel
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Alunos"
        subtitle={subtitle}
        action={
          <button type="button" className="btn btn--primary" onClick={openNewStudent}>
            Novo aluno
          </button>
        }
      />

      <div className="row row--wrap" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Buscar por nome"
          value={busca}
          onChange={(e) => setParam('busca', e.target.value)}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inadimplente">Inadimplente</option>
          <option value="pausado">Pausado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select className="select" value={risco} onChange={(e) => setParam('risco', e.target.value)}>
          <option value="">Todos os riscos</option>
          <option value="LOW">Baixo</option>
          <option value="MEDIUM">Médio</option>
          <option value="HIGH">Alto</option>
          <option value="CRITICAL">Crítico</option>
          <option value="EM_RISCO">Em risco (alto + crítico)</option>
        </select>
        <select
          className="select"
          value={alerta}
          onChange={(e) => setParam('alerta', e.target.value)}
        >
          <option value="">Todos os alertas</option>
          {ALERT_FILTERS.map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          {fmtInt(visible.length)} de {fmtInt(students.length)} alunos
        </span>
      </div>

      {alerta && (
        <p className="muted small" style={{ marginTop: -4, marginBottom: 12 }}>
          Alerta do painel: {labels[alerta].toLowerCase()}. Considera apenas alunos matriculados
          (ativos e inadimplentes).
        </p>
      )}

      {visible.length === 0 ? (
        <div className="table-wrap">
          <EmptyState title="Nenhum aluno encontrado" description="Ajuste os filtros ou a busca." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {sortableTh('nome', 'Nome')}
                <th>Status</th>
                <th>Plano</th>
                {sortableTh('mensalidade', 'Mensalidade', 't-right')}
                <th>Entrada</th>
                {sortableTh('acesso', 'Último acesso')}
                {sortableTh('freq', 'Freq. média')}
                {sortableTh('variacao', 'Variação')}
                {sortableTh('risco', 'Risco')}
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr
                  key={s.id}
                  className="is-clickable"
                  onClick={() => navigate(`/alunos/${s.id}`)}
                >
                  <td>{s.nome}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    {s.planoNome}
                    {s.promocaoNome !== null && (
                      <span
                        className="badge badge--accent"
                        style={{ marginLeft: 6 }}
                        title={`Promoção: ${s.promocaoNome}`}
                      >
                        Promoção
                      </span>
                    )}
                  </td>
                  <td className="num t-right">{fmtCurrency(s.mensalidadeCentavos)}</td>
                  <td className="t-muted">{fmtDate(s.dataEntrada)}</td>
                  <td title={s.lastAccessAt !== null ? fmtDateTime(s.lastAccessAt) : undefined}>
                    {s.daysSinceLastAccess === null ? (
                      <span className="t-muted">nunca</span>
                    ) : (
                      fmtDaysAgo(s.daysSinceLastAccess)
                    )}
                  </td>
                  <td className="num">{fmtFreq(s.baselineWeekly ?? s.recentWeekly)}</td>
                  <td className="num" style={variationStyle(s.variation)}>
                    {fmtVariation(s.variation)}
                  </td>
                  <td>
                    <RiskBadge risk={s.risk} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={editLoadingId === s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openEditStudent(s);
                      }}
                    >
                      {editLoadingId === s.id ? 'Abrindo…' : 'Editar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentFormModal
        open={formOpen}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />
    </>
  );
}
