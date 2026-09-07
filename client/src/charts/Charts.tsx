import type { FlowPoint, RiskLevel, RiskSlice } from '@gymvis/shared';
import { useMemo } from 'react';
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
      color: (p.color ?? p.fill ?? viz.blue) as string,
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
          stroke={viz.blue}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
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
        <Bar dataKey="value" name={name} fill={viz.blue} radius={[4, 4, 0, 0]} maxBarSize={24} />
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
            { color: viz.blue, label: 'Novos' },
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
          <Bar dataKey="Novos" stackId="flow" fill={viz.blue} radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar dataKey="Cancelamentos" stackId="flow" fill={viz.red} radius={[0, 0, 4, 4]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------- Distribuição de risco */

const riskOrder: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function RiskDistributionBars({ data }: { data: RiskSlice[] }) {
  const byLevel = new Map(data.map((s) => [s.level, s.count]));
  const counts = riskOrder.map((level) => byLevel.get(level) ?? 0);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="risk-bars">
      {riskOrder.map((level, i) => {
        const count = counts[i];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={level} className="risk-bars__row">
            <span className="muted">{riskLabel(level)}</span>
            <div className="risk-bars__track">
              <div
                className="risk-bars__fill"
                style={{ width: `${(count / max) * 100}%`, background: riskColor[level] }}
              />
            </div>
            <span className="risk-bars__count">
              <strong>{fmtInt(count)}</strong> · {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
