# 07 · Acesso do Claude Code à AWS

Objetivo: o Claude Code implanta e opera o projeto sozinho, **sem nunca ver a chave** e sem conseguir mexer em nada fora do projeto.

## O que cada peça garante
| Peça | Garante |
|---|---|
| `infra/acesso.yaml` → usuário `guerra-claude` | Só age em recursos `guerra-*`, só em `sa-east-1` (+ serviços globais). Sem acesso a faturamento, usuários ou outras contas |
| Limite de permissões `guerra-boundary` | Todo papel que o projeto criar (ex.: o da Lambda) só lê/escreve a tabela do jogo e grava logs — mesmo que alguém peça mais no template |
| `.claude/settings.json` | Sem perguntar: testes, deploy da pilha `dev`, leituras na AWS, commits locais. **Pergunta antes:** qualquer coisa na pilha `evento`, remoções, orçamento, pedido de cota, `git push`, `glab`. **Bloqueado:** ler a chave, criar chave, `push --force` |
| AWS Budgets (pilha `guerra-orcamento`) | Alerta de US$ 1 e US$ 5 sem descontar créditos — criado antes do primeiro deploy |

## Passo a passo (você, ~20 min, uma vez)
1. Instalar as ferramentas (pode pedir permissão de administrador):
   - `winget install -e --id Amazon.AWSCLI`
   - `winget install -e --id Amazon.SAM-CLI`
   - Feche e reabra o app depois, para o PATH atualizar.
2. Console AWS (login administrador) → região **São Paulo** → CloudFormation → *Criar pilha* → *Fazer upload de um arquivo* → `infra/acesso.yaml`.
   - Nome da pilha: **`acesso-guerra-de-clusters`** (não pode começar com `guerra-`).
   - Marque "Reconheço que o CloudFormation pode criar recursos do IAM com nomes personalizados" → Enviar.
3. IAM → Usuários → `guerra-claude` → Credenciais de segurança → *Criar chave de acesso* → caso de uso "CLI".
4. No **seu** terminal (não no chat):
   ```
   aws configure --profile guerra
   ```
   Região padrão: `sa-east-1`; formato: `json`. Feche a janela da chave sem copiá-la para outro lugar.
5. Teste: `aws sts get-caller-identity --profile guerra` deve mostrar `user/guerra-claude`.

## Depois do evento (até 06/11)
Remover as pilhas do jogo → excluir a chave de acesso → excluir a pilha `acesso-guerra-de-clusters` (manter o orçamento até a fatura fechar).

## Limites conhecidos
- As regras do `.claude/settings.json` valem para comandos rodados pela ferramenta Bash; o Claude Code deste projeto usa Bash para `aws`, `sam`, `npm` e `git`.
- `ce:GetCostAndUsage` (Cost Explorer) custa US$ 0,01 por chamada: usar só para o relatório de custo, não em laço.
