import type { MetricsConfigResponse, RiskLevel, RiskThresholds } from '@gymvis/shared';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../api/client';
import { Card, EmptyState, PageHeader, PageLoading, RiskBadge } from '../components/ui';
import { fmtCurrency, fmtFreq, fmtInt } from '../lib/format';

/* ---------------------------------------------------------------- Layout */

/** Texto corrido não acompanha a largura do card: linha longa demais cansa. */
const prose: CSSProperties = { maxWidth: '72ch', lineHeight: 1.6 };
const listStyle: CSSProperties = { ...prose, margin: 0, paddingLeft: 20 };
const cellWrap: CSSProperties = { whiteSpace: 'normal' };

function Prose({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      {children}
    </div>
  );
}

function P({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={className} style={prose}>
      {children}
    </p>
  );
}

/** Bloco de destaque para ressalvas que não podem passar batido. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...prose,
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--warn-wash)',
        color: 'var(--warn-text)',
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ Formatação */

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 28 dias → '4 semanas'. */
function weeksFromDays(days: number): string {
  const weeks = days / 7;
  if (weeks === 1) return '1 semana';
  const txt = Number.isInteger(weeks) ? String(weeks) : weeks.toFixed(1).replace('.', ',');
  return `${txt} semanas`;
}

/* -------------------------------------------------- Conteúdo derivado da API */

/**
 * As linhas reproduzem `classifyRisk` do servidor: as faixas de dias sem
 * acesso e as de queda de frequência, na ordem em que são aplicadas.
 */
function riskRows(risk: RiskThresholds): { level: RiskLevel; when: string }[] {
  const { inactivity, frequencyDrop } = risk;
  return [
    {
      level: 'LOW',
      when: 'Frequência dentro do esperado. Nenhuma das condições abaixo.',
    },
    {
      level: 'MEDIUM',
      when:
        `De ${inactivity.medium} a ${inactivity.high - 1} dias sem acesso, ou queda de ` +
        `${pct(frequencyDrop.medium)} ou mais na frequência.`,
    },
    {
      level: 'HIGH',
      when:
        `De ${inactivity.high} a ${inactivity.critical - 1} dias sem acesso, ou queda de ` +
        `${pct(frequencyDrop.high)} ou mais na frequência.`,
    },
    {
      level: 'CRITICAL',
      when: `${inactivity.critical} dias ou mais sem acesso.`,
    },
  ];
}

/** Conta de exemplo da receita em risco: valores plausíveis, soma calculada. */
const exemplo = {
  altoAlunos: 18,
  altoMensalidadeCentavos: 14900,
  criticoAlunos: 6,
  criticoMensalidadeCentavos: 18900,
};
const exemploAlto = exemplo.altoAlunos * exemplo.altoMensalidadeCentavos;
const exemploCritico = exemplo.criticoAlunos * exemplo.criticoMensalidadeCentavos;
const exemploTotal = exemploAlto + exemploCritico;
const exemploAlunos = exemplo.altoAlunos + exemplo.criticoAlunos;

function ContaLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="row row--between" style={{ gap: 16 }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  );
}

/* -------------------------------------------------------------- Página */

export function AboutPage() {
  const [config, setConfig] = useState<MetricsConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .config()
      .then((res) => {
        if (alive) setConfig(res);
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
        }
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <>
        <PageHeader title="Sobre" />
        <EmptyState
          title="Não foi possível carregar as regras em vigor"
          description={error}
          action={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Tentar novamente
            </button>
          }
        />
      </>
    );
  }
  if (!config) return <PageLoading />;

  const { risk, alerts } = config;
  const [primeiraFaixa, segundaFaixa, terceiraFaixa] = alerts.inactivityDays;
  const quedaAlerta = pct(alerts.frequencyDrop);

  return (
    <>
      <PageHeader
        title="Sobre"
        subtitle="Como cada número desta plataforma é calculado e o que fazer com ele"
      />

      <div className="stack" style={{ gap: 16, maxWidth: 880 }}>
        <Card
          title="O que é o GymVis"
          subtitle="Uma camada de análise sobre os dados que a academia já tem"
        >
          <Prose>
            <P>
              A academia já registra tudo o que interessa: quem se matriculou, quanto paga e quem
              passou pela catraca hoje. O que costuma faltar é tempo para olhar esse histórico e
              perceber, a tempo, que um aluno parou de aparecer. O GymVis lê esses registros e
              responde a quatro perguntas: quantos alunos você tem, quem está sumindo, quanto de
              receita depende dessas pessoas e quanto de cada turma de entrada continua com você.
            </P>
            <P>Para deixar claro o que ele não faz:</P>
            <ul style={listStyle}>
              <li>
                não controla a catraca nem se comunica com ela — a catraca continua sendo do sistema
                que a academia já usa;
              </li>
              <li>não usa biometria nem reconhecimento facial;</li>
              <li>não guarda foto, vídeo ou imagem de ninguém;</li>
              <li>
                não faz cobrança, não envia mensagem para o aluno e não altera nada no seu cadastro.
              </li>
            </ul>
            <P>
              Ele apenas lê os eventos de acesso já registrados e os transforma em indicadores. É
              uma ferramenta de leitura, não de operação.
            </P>
          </Prose>
        </Card>

        <Card
          title="De onde vêm os dados"
          subtitle="Uma única fonte de verdade: a entrada na catraca"
        >
          <Prose>
            <P>
              Hoje os dados chegam por importação para um banco local, no próprio computador em que
              o sistema roda: o cadastro dos alunos (entrada, saída, plano, mensalidade, status) e o
              histórico de acessos. Nada é enviado para serviços externos.
            </P>
            <P>
              A fonte de verdade da frequência é o evento de entrada na catraca. Eventos de saída
              ficam armazenados, mas nenhum indicador os utiliza: para saber se o aluno está
              treinando, basta saber que ele entrou.
            </P>
            <P>
              Nenhuma métrica é digitada nem guardada pronta. Frequência, risco, receita em risco e
              retenção são recalculados a cada consulta, a partir dos eventos brutos. Na prática:
              importou um acesso novo, a tela seguinte já considera esse acesso, e não existe
              número desatualizado esperando alguém apertar um botão de atualizar.
            </P>
          </Prose>
        </Card>

        <Card
          title="Como lemos a frequência"
          subtitle="Duas janelas de tempo e a comparação entre elas"
        >
          <Prose>
            <P>
              Frequência aqui é sempre acessos por semana, para que alunos com tempos de casa
              diferentes possam ser comparados.
            </P>
            <ul style={listStyle}>
              <li>
                <strong>Frequência recente</strong> — acessos dos últimos {risk.recentWindowDays}{' '}
                dias divididos por {weeksFromDays(risk.recentWindowDays)}.
              </li>
              <li>
                <strong>Frequência histórica</strong> — a janela anterior a essa, de até{' '}
                {risk.baselineWindowDays} dias (cerca de {Math.round(risk.baselineWindowDays / 30)}{' '}
                meses), também dividida por semana. É o ritmo normal do aluno, o que ele fazia antes.
              </li>
              <li>
                <strong>Variação</strong> — quanto a recente subiu ou caiu em relação à histórica.
              </li>
            </ul>
            <P>
              Exemplo: um aluno que costumava vir 3,8x por semana e, nas últimas{' '}
              {weeksFromDays(risk.recentWindowDays)}, veio 1,9x por semana tem variação de −50%.
              Continua aparecendo, mas na metade do ritmo de antes.
            </P>
            <P className="muted">
              Quem tem pouco tempo de casa não tem histórico com que comparar. A frequência
              histórica só é calculada quando existem ao menos {risk.minBaselineWeeks} semanas de
              dados antes da janela recente; sem isso, a variação aparece como um traço na lista de
              alunos.
            </P>
          </Prose>
        </Card>

        <Card
          title="Classificação de risco"
          subtitle="Quatro níveis, regras fixas, sem inteligência artificial"
        >
          <Prose>
            <P>
              Cada aluno matriculado recebe um nível de risco de evasão, pela tabela abaixo. Quando
              o aluno se encaixa em mais de uma linha, vale sempre a mais grave.
            </P>
          </Prose>

          <div className="table-wrap mt-12">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nível</th>
                  <th>Quando acontece</th>
                </tr>
              </thead>
              <tbody>
                {riskRows(risk).map((row) => (
                  <tr key={row.level}>
                    <td>
                      <RiskBadge risk={row.level} />
                    </td>
                    <td style={cellWrap}>{row.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Prose>
            <ul style={listStyle}>
              <li>
                Alunos <strong>cancelados</strong> e <strong>pausados</strong> não recebem
                classificação: quem já saiu ou trancou não está em risco de sair. Na lista, a coluna
                Risco aparece com um traço.
              </li>
              <li>
                A queda de frequência só conta para quem tinha rotina — exige histórico de ao menos{' '}
                {fmtFreq(risk.minBaselineWeeklyForDrop)}. Cair de 0,5x para 0,2x por semana não diz
                nada; cair de 4x para 1x diz muito.
              </li>
              <li>
                Quem nunca passou pela catraca é contado desde a data de matrícula. Um aluno
                matriculado há {risk.inactivity.critical} dias que nunca apareceu entra como
                crítico, e com razão.
              </li>
            </ul>
            <P>
              Não há modelo estatístico nem inteligência artificial por trás disso. São contas de
              somar e comparar, auditáveis uma a uma: o perfil de cada aluno mostra exatamente quais
              condições ele atendeu para estar naquele nível.
            </P>
          </Prose>
        </Card>

        <Card
          title="Receita em risco"
          subtitle="Quanto da mensalidade do mês depende de quem está sumindo"
        >
          <Prose>
            <P>O cálculo tem três passos:</P>
            <ol style={listStyle}>
              <li>separa os alunos matriculados, isto é, ativos e inadimplentes;</li>
              <li>
                fica com os classificados como risco <strong>alto</strong> ou{' '}
                <strong>crítico</strong>;
              </li>
              <li>soma a mensalidade de cada um deles.</li>
            </ol>
          </Prose>

          <div
            style={{
              ...prose,
              marginTop: 12,
              padding: '12px 14px',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div className="muted small">Exemplo</div>
            <ContaLinha
              label={`${fmtInt(exemplo.altoAlunos)} alunos em risco alto × ${fmtCurrency(
                exemplo.altoMensalidadeCentavos,
              )}`}
              valor={fmtCurrency(exemploAlto)}
            />
            <ContaLinha
              label={`${fmtInt(exemplo.criticoAlunos)} alunos em risco crítico × ${fmtCurrency(
                exemplo.criticoMensalidadeCentavos,
              )}`}
              valor={fmtCurrency(exemploCritico)}
            />
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, fontWeight: 570 }}>
              <ContaLinha label="Receita em risco no mês" valor={fmtCurrency(exemploTotal)} />
            </div>
          </div>

          <Note>
            <strong>É uma estimativa do que está em jogo, não dinheiro perdido.</strong> Nenhum
            desses alunos cancelou: todos continuam matriculados. O número responde a uma pergunta
            de cenário — quanto da receita do mês depende de gente que parou de aparecer, caso nada
            seja feito. Aluno em risco volta, e é justamente para isso que a lista existe.
          </Note>

          <Prose>
            <P>
              A utilidade é a tradução. {fmtInt(exemploAlunos)} alunos sumindo é um número fácil de
              adiar para a semana que vem. Os mesmos {fmtInt(exemploAlunos)} alunos escritos como{' '}
              {fmtCurrency(exemploTotal)} por mês entram na conversa em que as decisões são
              tomadas, e permitem comparar o custo de agir — uma tarde de ligações, uma aula
              experimental de volta, um desconto pontual — com o que está em jogo.
            </P>
            <P className="muted">
              O painel mostra ainda a receita mensal total dos matriculados, para dar proporção:
              risco de 5% da receita e risco de 30% pedem respostas diferentes.
            </P>
          </Prose>
        </Card>

        <Card
          title="Alertas e o que fazer com eles"
          subtitle="Quatro filas de trabalho, da mais recente à mais grave"
        >
          <Prose>
            <P>
              Os alertas do painel recortam os alunos matriculados em faixas de abandono. As faixas
              de dias são exclusivas: cada aluno aparece em uma só, a mais grave que ele atende.
            </P>
            <ul style={listStyle}>
              <li>
                <strong>
                  Sem acesso há {primeiraFaixa}–{segundaFaixa - 1} dias
                </strong>{' '}
                — quebra de rotina recente. Costuma ser viagem, virada no trabalho ou uma semana
                ruim. Uma mensagem curta, sem cobrança, resolve boa parte dos casos.
              </li>
              <li>
                <strong>
                  Sem acesso há {segundaFaixa}–{terceiraFaixa - 1} dias
                </strong>{' '}
                — o hábito se desfez. Aqui uma mensagem genérica raramente funciona: vale um convite
                concreto, com horário e nome de professor.
              </li>
              <li>
                <strong>Sem acesso há {terceiraFaixa} dias ou mais</strong> — na prática o aluno já
                saiu, só não formalizou. Merece contato direto de quem responde pela academia, com o
                objetivo de entender o motivo antes de oferecer qualquer coisa. É também a fila que
                mais pesa na receita em risco.
              </li>
              <li>
                <strong>Queda de frequência de {quedaAlerta} ou mais</strong> — o aluno ainda vem,
                mas bem menos do que costumava. É o alerta mais barato de atender, porque ele ainda
                está por perto. Só entram alunos com histórico de ao menos{' '}
                {fmtFreq(alerts.minBaselineWeekly)}, para não confundir quem nunca teve rotina com
                quem perdeu a sua.
              </li>
            </ul>
            <P>
              Cada alerta do painel é clicável e abre a lista de alunos já filtrada por aquela
              faixa, com nome, telefone, último acesso e mensalidade. A ideia é sair do número e
              chegar à lista de quem ligar hoje.
            </P>
            <P className="muted">
              Regra prática: trate as faixas de cima para baixo em esforço, e de baixo para cima em
              urgência. Quanto mais cedo o contato, menor o esforço para trazer o aluno de volta.
            </P>
          </Prose>
        </Card>

        <Card title="Retenção por coortes" subtitle="Como se comporta cada turma de entrada">
          <Prose>
            <P>
              Coorte, aqui, é turma de entrada: todos os alunos que se matricularam no mesmo mês.
              Cada linha da tabela acompanha uma dessas turmas mês a mês, e cada coluna diz quanto
              dela ainda estava matriculada depois de tantos meses.
            </P>
            <P>
              Exemplo: dos 40 alunos que entraram em março, 28 continuavam matriculados três meses
              depois. A célula do mês 3 dessa turma mostra 70%.
            </P>
            <P>
              O valor está na comparação entre linhas. Se todas as turmas caem para perto da metade
              no terceiro mês, o problema não é de captação — é de segurar o aluno, e o trabalho
              está nas primeiras semanas de treino. Se uma turma específica destoa, vale olhar o que
              foi feito naquele mês: uma promoção que trouxe gente errada, uma mudança de horário,
              uma troca de professor.
            </P>
            <P className="muted">
              A conta usa apenas as datas de entrada e saída do cadastro, então alunos pausados
              contam como retidos enquanto não registram saída.
            </P>
          </Prose>
        </Card>

        <Card
          title="Definições que costumam confundir"
          subtitle="Por que dois números parecidos podem não bater"
        >
          <Prose>
            <ul style={listStyle}>
              <li>
                <strong>Matriculado</strong> é ativo mais inadimplente. Quem está devendo continua
                sendo seu aluno, continua treinando e continua contando na receita em risco. Só sai
                da conta quem cancela ou pausa.
              </li>
              <li>
                <strong>Evolução do plantel</strong> reconstrói o passado pelas datas de entrada e
                saída, porque o cadastro guarda o status atual do aluno, não o histórico dele.
                Alunos pausados não têm data de saída, então entram nessa contagem — por isso o
                último ponto do gráfico costuma ficar acima do indicador Alunos ativos. Os dois
                estão certos; medem coisas diferentes.
              </li>
              <li>
                <strong>Gráficos semanais</strong> mostram apenas semanas fechadas. A semana em
                curso, contada na terça-feira, apareceria como um desabamento de frequência que não
                aconteceu.
              </li>
              <li>
                <strong>Dias sem acesso</strong> conta dias de calendário, não horas. Um acesso
                ontem às 22h é "há 1 dia", mesmo que tenham se passado poucas horas.
              </li>
            </ul>
          </Prose>
        </Card>

        <Card
          title="Privacidade e limites"
          subtitle="O que o sistema guarda e o que pode ser ajustado"
        >
          <Prose>
            <P>
              O GymVis trabalha apenas com dados de cadastro e de acesso: nome, contato, plano,
              mensalidade, datas de entrada e saída e a lista de horários em que o aluno passou pela
              catraca. Não há biometria, imagem ou qualquer dado de saúde, e nada é enviado para
              fora do sistema.
            </P>
            <P>
              Os limiares desta página não são leis. Dias sem acesso, percentuais de queda e faixas
              de alerta ficam centralizados na configuração do servidor e podem ser ajustados por
              quem instala o sistema, para refletir a realidade da academia — uma modalidade de duas
              vezes por semana não se comporta como uma de cinco. Alterado o ajuste, os números
              desta página acompanham.
            </P>
          </Prose>
        </Card>
      </div>
    </>
  );
}
