import { useId, type ReactNode } from 'react';

/** Campo de formulário rotulado, com mensagem de ajuda opcional. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

/** Converte centavos para o texto editável "1234,50". */
export function centavosToInput(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/** Lê "1.234,50" ou "1234.50" e devolve centavos; null quando não é número. */
export function inputToCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Entrada de dinheiro em reais, com prefixo. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0,00',
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="money-input">
      <span className="money-input__prefix">R$</span>
      <input
        id={id}
        className="input money-input__field"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Data 'YYYY-MM-DD' — usa o seletor nativo do navegador. */
export function DateInput({
  id,
  value,
  onChange,
  max,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  max?: string;
}) {
  return (
    <input
      id={id}
      type="date"
      className="input"
      value={value}
      max={max}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
