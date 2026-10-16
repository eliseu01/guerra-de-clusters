# Guerra de Clusters

Cabo de guerra serverless ao vivo para o 1º evento do **AWS Student Builder Group at UNDB** (04/11/2026).
Equipes **Laranja Lambda** × **Verde DynamoDB**, 45 segundos, QR code no slide 19.

## Começando no Claude Code
1. Coloque esta pasta em `Documents/` e abra o terminal nela.
2. Configure os pré-requisitos e conectores de `docs/06-conectores.md`.
3. Rode `claude` e peça: *"Leia o CLAUDE.md e os documentos em docs/ e monte o plano de implementação."*

## Comandos
Pré-requisitos e acesso: `docs/07-acesso.md`. Tudo roda com o perfil `guerra` em `sa-east-1`.

| Comando | Faz |
|---|---|
| `npm test` | Testes das regras do jogo |
| `npm run deploy -- dev` | Sobe/atualiza a pilha de testes e publica as páginas |
| `npm run deploy -- evento` | Idem para a pilha do evento (URL do QR) |
| `npm run carga -- dev --jogadores 150` | Simula N celulares numa rodada e mede perda, erros e latência |
| `npm run remover -- dev` | Remove a pilha de testes (nunca a `evento` antes de 05/11) |

Páginas: `/` (jogador) · `/telao.html` · `/admin.html` (token em `.segredos/admin-<estágio>.txt`).

## Documentos
| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | Contexto e regras para o Claude Code |
| `docs/01-contexto.md` | Quem somos e por que o projeto existe |
| `docs/02-escopo.md` | Dinâmica, requisitos e critérios de aceite |
| `docs/03-arquitetura.md` | Arquitetura proposta, API e dados |
| `docs/04-roteiro-palco.md` | Uso ao vivo no evento |
| `docs/05-cronograma.md` | Marcos até o evento |
| `docs/06-conectores.md` | MCPs, CLI e setup |

Responsável técnico: Eliseu (Tech Lead do Core Team).
