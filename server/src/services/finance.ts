import type {
  Expense,
  ExpenseCategory,
  ExpensePayload,
  FinanceMonth,
  FinanceResponse,
} from '@gymvis/shared';
import { db } from '../db/client';
import { addMonths, lastDayOfMonthStr, monthKey, monthLabel, startOfMonth, toDateStr } from '../lib/dates';

/**
 * Rendimentos da academia.
 *
 * Não existe registro de pagamento: o faturamento é DERIVADO das mensalidades
 * de quem estava matriculado em cada mês. Alunos inadimplentes entram numa
 * coluna separada — foram cobrados, mas o dinheiro não entrou.
 */

interface StudentMoneyRow {
  data_entrada: string;
  data_saida: string | null;
  status: string;
  mensalidade_centavos: number;
}

const ALUNOS_FINANCEIRO =
  'SELECT data_entrada, data_saida, status, mensalidade_centavos FROM students WHERE academy_id = ?';

const DESPESAS_NA_JANELA =
  'SELECT id, descricao, categoria, valor_centavos, data FROM expenses WHERE academy_id = ? AND data >= ? AND data <= ? ORDER BY data DESC, id DESC';

const INSERIR_DESPESA =
  'INSERT INTO expenses (academy_id, descricao, categoria, valor_centavos, data, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id';

const ATUALIZAR_DESPESA =
  'UPDATE expenses SET descricao = ?, categoria = ?, valor_centavos = ?, data = ? WHERE id = ? AND academy_id = ?';

const APAGAR_DESPESA = 'DELETE FROM expenses WHERE id = ? AND academy_id = ?';

interface ExpenseRow {
  id: number;
  descricao: string;
  categoria: string;
  valor_centavos: number;
  data: string;
}

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  descricao: r.descricao,
  categoria: r.categoria as ExpenseCategory,
  valorCentavos: r.valor_centavos,
  data: r.data,
});

/** Matriculado na data: entrou até lá e não saiu até lá. */
function enrolledOn(r: StudentMoneyRow, endStr: string): boolean {
  return r.data_entrada <= endStr && (r.data_saida === null || r.data_saida > endStr);
}

export async function getFinance(
  academyId: number,
  periodMonths: number,
  now = new Date(),
): Promise<FinanceResponse> {
  const currentMonthStart = startOfMonth(now);
  const today = toDateStr(now);
  const firstMonthStart = addMonths(currentMonthStart, -(periodMonths - 1));

  const [students, linhasDespesa] = await Promise.all([
    db.all<StudentMoneyRow>(ALUNOS_FINANCEIRO, academyId),
    db.all<ExpenseRow>(
      DESPESAS_NA_JANELA,
      academyId,
      toDateStr(firstMonthStart),
      lastDayOfMonthStr(currentMonthStart),
    ),
  ]);
  const expenses = linhasDespesa.map(toExpense);

  const despesasPorMes = new Map<string, number>();
  for (const e of expenses) {
    const key = e.data.slice(0, 7);
    despesasPorMes.set(key, (despesasPorMes.get(key) ?? 0) + e.valorCentavos);
  }

  const meses: FinanceMonth[] = [];
  for (let k = periodMonths - 1; k >= 0; k--) {
    const monthStart = addMonths(currentMonthStart, -k);
    const key = monthKey(monthStart);
    const isCurrent = k === 0;
    const endStr = isCurrent ? today : lastDayOfMonthStr(monthStart);

    let receita = 0;
    let inadimplencia = 0;
    for (const s of students) {
      if (!enrolledOn(s, endStr)) continue;
      // O status é o de hoje: no mês corrente ele vale, nos anteriores é a
      // melhor aproximação possível (o banco não guarda histórico de status).
      if (s.status === 'inadimplente') inadimplencia += s.mensalidade_centavos;
      else if (s.status !== 'pausado') receita += s.mensalidade_centavos;
    }

    const despesas = despesasPorMes.get(key) ?? 0;
    meses.push({
      month: key,
      label: monthLabel(monthStart),
      receitaCentavos: receita,
      inadimplenciaCentavos: inadimplencia,
      despesasCentavos: despesas,
      resultadoCentavos: receita - despesas,
    });
  }

  const soma = (pick: (m: FinanceMonth) => number): number =>
    meses.reduce((acc, m) => acc + pick(m), 0);

  const porCategoria = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    porCategoria.set(e.categoria, (porCategoria.get(e.categoria) ?? 0) + e.valorCentavos);
  }

  const matriculadosHoje = students.filter(
    (s) => enrolledOn(s, today) && s.status !== 'pausado',
  );
  const receitaMensalAtual = matriculadosHoje.reduce((acc, s) => acc + s.mensalidade_centavos, 0);

  return {
    periodMonths,
    meses,
    receitaCentavos: soma((m) => m.receitaCentavos),
    inadimplenciaCentavos: soma((m) => m.inadimplenciaCentavos),
    despesasCentavos: soma((m) => m.despesasCentavos),
    resultadoCentavos: soma((m) => m.resultadoCentavos),
    receitaMensalAtualCentavos: receitaMensalAtual,
    ticketMedioCentavos:
      matriculadosHoje.length > 0 ? Math.round(receitaMensalAtual / matriculadosHoje.length) : 0,
    despesasPorCategoria: [...porCategoria.entries()]
      .map(([categoria, valorCentavos]) => ({ categoria, valorCentavos }))
      .sort((a, b) => b.valorCentavos - a.valorCentavos),
    expenses,
  };
}

export async function createExpense(
  academyId: number,
  payload: ExpensePayload,
): Promise<number> {
  const linha = await db.one<{ id: number }>(
    INSERIR_DESPESA,
    academyId,
    payload.descricao.trim(),
    payload.categoria,
    payload.valorCentavos,
    payload.data,
    Date.now(),
  );
  return linha!.id;
}

export async function updateExpense(
  academyId: number,
  id: number,
  payload: ExpensePayload,
): Promise<boolean> {
  const afetadas = await db.run(
    ATUALIZAR_DESPESA,
    payload.descricao.trim(),
    payload.categoria,
    payload.valorCentavos,
    payload.data,
    id,
    academyId,
  );
  return afetadas > 0;
}

export async function deleteExpense(academyId: number, id: number): Promise<boolean> {
  return (await db.run(APAGAR_DESPESA, id, academyId)) > 0;
}
