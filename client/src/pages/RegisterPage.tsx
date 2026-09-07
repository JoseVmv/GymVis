import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/ui';

export function RegisterPage() {
  const { register } = useAuth();
  const [nome, setNome] = useState('');
  const [academiaNome, setAcademiaNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (senha.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        nome: nome.trim(),
        academiaNome: academiaNome.trim(),
        email: email.trim(),
        senha,
      });
      // Redirect automático via PublicOnly ao atualizar o usuário.
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.',
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
          <h1 className="auth__title">Criar sua conta</h1>
          <div className="field">
            <label htmlFor="reg-nome">Seu nome</label>
            <input
              id="reg-nome"
              className="input"
              type="text"
              autoComplete="name"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reg-academia">Nome da academia</label>
            <input
              id="reg-academia"
              className="input"
              type="text"
              autoComplete="organization"
              required
              value={academiaNome}
              onChange={(e) => setAcademiaNome(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reg-email">E-mail</label>
            <input
              id="reg-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reg-senha">Senha</label>
            <input
              id="reg-senha"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <span className="small muted">Mínimo de 8 caracteres</span>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn--primary btn--full" disabled={submitting}>
            {submitting ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>
        <div className="auth__foot">
          Já tem conta? <Link to="/login">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
