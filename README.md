# GymVis

Camada de análise e inteligência sobre os dados que uma academia já possui.

A academia tem sua própria catraca e seu próprio sistema de gestão; o GymVis
não controla nem se comunica com equipamentos — ele lê os eventos de acesso já
registrados e responde às perguntas que importam para o dono:

- Quantos alunos estão ativos? Quantos estão entrando e saindo?
- Quem está deixando de frequentar? Quem está em risco de evasão?
- Quanto de receita mensal está potencialmente em risco?
- Como está a retenção das turmas de entrada?

Cada alerta do painel é clicável e abre a lista de alunos já filtrada por
aquele critério. A página **Sobre**, dentro do próprio app, explica ao dono da
academia como cada número é calculado.

Este é um protótipo local: todos os dados ficam em um banco SQLite dentro do
projeto e nada depende de APIs externas.

## Requisitos

- Node.js 20+ (testado com Node 24)
- npm 10+

## Instalação

```bash
npm install
```

> O npm 12 pode bloquear os scripts de instalação nativos na primeira vez
> (`better-sqlite3` e `esbuild`). Se isso acontecer, aprove-os e reconstrua:
>
> ```bash
> npm install-scripts approve better-sqlite3
> npm install-scripts approve esbuild
> npm rebuild better-sqlite3 esbuild
> ```

## Criando o banco e gerando dados

O banco (`data/gym.db`) é criado automaticamente na primeira execução.
Para popular com uma academia simulada realista:

```bash
npm run seed
```

Parâmetros opcionais:

```bash
npm run seed -- --students 1200 --months 12 --seed 42
```

| Parâmetro    | Padrão | Descrição                                    |
| ------------ | ------ | -------------------------------------------- |
| `--students` | 800    | Total de alunos gerados ao longo do histórico|
| `--months`   | 12     | Meses de histórico de acessos                |
| `--seed`     | 42     | Semente do gerador (mesma seed = mesmo banco)|

O seed é idempotente: rodar de novo recria a academia de demonstração.

Os dados simulam comportamento de academia real, não sorteios uniformes:
sazonalidade de matrículas (janeiro em alta, dezembro em baixa), horários de
pico pela manhã e à noite, arquétipos de frequência, alunos em queda e alunos
que sumiram. O status do aluno é derivado do **compromisso do plano** e do
tempo que ele está sem aparecer: quem some no plano Mensal vira inadimplente
ou cancela na virada da cobrança, enquanto quem já pagou um plano Anual pode
ficar semanas ausente e continuar ativo — que é justamente o alerta mais
valioso para o dono. O seed valida essas invariantes e falha se forem
violadas.

**Conta de demonstração criada pelo seed:**

- E-mail: `demo@gymvis.app`
- Senha: `demo1234`

Também é possível criar sua própria conta na tela de cadastro — uma academia
recém-criada oferece um botão para gerar dados de demonstração direto do painel.

## Executando

Backend e frontend juntos (recomendado em desenvolvimento):

```bash
npm run dev
```

- API: http://localhost:3001
- Interface: http://localhost:5173

Separadamente, se preferir: `npm run dev:server` e `npm run dev:client`.

### Modo produção (um processo só)

```bash
npm run build    # typecheck + build do cliente
npm start        # serve API + interface em http://localhost:3001
```

## Estrutura do projeto

```
GymVis/
├── data/                  # banco SQLite local (gym.db)
├── shared/                # contrato de tipos da API (somente tipos)
│   └── src/index.ts
├── server/                # API Node + Express + better-sqlite3
│   └── src/
│       ├── index.ts       # bootstrap do servidor
│       ├── db/            # conexão + DDL, e o schema declarativo (Drizzle)
│       ├── config/        # limiares de risco e de alertas, centralizados
│       ├── auth/          # senha (scrypt), sessão em cookie, rate limit
│       ├── services/      # métricas calculadas dos dados brutos
│       ├── http/          # rotas da API
│       └── seed/          # gerador de dados fictícios realistas
└── client/                # React + Vite + Recharts
    └── src/
        ├── pages/         # dashboard, alunos, perfil, retenção, sobre, login
        ├── components/    # UI base (cards, badges, tabelas, shell)
        ├── charts/        # wrappers de gráfico padronizados
        ├── api/           # cliente HTTP tipado
        ├── auth/          # contexto de autenticação
        └── theme/         # design system (CSS)
```

## Como as métricas são calculadas

Os eventos de acesso são a fonte de verdade — frequência, risco e receita em
risco são sempre derivados deles em tempo de consulta, nunca armazenados.
Apenas eventos de entrada alimentam as métricas (as saídas ficam registradas,
mas nenhum indicador as utiliza).

- **Frequência recente**: acessos das últimas 4 semanas ÷ 4.
- **Frequência histórica (baseline)**: acessos da janela anterior às últimas
  4 semanas (até 180 dias), normalizados por semana. Exige ao menos 2 semanas
  de histórico.
- **Variação**: (recente − histórica) ÷ histórica.
- **Dias sem acesso**: contados em dias de calendário — um acesso ontem à
  noite é "há 1 dia", não "hoje".
- **Risco de evasão** (regras transparentes em `server/src/config/risk.ts`;
  as faixas dos alertas do painel ficam em `server/src/config/alerts.ts`.
  Ambas chegam à interface por `GET /api/config`, então o painel e a página
  Sobre escrevem seus rótulos a partir dos limiares reais — mudou o arquivo
  de configuração, mudou o texto na tela):
  - `LOW` — comportamento normal;
  - `MEDIUM` — 7+ dias sem acesso ou queda de frequência ≥ 30%;
  - `HIGH` — 10+ dias sem acesso ou queda ≥ 50%;
  - `CRITICAL` — 30+ dias sem acesso.
  - Alunos pausados e cancelados não recebem classificação.
- **Receita em risco**: soma das mensalidades dos alunos matriculados com
  risco `HIGH` ou `CRITICAL`. É uma estimativa, não dinheiro perdido.
- **Retenção**: coortes por mês de entrada; célula `i` = fração da turma ainda
  matriculada `i` meses após a entrada.
- **Frequência média do período**: cada janela é dividida pela base
  matriculada vigente nela — usar o plantel de hoje nas duas faria a
  comparação esconder metade da queda numa academia em crescimento.
- **Gráficos semanais**: mostram apenas semanas fechadas. A semana em curso
  apareceria como um colapso de frequência que ainda não aconteceu.

## Autenticação

Login e cadastro rudimentares para donos de academia: senha com hash `scrypt`
(node:crypto, com salt e comparação em tempo constante) e sessão em cookie
`httpOnly`. Cada usuário pertence a uma academia e todas as consultas são
isoladas por `academy_id`.

Há também um limitador de tentativas em memória (10 logins por conta a cada
15 minutos, 5 cadastros por hora por IP) e as sessões vencidas são removidas
automaticamente. Ao hospedar de verdade, sirva por HTTPS e acrescente a flag
`secure` ao cookie em `server/src/auth/session.ts`.

## Preparado para o futuro

- **SQLite → PostgreSQL/Supabase**: as consultas são SQL cru via
  `better-sqlite3` (síncrono e direto, adequado ao tamanho deste MVP), e
  `server/src/db/schema.ts` mantém o schema declarativo em Drizzle como
  espelho tipado do DDL e ponto de partida da migração. Os tipos já são
  portáveis (inteiros, epoch ms, datas `YYYY-MM-DD`, dinheiro em centavos).
  Migrar envolve trocar o dialeto do Drizzle e reescrever as agregações dos
  serviços — são poucas e estão concentradas em `server/src/services/`. A
  autenticação por sessão pode dar lugar ao Supabase Auth sem tocar no resto.
- **Novas fontes de dados**: o gerador escreve nas mesmas tabelas que um
  futuro importador CSV/API/webhook escreveria; nenhuma métrica depende de
  como o dado entrou.
- **Multi-academia**: todas as entidades já carregam `academy_id` e todas as
  consultas filtram por ele.

## Limitações conhecidas (por escolha, nesta versão)

- Sem integrações externas, sem controle de catraca, sem biometria.
- Sem machine learning — as regras de risco são fixas e transparentes.
- Autenticação simples (sem recuperação de senha, sem convites de equipe).
- `POST /api/demo-data` gera ~130 mil eventos de forma síncrona e segura o
  processo por alguns segundos. Aceitável aqui (cada academia só pode gerar
  uma vez, e há limite de cadastros por IP); num servidor com muitos usuários,
  mova essa geração para um worker ou uma fila.
- O banco guarda o status atual do aluno, não seu histórico. Por isso as séries
  mensais reconstroem o plantel pelas datas de entrada e saída, o que inclui
  alunos pausados — daí o gráfico se chamar "Evolução do plantel" e não repetir
  o número do indicador "Alunos ativos".
