import type { RiskLevel, StudentStatus } from '@gymvis/shared';
import type { CSSProperties, ReactNode } from 'react';

/* ------------------------------------------------------------------ Marca */

/**
 * Marca do GymVis: um kettlebell sobre as barras de um gráfico.
 *
 * O gradiente vai do azul-petróleo ao azul-marinho, como na arte original.
 * O id do gradiente é sufixado para não colidir quando há duas logos na tela.
 */
export function Logo({ size = 24, idSuffix = 'main' }: { size?: number; idSuffix?: string }) {
  const gradId = `gymvis-grad-${idSuffix}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradId} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12303f" />
          <stop offset="0.55" stopColor="#1d5a72" />
          <stop offset="1" stopColor="#2e8b96" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradId})`}>
        {/* Barras do gráfico, flanqueando o haltere, sobre a linha de base. */}
        <rect x="2.5" y="30" width="5" height="11" rx="1.2" />
        <rect x="8.8" y="23.5" width="5" height="17.5" rx="1.2" />
        <rect x="34" y="26.5" width="5" height="14.5" rx="1.2" />
        <rect x="40" y="19" width="5" height="22" rx="1.2" />
        <rect x="2.5" y="41.5" width="42.5" height="3" rx="1.4" />
        {/* Haltere: alça larga e corpo em forma de sino (não um círculo, que
            de longe vira cadeado). */}
        <path
          d="M17.6 24.5v-4.7a6.4 6.4 0 0 1 12.8 0v4.7"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path d="M20.2 23.2c0 3.4-4.7 4.6-4.7 9a8.5 8.5 0 0 0 17 0c0-4.4-4.7-5.6-4.7-9Z" />
      </g>
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
