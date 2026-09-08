# GymVis

Camada de análise e inteligência sobre os dados que uma academia já possui.

A academia tem sua própria catraca e seu próprio sistema de gestão; o GymVis
não controla nem se comunica com equipamentos — ele lê os eventos de acesso já
registrados e responde às perguntas que importam para o dono:

- Quantos alunos estão ativos? Quantos estão entrando e saindo?
- Quem está deixando de frequentar? Quem está em risco de evasão?
- Quanto de receita mensal está potencialmente em risco?
- Como está a retenção das turmas de entrada?
- Quanto a academia faturou e quanto gastou no período?

Cada alerta do painel é clicável e abre a lista de alunos já filtrada por
aquele critério. A página **Sobre**, dentro do próprio app, explica ao dono da
academia como cada número é calculado.

## Telas

| Tela              | O que faz                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| **Visão geral**   | Indicadores do período, alertas clicáveis, receita em risco e gráficos |
| **Alunos**        | Listagem com filtros e busca, cadastro e edição manual                 |
| **Rendimentos**   | Faturamento estimado pelas mensalidades, despesas e resultado          |
| **Retenção**      | Coortes por mês de entrada e curva média                               |
| **Configurações** | Planos, promoções, limiares de risco e nome da academia                |
| **Sobre**         | Explicação do produto para o dono da academia                          |

Os dados ficam em um Postgres gerenciado no Supabase. Cada conta tem a sua
própria academia e nunca enxerga os dados de outra — o isolamento é feito na
consulta (todo SELECT filtra `academy_id`) e reforçado no banco por Row Level
Security.

## Requisitos

- Node.js 20+ (testado com Node 24)
- npm 10+
- Um projeto no Supabase

## Instalação

```bash
npm install
cp .env.example .env    # preencha a DATABASE_URL
```

A `DATABASE_URL` vem do painel do Supabase: botão **Connect** → aba
*Connection string* → **Transaction pooler** (porta 6543). O `.env` está no
`.gitignore` e nunca deve ser commitado; nenhuma chave do Supabase pode chegar
ao bundle do cliente.

> O npm 12 pode bloquear scripts de instalação nativos na primeira vez
> (`better-sqlite3`, usado só pelo importador, e `esbuild`). Se acontecer:
>
> ```bash
> npm install-scripts approve better-sqlite3
> npm install-scripts approve esbuild
> npm rebuild better-sqlite3 esbuild
> ```

## Criando as tabelas

```bash
npm run migrate
```

Aplica em ordem os arquivos de `server/migrations/`, registrando o que já
rodou em `schema_migrations`. Pode rodar quantas vezes quiser.

## Gerando dados

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

Cada conta criada pela tela de cadastro nasce com a própria academia, vazia, e
pode gerar os dados de exemplo pelo botão do painel.

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

O servidor abre as conexões com o banco ao subir, para o primeiro clique não
pagar o handshake TLS.

Separadamente, se preferir: `npm run dev:server` e `npm run dev:client`.

### Modo produção (um processo só)

```bash
npm run build    # typecheck + build do cliente
npm start        # serve API + interface em http://localhost:3001
```

## Estrutura do projeto

```
GymVis/
├── scripts/               # migração, importação e verificação
├── verificacao/           # linha de base das respostas da API
├── shared/                # contrato de tipos da API (somente tipos)
│   └── src/index.ts
├── server/                # API Node + Express + Postgres (postgres.js)
│   ├── migrations/        # SQL versionado, aplicado por npm run migrate
│   └── src/
│       ├── index.ts       # bootstrap do servidor
│       ├── db/            # pool de conexões e o schema declarativo (Drizzle)
│       ├── config/        # limiares de risco e de alertas, centralizados
│       ├── auth/          # senha (scrypt), sessão em cookie, rate limit
│       ├── services/      # métricas calculadas dos dados brutos
│       ├── http/          # rotas da API
│       └── seed/          # gerador de dados fictícios realistas
└── client/                # React + Vite + Recharts
    └── src/
        ├── pages/         # painel, alunos, rendimentos, retenção,
        │                  # configurações, sobre, login
        ├── components/    # UI base (cards, badges, tabelas, modais, formulários)
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
- **Risco de evasão** — os padrões de fábrica ficam em
  `server/src/config/risk.ts`, mas cada academia ajusta os limiares na tela de
  Configurações (guardados em `academy_settings`). Painel e página Sobre leem
  esses valores por `GET /api/config`, então mudar a regra muda também o texto
  exibido:
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
- **Faturamento**: soma das mensalidades de quem estava matriculado em cada
  mês. Não existe registro de pagamento, então é uma estimativa; alunos
  inadimplentes aparecem em coluna separada, porque foram cobrados mas o
  dinheiro não entrou. As despesas, essas sim, são lançadas e persistidas.
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

## Isolamento entre academias

Cada usuário pertence a uma academia e toda consulta filtra por `academy_id`.
Além disso, as nove tabelas têm **RLS ligado sem nenhuma policy permissiva**:
o Supabase publica toda tabela pela API REST, e sem RLS a chave `anon` — que é
pública — leria o cadastro e a frequência de todos os alunos. O servidor
conecta pelo papel do banco, que não passa por RLS, então o RLS funciona como
segunda linha de defesa na borda pública.

Para conferir a qualquer momento:

```bash
npm run verificar:isolamento
```

O teste cria duas sessões de donos diferentes e verifica que nenhuma enxerga,
edita ou apaga aluno da outra.

## Verificando a migração

A migração do SQLite foi feita com uma rede de segurança que continua no
repositório:

```bash
npm run baseline          # captura as respostas de todas as rotas
npm run baseline:diff     # compara com a linha de base do SQLite
npm run verificar:dados       # compara linha a linha SQLite x Postgres
npm run verificar:agregacoes  # compara as agregações com instante fixo
```

Diferenças esperadas: as janelas móveis (últimos 7/30/90 dias, últimas 4
semanas) andam com o relógio, então contagens de acesso mudam entre capturas
feitas em horas diferentes. A ordem dos alunos também mudou de propósito — o
SQLite comparava bytes e o Postgres usa a collation pt-BR, em que "Jéssica"
vem antes de "Juliana", como um leitor brasileiro espera.

## Preparado para o futuro

- **Camada de dados**: as consultas são SQL cru via `postgres.js`, e
  `server/src/db/schema.ts` mantém o schema declarativo em Drizzle como
  espelho tipado do DDL. Dinheiro em centavos, instantes em epoch ms
  (`bigint`) e datas de calendário em texto `YYYY-MM-DD`.
- **Autenticação**: continua própria (scrypt + tabela `sessions`). Trocar por
  Supabase Auth é uma fase à parte, que não depende do resto.
- **Novas fontes de dados**: o gerador escreve nas mesmas tabelas que um
  futuro importador CSV/API/webhook escreveria; nenhuma métrica depende de
  como o dado entrou.
- **Multi-academia**: todas as entidades já carregam `academy_id` e todas as
  consultas filtram por ele.

## Limitações conhecidas (por escolha, nesta versão)

- Sem integrações externas, sem controle de catraca, sem biometria.
- O aplicativo agora depende de rede: não funciona offline.
- O projeto está na região `us-east-1`; para academias brasileiras, uma região
  na América do Sul reduziria pela metade os ~145 ms de ida e volta ao banco.
- Sem machine learning — as regras de risco são fixas e transparentes.
- Autenticação simples (sem recuperação de senha, sem convites de equipe).
- `POST /api/demo-data` gera ~135 mil eventos e leva cerca de 50 segundos.
  Aceitável aqui (cada academia só pode gerar uma vez, e há limite de
  cadastros por IP); num servidor com muitos usuários, mova essa geração para
  um worker ou uma fila.
- As métricas por aluno ficam em cache por 15 segundos, invalidado a cada
  escrita. Sem isso, o painel recalcularia o mesmo conjunto quatro vezes por
  carregamento, uma vez para cada rota que ele consulta em paralelo.
- O banco guarda o status atual do aluno, não seu histórico. Por isso as séries
  mensais reconstroem o plantel pelas datas de entrada e saída, o que inclui
  alunos pausados — daí o gráfico se chamar "Evolução do plantel" e não repetir
  o número do indicador "Alunos ativos".
