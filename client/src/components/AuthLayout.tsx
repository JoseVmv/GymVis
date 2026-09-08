import type { ReactNode } from 'react';
import { Logo } from './ui';

/** O que o dono da academia recebe, dito na linguagem dele. */
const PROMESSAS = [
  {
    termo: 'Quem parou de vir',
    texto: 'Os alunos que continuam pagando e sumiram da academia.',
  },
  {
    termo: 'Quanto isso custa',
    texto: 'A soma das mensalidades que dependem de quem está sumindo.',
  },
  {
    termo: 'Onde agir primeiro',
    texto: 'A lista ordenada por quem está há mais tempo sem aparecer.',
  },
];

/**
 * Entrar e criar conta dividem a tela: o formulário à esquerda, e à direita o
 * que o produto entrega. Abaixo de 980px o painel some — num celular a única
 * coisa que importa é o formulário.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__form-side">
        <div className="auth__box">
          <div className="auth__brand">
            <Logo size={28} />
            <span>GymVis</span>
          </div>
          {children}
        </div>
      </div>

      <aside className="auth__pitch">
        <h2 className="auth__pitch-head">A catraca já sabe quem parou de vir. Agora você também.</h2>
        <ul className="auth__pitch-list">
          {PROMESSAS.map((p) => (
            <li key={p.termo}>
              <div className="auth__pitch-term">{p.termo}</div>
              <div className="auth__pitch-def">{p.texto}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
