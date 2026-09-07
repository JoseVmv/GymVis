import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), senha });
      // Redirect automático via PublicOnly ao atualizar o usuário.
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__box">
        <div className="auth__brand">
          <Logo size={30} />
          <span>GymVis</span>
        </div>
        <form className="auth__card" onSubmit={handleSubmit}>
          <h1 className="auth__title">Entrar na sua conta</h1>
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-senha">Senha</label>
            <input
              id="login-senha"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn--primary btn--full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="auth__foot">
          Ainda não tem conta? <Link to="/register">Criar conta</Link>
        </div>
        <div className="auth__hint">Conta de demonstração: demo@gymvis.app · senha demo1234</div>
      </div>
    </div>
  );
}
