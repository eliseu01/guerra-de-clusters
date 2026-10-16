# Registro de decisões

| Data | ID | Decisão | Motivo |
|---|---|---|---|
| 16/10/2026 | D2 | Equipe atribuída automaticamente, alternando por contador atômico (ímpar → Laranja, par → Verde) | Equilíbrio perfeito sem exigir decisão do participante; 1 escrita no DynamoDB |
| 16/10/2026 | D3 | Backend em Node.js 24 (`nodejs24.x`, arm64) | Mesma linguagem do front; SDK v3 incluso no runtime, sem etapa de build; cold start baixo |
| 16/10/2026 | D4 | IaC com AWS SAM; upload do site via `npm run deploy` | Um `template.yaml` legível, reaproveitável no workshop; sem bootstrap/compilação do CDK |
| 16/10/2026 | D5 | Corda e vencedora pela média de toques por jogador ativo: `mL / (mL + mV)` | Justo se as equipes ficarem desiguais; com D2 equivale à diferença absoluta |
| 16/10/2026 | A1 | Manter CloudFront → S3 + API Gateway HTTP API → Lambda → DynamoDB, com uma única Lambda | Menor pilha que atende os RNFs, nada cobrado por hora; uma função = menos cold starts e template menor |
| 16/10/2026 | A2 | Estado da rodada derivado do relógio do servidor (`iniciaEm`/`terminaEm`), sem agendador | Encerramento aos 45 s sem EventBridge/cron; menos peças |
| 16/10/2026 | A3 | Pilhas separadas `guerra-dev` e `guerra-evento`; a `evento` não é removida antes de 05/11 | O domínio do CloudFront muda ao recriar a distribuição e quebraria o QR do slide 19 |
| 16/10/2026 | A4 | Antitrapaça por jogador na Lambda (≤ 25 toques/lote, ≥ 400 ms entre lotes); API Gateway só com teto por rota | HTTP API não tem limite por cliente; WAF tem custo mensal |
| 16/10/2026 | A5 | Orçamento em pilha própria, alertas sem descontar créditos | O alerta precisa existir antes do 1º deploy e refletir o uso real, não US$ 0 |
| 16/10/2026 | A6 | Acesso do Claude Code por usuário IAM `guerra-claude` com limite de permissões (`infra/acesso.yaml`) | Modo automático sem expor chave e sem poder agir fora dos recursos `guerra-*` |
| 16/10/2026 | A7 | Repositório só local por enquanto; remoto (GitLab ou GitHub do grupo) até o ensaio | Não bloqueia o MVP; o remoto serve para backup, Core Team, artigo e workshop |
| 16/10/2026 | O1 | Cota de execuções simultâneas da Lambda em `sa-east-1` era 10 (conta nova); pedido de aumento para 1000 | O pico estimado (10–15) passaria da cota e geraria erros 429 no meio do jogo |
| 16/10/2026 | O2 | Pedido de cota aberto pelo console (caso 179218464300864, 1000 execuções simultâneas) | O usuário `guerra-claude` não pode criar o papel de serviço do Service Quotas; o primeiro pedido é feito pelo administrador |
| 16/10/2026 | C1 | Critério "deploy → delete → deploy" cumprido na pilha `dev` (I1) | Feito cedo, enquanto a pilha ainda é pequena; a pilha `evento` não passa por esse teste para não trocar o domínio do QR |
