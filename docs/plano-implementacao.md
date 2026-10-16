# Plano de implementação · Guerra de Clusters

> Versão 1 · 16/10/2026 · validado contra `02-escopo.md` (RF1–RF9, RNF1–RNF8, critérios de aceite).
> Orçamento de tempo real: ~13 h até o evento (≈4 h/semana). Tudo abaixo cabe nisso porque **não há servidor, fila, agendador nem framework** — e porque cada incremento termina com algo jogável no celular.

---

## 1. Veredito sobre a arquitetura

**Mantenho CloudFront → S3 + API Gateway (HTTP API) → Lambda → DynamoDB.** É a menor pilha que cumpre os RNFs, nenhuma peça é cobrada por hora e cada caixinha corresponde a um tópico da aula do professor. Avaliei e descartei:

| Alternativa | Por que não |
|---|---|
| WebSocket (API GW WebSocket / AppSync) | Mais peças e estado de conexão; polling a 1 s atende RNF2 para 150 celulares. Já está fora de escopo. |
| Lambda Function URL sem API Gateway | Mais barato, mas perde o limite de taxa (RNF4) e a "caixinha API" da revelação. |
| AWS WAF para limitar por IP | Cobrado por mês/regra (rateado por hora) — fere a regra de custo. Limite por jogador vai para a Lambda. |
| Várias Lambdas (uma por rota) | Mais cold starts e mais template. Uma função com roteador interno basta. |
| CDK | Ver D4: bootstrap + compilação para um projeto de ~6 recursos. |

### O que muda em relação ao `03-arquitetura.md`

1. **O estado da rodada é derivado do relógio do servidor, não de um agendador.** "Iniciar" grava `iniciaEm = agora + 5 s` e `terminaEm = iniciaEm + 45 s`. Qualquer leitura calcula `aguardando → contagem → jogando → encerrada` comparando com `Date.now()`. Não existe EventBridge, cron nem "processo que encerra a rodada": aos 45 s ela simplesmente está encerrada (RF5) e `puxar` passa a recusar (critério "toques após o fim são ignorados").
2. **A largada tem 5 s, não 3.** Com polling de 1 s, um celular pode levar até ~1,5 s para perceber a largada; os 2 s extras garantem que todos vejam o 3‑2‑1 inteiro.
3. **`POST /api/puxar` devolve o estado.** Durante o jogo o celular não precisa fazer polling — 1 requisição por segundo faz tudo. Isso corta pela metade o tráfego no pico.
4. **`GET /api/estado` é cacheado 1 s no CloudFront** (só para jogadores). 150 celulares aguardando viram ~1 req/s por ponto de presença na origem. O telão usa `?telao=1`, sem cache, para manter atraso < 1 s (RNF2). O pico da revelação continua aparecendo, porque `puxar` nunca é cacheado.
5. **Envio idempotente com número de sequência.** Cada lote leva `seq` crescente; o servidor só aceita `seq` maior que o último. O celular pode reenviar um lote que falhou no 4G sem contar em dobro — é o que segura o critério de perda < 1 %.
6. **Antitrapaça na Lambda, não no API Gateway.** HTTP API só tem limite global/por rota (sem plano de uso por cliente). Por jogador: máx. 25 toques por lote e intervalo mínimo de 400 ms entre lotes, via escrita condicional no DynamoDB. O API Gateway fica com o teto global (proteção contra abuso, não contra o colega empolgado).
7. **CloudFront com `PriceClass_All`.** `PriceClass_100` exclui os pontos de presença da América do Sul — o 4G de São Luís iria até os EUA.
8. **Duas pilhas: `guerra-dev` e `guerra-evento`.** O domínio `dxxxx.cloudfront.net` muda se a distribuição for apagada. O teste "deploy → delete → deploy" roda só na `dev`; a `evento` nasce cedo e **não é removida até 05/11**, então o QR nunca quebra.
9. **Orçamento em pilha separada** (`infra/orcamento.yaml`), criada antes de tudo e que não some com `remover`. Alertas configurados **sem descontar créditos** — senão o gasto aparece como US$ 0 e o alerta nunca dispara.

---

## 2. Arquitetura final

```
 Celular (jogar)      Notebook (telão)       Admin
        └──────────── HTTPS ─┬────────────────┘
                             ▼
     CloudFront (PriceClass_All, 1 endereço, sem CORS)
        ├── /*        → S3 privado (OAC): index.html, telao.html, admin.html
        └── /api/*    → API Gateway HTTP API  (throttling por rota)  [sa-east-1]
                             ▼
                        Lambda "api" (Node.js, arm64, roteador interno)  [sa-east-1]
                             ▼
                        DynamoDB on-demand, 1 tabela, TTL  [sa-east-1]

 CloudWatch: logs JSON (retenção 14 d) + painel "Guerra" (invocações, req/s)
 AWS Budgets (pilha à parte): alertas US$ 1 e US$ 5, sem créditos
```

### Contrato da API

| Rota | Quem | Faz |
|---|---|---|
| `POST /api/entrar` | jogador | Contador atômico do evento: ímpar → Laranja, par → Verde (equilíbrio perfeito, D2a). Retorna `eventoId`, `jogadorId` (UUID), `equipe` |
| `GET /api/estado` | jogador (cache 1 s) / telão (`?telao=1`, sem cache) | `status`, `iniciaEm`, `terminaEm`, `agoraServidor`, totais, ativos e participantes por equipe, `posicaoCorda`, resultado e pico quando encerrada |
| `POST /api/puxar` | jogador | `{ rodadaId, jogadorId, equipe, seq, toques }` → aceita só em `jogando` (tolerância de 1 s de rede após o fim); responde com o estado |
| `POST /api/admin/rodada` | admin | Nova rodada (`aguardando`) — serve para revanche (RF7) |
| `POST /api/admin/iniciar` | admin | Grava `iniciaEm`/`terminaEm` |
| `POST /api/admin/encerrar` | admin | Encerra antes do tempo (`terminaEm = agora`) |
| `POST /api/admin/novo-evento` | admin | "Zerar": novo `eventoId`, participantes do zero; rodadas antigas ficam guardadas |
| `GET /api/admin/resumo` | admin | Todas as rodadas (JSON; o admin.html baixa também em CSV) — RF8 |

Admin autenticado por header `x-admin-token` comparado com variável de ambiente vinda de parâmetro `NoEcho` do deploy (nada no repositório).

### Modelo de dados (uma tabela, `PK`/`SK`)

| PK | SK | Atributos |
|---|---|---|
| `ATUAL` | `ATUAL` | `eventoId`, `rodadaId` |
| `EVENTO#<id>` | `META` | `entradas` (contador atômico), `participantesLaranja`, `participantesVerde` |
| `RODADA#<id>` | `META` | `eventoId`, `criadaEm`, `iniciaEm`, `terminaEm` |
| `RODADA#<id>` | `EQUIPE#laranja` / `EQUIPE#verde` | `toques`, `ativos` (`ADD` atômico) |
| `RODADA#<id>` | `SEG#<epoch>` | `requisicoes` → pico de req/s; `expira` (TTL 30 d) |
| `RODADA#<id>` | `JOG#<jogadorId>` | `ultimoSeq`, `ultimoMs`, `toques`; `expira` (TTL 30 d) |

**Uma chamada de `puxar` = 1 leitura + 3 escritas** (jogador condicional → equipe → segundo). Com 150 celulares: ~75 escritas/s em cada item de equipe e ~150/s no item do segundo — abaixo do limite de 1.000/s por item. Se fosse 1 requisição por toque (~12 toques/s × 75), cada item de equipe receberia ~900/s, colado no limite. **Esse é o número para a revelação e para o artigo.**

### Corda e vencedora (D5 — decidido em 16/10)

```
mL = toquesLaranja / max(ativosLaranja, 1)      mV = idem para Verde
posicaoCorda = mL / (mL + mV)                   (0,5 = centro; 0,5 também quando ninguém tocou)
```
Média por jogador **ativo** (quem tocou ao menos uma vez): quem escaneou e não jogou não pune a equipe. Com equipes equilibradas pela D2, o resultado é praticamente igual à diferença absoluta — só faz diferença se as equipes ficarem desiguais. A vencedora sai da mesma métrica que move a corda; o telão mostra também os totais brutos.

---

## 3. Estrutura do repositório

```
template.yaml            # SAM: tabela, função, HTTP API, S3, CloudFront, log group, painel CloudWatch
infra/orcamento.yaml     # AWS Budgets (pilha separada, criada 1 vez)
samconfig.toml           # (ignorado no git) ambientes dev e evento
api/                     # Lambda: index.mjs (roteador), rodada.mjs, puxar.mjs, admin.mjs, dados.mjs
api/test/                # node:test, sem dependências
web/                     # index.html (jogar), telao.html, admin.html, comum.js, estilo.css, qr.png
scripts/deploy.mjs       # sam deploy + s3 sync + invalidação + imprime URL   → npm run deploy -- dev|evento
scripts/remover.mjs      # esvazia bucket + sam delete                         → npm run remover -- dev
carga/simular.mjs        # N jogadores virtuais; compara toques enviados × contados
docs/decisoes.md         # registro de decisões (data, decisão, motivo)
```

- **Lambda em Node.js 24 (`nodejs24.x`), arm64, 1024 MB:** o SDK v3 já vem no runtime → sem `node_modules` na função e sem etapa de build. 1024 MB = mais CPU = latência menor = menos concorrência no pico.
- **Front sem framework:** HTML + CSS + ~200 linhas de JS por página; toque em `pointerdown`, `touch-action: manipulation` (sem zoom de duplo toque), alvo do botão ocupando ~60 % da tela. Página do jogador < 30 KB → abre em 4G bem abaixo de 3 s (RNF3).
- **Scripts em Node, não em bash:** rodam igual no Windows de qualquer membro do Core Team.

---

## 4. Incrementos (batendo com `05-cronograma.md`)

### I0 · Ambiente — até 18/10 · ~2 h
- [ ] Perfil `guerra` no AWS CLI (usuário só com permissões do projeto); SAM CLI; Node 24.
- [ ] **Verificar a cota de concorrência da Lambda em `sa-east-1`:** `aws lambda get-account-settings --region sa-east-1 --profile guerra`. Contas novas recebem cota reduzida (a AWS aumenta conforme o uso). O pico estimado é ~10–15 execuções simultâneas; **se a cota estiver abaixo de 100, pedir aumento no Service Quotas hoje** — pode levar dias.
- [ ] Deploy de `infra/orcamento.yaml` (US$ 1 e US$ 5, real, sem créditos, e-mail do Eliseu + 1 pessoa).
- [ ] Repositório no GitLab; MCPs conferidos com `/mcp`.
- [ ] D1 (endereço) registrada em `docs/decisoes.md` — D2–D5 já fechadas em 16/10.
- **Demonstrável:** orçamento visível no console; cota conferida.

### I1 · Esqueleto no ar — 19 a 21/10 · ~2 h
- [ ] `template.yaml` completo em infraestrutura (tabela, função, API, bucket, CloudFront), com tags `projeto=guerra-de-clusters`.
- [ ] Lambda respondendo `GET /api/estado` (stub) e página "Guerra de Clusters" no S3.
- [ ] `npm run deploy -- dev` e `npm run remover -- dev` funcionando → **critério "deploy → delete → deploy" já cumprido aqui**, enquanto a pilha é pequena.
- [ ] Deploy da pilha **`evento`** → a URL definitiva existe desde já.
- **Demonstrável:** URL abrindo no celular pelo 4G, em HTTPS.

### I2 · MVP jogável — 22 a 25/10 · ~4 h
- [ ] Backend: `entrar`, `estado`, `puxar` (com `seq`), `admin/rodada`, `admin/iniciar`; testes de unidade da lógica de status e da corda.
- [ ] `index.html`: entrar → cor da equipe → "Aguardando a largada" com contagem de pessoas → 3‑2‑1 → botão + cronômetro (`terminaEm − agoraServidor`) → resultado.
- [ ] `telao.html`: corda animada (CSS `transform`), totais, participantes, cronômetro, vencedora, pico de req/s; fonte ≥ 64 px, alto contraste (RNF7).
- [ ] `admin.html` mínimo: token + "Nova rodada" + "Iniciar".
- **Demonstrável:** rodada completa em 2 celulares + telão. **Se não estiver aqui em 25/10: cortar RF9 e revanche (regra do cronograma).**

### Marco 26/10 · URL congelada
- [ ] Gerar `qr.png` da URL da pilha `evento` (+ link curto, se D1 = c) e entregar a quem monta o slide 19. Dá para antecipar para 22/10, já que a URL existe desde o I1.

### I3 · Robustez — 26 a 28/10 · ~3 h
- [ ] Admin completo: encerrar, novo evento, resumo JSON/CSV (RF3, RF8) — critério "iniciar/encerrar/zerar em < 10 s".
- [ ] Antitrapaça (≤ 25 toques/lote, ≥ 400 ms entre lotes) e throttling por rota no HTTP API (RNF4).
- [ ] Cache de 1 s do `estado` no CloudFront; logs JSON; painel CloudWatch no template (pronto para o "esse pico são vocês").
- [ ] **Teste de carga:** `node carga/simular.mjs --jogadores 150 --segundos 45` contra a `dev`. Passa se perda < 1 % e nenhum 5xx. Guardar o relatório (vira dado do artigo).
- [ ] RF9 (custo estimado no telão) — só se sobrar tempo; é o primeiro corte.
- **Demonstrável:** relatório de carga + export CSV de uma rodada.

### 29/10 · Ensaio
- Core Team com 30+ celulares; ensaio cronometrado com o Renan; confirmar D5 vendo a corda ao vivo; conferir custo acumulado no Billing (critério).

### I4 · Acabamento — 30/10 a 01/11 · ~2 h
- [ ] Ajustes do ensaio; vídeo de backup de uma rodada completa; slide de custo com os números reais do ensaio; "Novo evento" para zerar os dados de ensaio.

### 03/11 teste no auditório · 04/11 evento · até 06/11 pós-evento
- Exportar resumo, anotar custo real, `npm run remover -- evento` e `-- dev`, manter a pilha de orçamento até a fatura fechar.

---

## 5. Rastreabilidade

| Item do escopo | Onde é atendido |
|---|---|
| RF1, RF2 | I2 (páginas) |
| RF3 | I2 (mínimo) + I3 (completo) |
| RF4 | `entrar` com contador atômico + `localStorage` com `eventoId` |
| RF5 | Status derivado de `terminaEm` no servidor |
| RF6 | Lote de 1 s com `seq` |
| RF7 | `admin/rodada` + histórico por `RODADA#<id>` |
| RF8 | `admin/resumo` + CSV no admin.html |
| RF9 | I3, opcional |
| RNF1 | Teste de carga com 150 (I3) + cota de concorrência (I0) |
| RNF2 | Telão sem cache, polling 500 ms |
| RNF3 | Front sem framework, CloudFront `PriceClass_All` |
| RNF4 | Escrita condicional por jogador + throttling por rota |
| RNF5 | Pilha de orçamento (I0); custo conferido no ensaio |
| RNF6 | `npm run deploy` / `npm run remover`; teste na `dev` (I1) |
| RNF7 | Telão com tipografia e contraste definidos no I2 |
| RNF8 | Só UUID aleatório; nenhum campo de texto |

## 6. Riscos principais

| Risco | Mitigação |
|---|---|
| Cota de concorrência Lambda reduzida (conta nova) → 429 no pico | Verificar no I0 e pedir aumento já; 1024 MB e escritas em paralelo reduzem a duração de cada chamada |
| Domínio do QR mudar | Pilha `evento` nunca removida antes de 05/11; destrutivos só na `dev` |
| Lote em trânsito no fim do jogo ser descartado | Tolerância de 1 s no servidor; o celular para de contar exatamente em `terminaEm` |
| 4h/semana não fecharem | Cortes na ordem: RF9 → CSV (fica só JSON) → revanche; I1 antecipa o que é caminho crítico |
| Notebook do telão sem rede | Hotspot reserva + vídeo de backup (I4), conforme `04-roteiro-palco.md` |
