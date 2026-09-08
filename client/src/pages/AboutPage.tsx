import type { MetricsConfigResponse } from '@gymvis/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, EmptyState, Logo, PageLoading } from '../components/ui';

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

function Feature({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="store-feature">
      <div className="store-feature__icon">
        <Icon d={icon} />
      </div>
      <div>
        <div className="store-feature__title">{title}</div>
        <div className="store-feature__text">{children}</div>
      </div>
    </div>
  );
}

export function AboutPage() {
  const [config, setConfig] = useState<MetricsConfigResponse | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setError(false);
    api
      .config()
      .then((res) => alive && setConfig(res))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <EmptyState
        title="Não foi possível carregar"
        description="Verifique sua conexão e tente novamente."
        action={
          <button type="button" className="btn btn--primary" onClick={reload}>
            Tentar novamente
          </button>
        }
      />
    );
  }
  if (!config) return <PageLoading />;

  const { risk, alerts } = config;
  const dropMedio = Math.round(risk.frequencyDrop.medium * 100);

  return (
    <div className="stack" style={{ gap: 14, maxWidth: 860 }}>
      <Card className="store-hero-card">
        <div className="store-hero">
          <div className="store-hero__icon">
            <Logo size={48} idSuffix="sobre" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="store-hero__name">GymVis</div>
            <div className="store-hero__tagline">
              Descubra quem está sumindo da sua academia antes de perder o aluno.
            </div>
            <div className="store-hero__meta">
              <span>
                <strong>Análise</strong>
                Categoria
              </span>
              <span>
                <strong>1.0</strong>
                Versão
              </span>
              <span>
                <strong>Você</strong>
                Só a sua academia
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="store-features">
        <Feature icon="M3 3v18h18M7 15l4-4 3 3 5-6" title="Painel diário">
          Alunos ativos, entradas, saídas e frequência do período, em uma tela.
        </Feature>
        <Feature icon="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" title="Alertas de sumiço">
          Quem parou de aparecer aparece aqui. Toque no alerta e veja a lista.
        </Feature>
        <Feature icon="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" title="Receita em risco">
          Quanto da mensalidade do mês depende de quem está sumindo.
        </Feature>
        <Feature icon="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm13 14v-2a4 4 0 0 0-3-3.9" title="Ficha do aluno">
          Frequência ao longo do tempo, últimos acessos e o motivo do risco.
        </Feature>
      </div>

      <Card title="Como funciona">
        <ul className="store-list" style={{ marginTop: 8 }}>
          <li>A catraca da academia registra quem entrou. O GymVis lê esses registros.</li>
          <li>
            Ele compara a frequência das últimas 4 semanas com a de antes e vê quem caiu.
          </li>
          <li>Quem some ganha um nível de risco e entra na lista de alertas.</li>
          <li>Somando as mensalidades de quem está em risco, você vê quanto está em jogo.</li>
        </ul>
      </Card>

      <Card title="Quando um aluno vira alerta">
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <tbody>
              <tr>
                <td>
                  <span className="badge badge--warn">Médio</span>
                </td>
                <td className="t-muted" style={{ whiteSpace: 'normal' }}>
                  {risk.inactivity.medium} dias sem vir, ou queda de {dropMedio}% na frequência
                </td>
              </tr>
              <tr>
                <td>
                  <span className="badge badge--serious">Alto</span>
                </td>
                <td className="t-muted" style={{ whiteSpace: 'normal' }}>
                  {risk.inactivity.high} dias sem vir, ou queda de{' '}
                  {Math.round(risk.frequencyDrop.high * 100)}%
                </td>
              </tr>
              <tr>
                <td>
                  <span className="badge badge--critical">Crítico</span>
                </td>
                <td className="t-muted" style={{ whiteSpace: 'normal' }}>
                  {risk.inactivity.critical} dias ou mais sem vir
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          São regras simples, sem inteligência artificial. Você muda esses números quando quiser em{' '}
          <Link to="/configuracoes" style={{ color: 'var(--accent-strong)', fontWeight: 550 }}>
            Configurações
          </Link>
          .
        </p>
      </Card>

      <Card title="Receita em risco, na prática">
        <p className="store-list" style={{ listStyle: 'none', paddingLeft: 0, marginTop: 8 }}>
          O sistema pega os alunos matriculados com risco alto ou crítico e soma a mensalidade de
          cada um. Se são 24 pessoas de R$ 130, a receita em risco é R$ 3.120.
        </p>
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--warn-wash)',
            color: 'var(--warn-text)',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          É uma estimativa, não dinheiro perdido. Ninguém cancelou ainda — é exatamente por isso
          que dá para agir.
        </div>
      </Card>

      <Card title="Privacidade">
        <ul className="store-list" style={{ marginTop: 8 }}>
          <li>Não controla a catraca nem se comunica com ela.</li>
          <li>Não usa biometria, reconhecimento facial nem guarda fotos.</li>
          <li>Só lê cadastro e horários de entrada, e nada sai da sua academia.</li>
        </ul>
      </Card>

      <p className="muted small" style={{ textAlign: 'center', padding: '4px 0 8px' }}>
        Alertas do painel: {alerts.inactivityDays.join(', ')} dias sem acesso e queda de{' '}
        {Math.round(alerts.frequencyDrop * 100)}%.
      </p>
    </div>
  );
}
