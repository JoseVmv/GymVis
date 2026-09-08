import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import painel from '../assets/painel.webp';
import rendimentosCelular from '../assets/rendimentos-celular.webp';
import retencao from '../assets/retencao.webp';

/**
 * Vitrine de quem ainda não entrou.
 *
 * O produto é o argumento: a tela real vem logo abaixo do título, em vez de
 * uma ilustração. E o título não promete nada — afirma o fato que o dono de
 * academia já viveu e do qual o GymVis é a consequência.
 */

const VALORES = [
  {
    termo: 'Quem está sumindo',
    texto:
      'Os alunos que continuam pagando e pararam de aparecer, do que está há mais tempo fora para o que acabou de escorregar.',
  },
  {
    termo: 'Quanto está em jogo',
    texto:
      'A soma das mensalidades que dependem de quem está em risco — o tamanho do problema em reais, não em porcentagem.',
  },
  {
    termo: 'De onde saiu o número',
    texto:
      'Todo indicador abre a lista que o formou, e cada limiar de risco é seu para ajustar. Nada é caixa-preta.',
  },
];

export function LandingPage() {
  return (
    <div className="lp">
      <header className="lp__topo">
        <div className="lp__marca">
          <Logo size={26} idSuffix="lp" />
          <span>GymVis</span>
        </div>
        <nav className="lp__topo-acoes">
          <Link to="/login" className="btn">
            Entrar
          </Link>
          <Link to="/register" className="btn btn--primary">
            Criar conta
          </Link>
        </nav>
      </header>

      <main>
        <section className="lp__hero">
          <div className="lp__hero-topo">
            <h1 className="lp__titulo">Todo aluno que cancela parou de vir antes.</h1>
            <div className="lp__hero-lado">
              <p className="lp__abertura">
                O GymVis lê os acessos que a catraca da sua academia já registra e mostra quem está
                sumindo enquanto ainda dá tempo de ligar.
              </p>
              <div className="lp__acoes">
                <Link to="/register" className="btn btn--primary btn--grande">
                  Criar conta da academia
                </Link>
                <Link to="/login" className="btn btn--grande">
                  Entrar
                </Link>
              </div>
              <p className="lp__nota">
                Prefere olhar antes? Entre com <strong>demo@gymvis.app</strong> e a senha{' '}
                <strong>demo1234</strong> para percorrer uma academia de exemplo.
              </p>
            </div>
          </div>

          <figure className="lp__tela lp__tela--larga">
            <img
              src={painel}
              width={1611}
              height={1124}
              alt="Painel do GymVis: R$ 10.626,30 de receita em risco ao lado da lista de alunos que pararam de aparecer, com os indicadores do mês e a distribuição de risco do plantel."
            />
          </figure>
        </section>

        <section className="lp__secao">
          <h2 className="lp__titulo-secao">O que você abre no primeiro café</h2>
          <ul className="lp__valores">
            {VALORES.map((v) => (
              <li key={v.termo}>
                <div className="lp__valor-termo">{v.termo}</div>
                <p className="lp__valor-texto">{v.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp__secao lp__par">
          <div className="lp__par-texto">
            <h2 className="lp__titulo-secao">A recepção, o escritório e a fila do banco</h2>
            <p className="lp__paragrafo">
              A mesma leitura no computador da academia e no celular, com a tela se reorganizando
              para o tamanho que estiver na sua frente. Abre no navegador: não há aplicativo para
              instalar nem versão para manter atualizada.
            </p>
            <p className="lp__paragrafo">
              O faturamento do mês, as despesas lançadas e o resultado ficam a um toque, entre uma
              aula e outra.
            </p>
          </div>
          <figure className="lp__tela lp__tela--celular">
            <img
              src={rendimentosCelular}
              width={800}
              height={1660}
              alt="GymVis no celular, na tela de rendimentos: faturamento, despesas, resultado e inadimplência do período, com o gráfico de faturamento mês a mês."
            />
          </figure>
        </section>

        <section className="lp__secao">
          <h2 className="lp__titulo-secao">Cada turma que entrou, mês a mês</h2>
          <p className="lp__paragrafo lp__paragrafo--centro">
            Quanto de cada turma continua matriculada depois de um mês, de seis, de um ano. É onde
            se enxerga o mês em que a sua academia costuma perder gente — e se o que você mudou na
            recepção surtiu efeito.
          </p>
          <figure className="lp__tela lp__tela--larga">
            <img
              src={retencao}
              width={1611}
              height={1230}
              alt="Mapa de retenção do GymVis: cada linha é um mês de entrada e cada coluna, os meses seguintes, com a porcentagem da turma ainda matriculada."
            />
          </figure>
        </section>

        <section className="lp__fechamento">
          <div>
            <h2 className="lp__titulo-fecho">Sua catraca já registra tudo isso hoje.</h2>
            <p className="lp__paragrafo">
              Falta ler. Crie a conta da sua academia — ela começa vazia, e o próprio painel gera
              dados de demonstração para você conhecer o produto antes de cadastrar o primeiro
              aluno.
            </p>
          </div>
          <div className="lp__acoes">
            <Link to="/register" className="btn btn--primary btn--grande">
              Criar conta da academia
            </Link>
            <Link to="/login" className="btn btn--grande">
              Já tenho conta
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp__rodape">
        <div className="lp__marca">
          <Logo size={20} idSuffix="rodape" />
          <span>GymVis</span>
        </div>
        <p>
          Lê o cadastro e os horários de entrada. Não controla a catraca, não usa biometria e não
          guarda fotos.
        </p>
      </footer>
    </div>
  );
}
