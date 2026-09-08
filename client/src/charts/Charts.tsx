import type { FlowPoint, RiskLevel, RiskSlice } from '@gymvis/shared';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtCompact, fmtInt } from '../lib/format';
import { riskColor, viz } from './palette';
import { riskLabel } from '../components/ui';

/* ----------------------------------------------------------- Tooltip padrão */

interface TooltipRow {
  color: string;
  name: string;
  value: string;
}

function TooltipCard({ label, rows }: { label: string; rows: TooltipRow[] }) {
  return (
    <div className="tooltip-card">
      <div className="tooltip-card__label">{label}</div>
      {rows.map((row) => (
        <div key={row.name} className="tooltip-card__row">
          <span className="tooltip-card__dot" style={{ background: row.color }} />
          <span className="muted">{row.name}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildTooltip(
  format: (v: number) => string,
  transform: (v: number) => number = (v) => v,
) {
  return function VizTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const rows: TooltipRow[] = payload.map((p: any) => ({
      color: (p.color ?? p.fill ?? viz.green) as string,
      name: String(p.name),
      value: format(transform(Number(p.value))),
    }));
    return <TooltipCard label={String(label)} rows={rows} />;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ Legenda */

export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label} className="chart-legend__item">
          <span className="chart-legend__dot" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- Eixos compartilhados */

const tickStyle = { fontSize: 11, fill: viz.tick } as const;

/* ------------------------------------------------------------ Linha (série única) */

export function TrendLineChart({
  data,
  name,
  height = 220,
  valueFormat = fmtInt,
  yFormat = fmtCompact,
  allowDecimals = false,
}: {
  data: { label: string; value: number }[];
  /** Nome da métrica no tooltip (a série única dispensa legenda). */
  name: string;
  height?: number;
  /** Formata o valor no tooltip. */
  valueFormat?: (v: number) => string;
  /** Formata os ticks do eixo Y. */
  yFormat?: (v: number) => string;
  allowDecimals?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={viz.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
          tick={tickStyle}
          dy={4}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={tickStyle}
          width={46}
          tickFormatter={yFormat}
          allowDecimals={allowDecimals}
        />
        <Tooltip
          content={buildTooltip(valueFormat)}
          cursor={{ stroke: viz.axis, strokeWidth: 1 }}
        />
        <Line
          dataKey="value"
          name={name}
          type="monotone"
          stroke={viz.green}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: viz.dotRing }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ Colunas */

export function ColumnChart({
  data,
  name,
  height = 220,
  valueFormat = fmtInt,
}: {
  data: { label: string; value: number }[];
  name: string;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={viz.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
          tick={tickStyle}
          dy={4}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={tickStyle}
          width={46}
          tickFormatter={fmtCompact}
          allowDecimals={false}
        />
        <Tooltip content={buildTooltip(valueFormat)} cursor={{ fill: viz.barCursor }} />
        <Bar dataKey="value" name={name} fill={viz.green} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------- Novos vs. cancelamentos (divergente) */

export function FlowChart({ data, height = 220 }: { data: FlowPoint[]; height?: number }) {
  const rows = useMemo(
    () =>
      data.map((p) => ({
        label: p.label,
        Novos: p.novos,
        Cancelamentos: -p.cancelamentos,
      })),
    [data],
  );
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 6 }}>
        <ChartLegend
          items={[
            { color: viz.green, label: 'Novos' },
            { color: viz.red, label: 'Cancelamentos' },
          ]}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%" stackOffset="sign">
          <CartesianGrid vertical={false} stroke={viz.grid} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={tickStyle}
            dy={4}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={tickStyle}
            width={46}
            tickFormatter={(v: number) => fmtCompact(Math.abs(v))}
            allowDecimals={false}
          />
          <Tooltip
            content={buildTooltip(fmtInt, Math.abs)}
            cursor={{ fill: viz.barCursor }}
          />
          <ReferenceLine y={0} stroke={viz.axis} strokeWidth={1} />
          <Bar dataKey="Novos" stackId="flow" fill={viz.green} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar dataKey="Cancelamentos" stackId="flow" fill={viz.red} radius={[0, 0, 4, 4]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --------------------------------------------------------- Carga de risco */

const riskOrder: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * O plantel inteiro em uma barra só, carregada da esquerda para a direita.
 *
 * Quatro barras separadas respondem "quantos há em cada nível"; uma barra
 * carregada responde "quanto do meu plantel está escorregando", que é a
 * pergunta do dono. Cada segmento leva à lista já filtrada por aquele nível.
 */
export function RiskLoadBar({ data }: { data: RiskSlice[] }) {
  const byLevel = new Map(data.map((s) => [s.level, s.count]));
  const counts = riskOrder.map((level) => byLevel.get(level) ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return <p className="muted small mt-12">Nenhum aluno matriculado para classificar.</p>;
  }

  return (
    <div>
      <div className="load__bar">
        {riskOrder.map((level, i) =>
          counts[i] === 0 ? null : (
            <Link
              key={level}
              to={`/alunos?risco=${level}`}
              className="load__seg"
              style={{ flexGrow: counts[i], background: riskColor[level] }}
              aria-label={`${fmtInt(counts[i])} alunos em risco ${riskLabel(level).toLowerCase()}`}
              title={`${riskLabel(level)}: ${fmtInt(counts[i])}`}
            />
          ),
        )}
      </div>
      <div className="load__legend">
        {riskOrder.map((level, i) => (
          <Link key={level} to={`/alunos?risco=${level}`} className="load__key">
            <span className="load__dot" style={{ background: riskColor[level] }} />
            {riskLabel(level)}
            <span className="load__count">{fmtInt(counts[i])}</span>
            <span className="load__pct">{Math.round((counts[i] / total) * 100)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
