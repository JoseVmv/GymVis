import type { RiskLevel, StudentStatus } from '@gymvis/shared';
import type { CSSProperties, ReactNode } from 'react';

/* ------------------------------------------------------------------ Marca */

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#151514" />
      <path
        d="M6 19h5l3-9 4 13 3-7h5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ Cartões */

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <div className="card__sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ Stat tile */

export function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  /** Texto do delta (ex.: '+12 vs. período anterior') + se a direção é boa. */
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' } | null;
  hint?: string;
}) {
  return (
    <div className="stat" title={hint}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {delta && (
        <div
          className={`stat__delta${
            delta.tone === 'good' ? ' is-good' : delta.tone === 'bad' ? ' is-bad' : ''
          }`}
        >
          <strong>{delta.text.split(' ')[0]}</strong>
          <span>{delta.text.substring(delta.text.indexOf(' ') + 1)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Badges */

const riskMeta: Record<RiskLevel, { label: string; tone: string }> = {
  LOW: { label: 'Baixo', tone: 'good' },
  MEDIUM: { label: 'Médio', tone: 'warn' },
  HIGH: { label: 'Alto', tone: 'serious' },
  CRITICAL: { label: 'Crítico', tone: 'critical' },
};

export function RiskBadge({ risk }: { risk: RiskLevel | null }) {
  if (!risk) return <span className="muted">—</span>;
  const meta = riskMeta[risk];
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}

const statusMeta: Record<StudentStatus, { label: string; tone: string }> = {
  ativo: { label: 'Ativo', tone: 'good' },
  pausado: { label: 'Pausado', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
  inadimplente: { label: 'Inadimplente', tone: 'warn' },
};

export function StatusBadge({ status }: { status: StudentStatus }) {
  const meta = statusMeta[status];
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}

export const riskLabel = (r: RiskLevel): string => riskMeta[r].label;
export const statusLabel = (s: StudentStatus): string => statusMeta[s].label;

/** A partir de quanto uma variação de frequência ganha cor na interface. */
const VARIATION_HIGHLIGHT = 0.3;

/** Colore quedas e altas relevantes de frequência; neutro no meio. */
export function variationStyle(v: number | null): CSSProperties | undefined {
  if (v === null) return undefined;
  if (v <= -VARIATION_HIGHLIGHT) return { color: 'var(--critical-text)' };
  if (v >= VARIATION_HIGHLIGHT) return { color: 'var(--good-text)' };
  return undefined;
}

/* ------------------------------------------------------------------ Controles */

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={`seg__opt${opt.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Feedback */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="page-loading">
      <div className="spinner" />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="page-head__sub">{subtitle}</div>}
      </div>
      {action}
    </header>
  );
}
