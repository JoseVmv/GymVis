/** Formatação pt-BR usada em toda a interface. */

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtInt(n: number): string {
  return intFmt.format(Math.round(n));
}

export function fmtCurrency(centavos: number): string {
  return currencyFmt.format(centavos / 100);
}

/** Compacto para eixos: 1.234 → '1,2 mil'. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`;
  }
  return intFmt.format(n);
}

/** 3.42 → '3,4x/sem' */
export function fmtFreq(perWeek: number): string {
  return `${perWeek.toFixed(1).replace('.', ',')}x/sem`;
}

/** -0.38 → '−38%' ; 0.12 → '+12%' ; null → '—' */
export function fmtVariation(v: number | null): string {
  if (v === null) return '—';
  const pct = Math.round(Math.abs(v) * 100);
  if (pct === 0) return '0%';
  return `${v > 0 ? '+' : '−'}${pct}%`;
}

/** '2026-09-07' → '07/09/2026' */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(ms: number): string {
  return dateTimeFmt.format(new Date(ms));
}

export function fmtDaysAgo(days: number | null): string {
  if (days === null) return 'nunca';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${intFmt.format(days)} dias`;
}
