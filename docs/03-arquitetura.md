# 03 · Arquitetura proposta

> Proposta inicial para o plano do Claude Code. Pode mudar, desde que respeite `CLAUDE.md` e os critérios de aceite.

## Visão geral
```
 Celular (jogador)          Notebook (telão)         Notebook/celular (admin)
        │  HTTPS                    │                          │
        └──────────────┬────────────┴──────────────┬───────────┘
                       ▼                           ▼
                 CloudFront  ──  /*      ──►  S3 (páginas estáticas: jogar, telao, admin)
                              ──  /api/* ──►  API Gateway (HTTP API, com limite de taxa)
                                                   │
                                                   ▼
                                               Lambda
                                                   │
                                                   ▼
                                               DynamoDB (on-demand)
 CloudWatch: logs e métricas · AWS Budgets: alerta de custo
```
- **CloudFront com duas origens** (S3 e API) deixa tudo no mesmo endereço: HTTPS no celular e sem CORS.
- **Polling** em vez de WebSocket: o telão consulta o estado a cada ~500 ms; o jogador consulta a cada ~2 s enquanto espera e envia toques 1×/s durante o jogo.
- Por que essas peças: cada uma corresponde a uma "caixinha" da aula do professor (armazenamento, serverless, banco de dados), e nenhuma é cobrada por hora.

## Contrato da API (rascunho)
| Método e rota | Quem chama | Faz |
|---|---|---|
| `POST /api/entrar` | jogador | Atribui equipe equilibrada; retorna `jogadorId`, `equipe` |
| `GET /api/estado` | jogador, telão | Rodada atual: status (`aguardando`, `contagem`, `jogando`, `encerrada`), `terminaEm` (horário do servidor), totais, participantes por equipe, `agoraServidor` |
| `POST /api/puxar` | jogador | `{ rodadaId, jogadorId, toques }` — aceito só com rodada em `jogando`; toques limitados por segundo |
| `POST /api/admin/rodada` | admin | Cria/inicia rodada (token) |
| `POST /api/admin/encerrar` | admin | Encerra antes do tempo (token) |
| `POST /api/admin/zerar` | admin | Zera para a próxima rodada (token) |
| `GET /api/admin/resumo` | admin | Resumo de todas as rodadas (RF8) |

O cliente calcula o tempo restante com `terminaEm − agoraServidor`, corrigindo a diferença de relógio do celular.

## Modelo de dados (DynamoDB, uma tabela)
| PK | SK | Atributos |
|---|---|---|
| `RODADA#atual` | `META` | `rodadaId` |
| `RODADA#<id>` | `META` | `status`, `iniciaEm`, `terminaEm` |
| `RODADA#<id>` | `EQUIPE#laranja` | `toques`, `participantes` (contadores atômicos com `ADD`) |
| `RODADA#<id>` | `EQUIPE#verde` | idem |
| `RODADA#<id>` | `SEG#<epoch>` | `requisicoes` (para calcular o pico de req/s) |

**Ponto de atenção didático:** cada item do DynamoDB aceita um volume limitado de escritas por segundo. Com o envio em lote (1 req/s por celular), 150 celulares geram ~150 escritas/s por equipe, bem abaixo do limite. Se fosse 1 requisição por toque, seriam milhares. Isso é conteúdo da revelação no palco e do artigo.

## Segurança
- Admin protegido por token guardado fora do repositório (ex.: SSM Parameter Store ou variável de ambiente do deploy).
- IAM com privilégio mínimo: a Lambda só acessa a sua tabela.
- Limite de taxa no API Gateway; validação de `toques` por requisição no servidor.
- Nenhum dado pessoal; `jogadorId` é aleatório.

## Custos estimados (confirmar com a calculadora da AWS)
150 celulares × 1 req/s × 45 s ≈ 7 mil requisições de jogo por rodada, mais o polling. Mesmo com várias rodadas e ensaios, o total fica em centavos de dólar. Ainda assim: **AWS Budgets com alerta de US$ 1 e US$ 5** antes do primeiro deploy, e tags `projeto=guerra-de-clusters` em todos os recursos.

## Observabilidade
- Logs estruturados da Lambda no CloudWatch.
- Para a revelação: gráfico de invocações da Lambda e de requisições da API no período da rodada.
