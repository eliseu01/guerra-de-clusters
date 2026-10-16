# 06 · Conectores e ambiente

## Pré-requisitos na máquina
- AWS CLI v2 configurado com um **perfil próprio do projeto** (`aws configure --profile guerra`), usuário/role com permissões só para o necessário.
- AWS SAM CLI (se D4 = SAM) ou AWS CDK.
- Node.js LTS e/ou Python 3.12+ (conforme D3).
- Git, com o repositório no GitLab.

## MCPs para o Claude Code
| Conector | Para quê | Credenciais | Recomendação |
|---|---|---|---|
| **AWS Knowledge MCP** | Documentação, limites, preços e boas práticas atualizados da AWS | Nenhuma | **Sim** — já configurado em `.mcp.json` |
| **Context7** | Documentação atualizada de bibliotecas (SDK, SAM, front) | Nenhuma | **Sim** — já configurado em `.mcp.json` |
| **GitLab** | Repositório, issues e merge requests do projeto | Token GitLab | Sim, se o código for para o GitLab |
| **AWS MCP Server** (completo, via `mcp-proxy-for-aws`) | Executar chamadas na conta AWS (consultar recursos, métricas, custos) | Credenciais AWS | **Opcional e com cuidado:** use um perfil com permissão só de leitura. A criação de recursos deve passar pelo IaC, nunca por chamadas soltas |

Para conferir se os MCPs carregaram: rode `claude` nesta pasta e use `/mcp`.

Para adicionar o AWS Knowledge manualmente (caso prefira escopo de usuário):
```
claude mcp add --transport http aws-knowledge https://knowledge-mcp.global.api.aws
```

## Skills úteis no Claude Code
- Planejamento antes de codar (modo plano).
- Revisão de código antes de cada deploy importante.
- Checklist de deploy antes do ensaio (29/10) e do teste no auditório (03/11).
