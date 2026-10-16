# Guerra de Clusters — instruções para o Claude Code

## O que é
Cabo de guerra serverless jogado ao vivo pela plateia do evento "Desmistificando a Nuvem" (AWS Student Builder Group at UNDB, 04/11/2026). Duas equipes — **Laranja Lambda** e **Verde DynamoDB** — tocam o botão no celular durante **45 segundos**; a corda no telão se move em tempo real. Depois, o Tech Lead revela no palco a arquitetura e o custo.

O projeto existe para **ensinar elasticidade, serverless e pagamento por uso pela experiência**. O jogo é o meio, não o fim.

## Leia antes de planejar (nesta ordem)
1. `docs/01-contexto.md` — quem somos, evento, restrições de tempo e pessoas
2. `docs/02-escopo.md` — dinâmica, requisitos, fora de escopo, critérios de aceite, decisões em aberto
3. `docs/03-arquitetura.md` — arquitetura proposta, contrato da API, modelo de dados, custos
4. `docs/04-roteiro-palco.md` — como o sistema é usado ao vivo (slide 19, papéis, contingências)
5. `docs/05-cronograma.md` — marcos até 04/11
6. `docs/06-conectores.md` — MCPs e ferramentas do ambiente

## Regras do projeto (não negociáveis)
- **Prazo fixo:** precisa estar estável até **29/10** (ensaio) e testado no auditório em **03/11**. O autor tem ~4h/semana. Prefira sempre a solução mais simples que atende aos critérios de aceite.
- **Custo:** tudo dentro do Free Tier/créditos. Nada cobrado por hora (sem EC2, ALB, NAT Gateway, OpenSearch). Alerta de orçamento obrigatório antes do primeiro deploy.
- **Região:** `sa-east-1` (São Paulo) — faz parte do discurso da demo.
- **Infraestrutura como código:** nada criado à mão no console. Um comando sobe, um comando derruba.
- **Sem texto livre do público na tela.** A única entrada do participante é tocar o botão.
- **Sem segredos no repositório.** Token de admin e afins via parâmetro/variável de ambiente.
- **Interface em português do Brasil**, legível num telão e num celular barato com 4G.
- **Leve no celular:** sem framework pesado no front; o cliente envia toques **em lote (1 requisição por segundo)**, nunca 1 requisição por toque.

## Como trabalhar
- Comece com um plano e valide-o contra `docs/02-escopo.md` antes de escrever código.
- Entregue em incrementos que batam com os marcos de `docs/05-cronograma.md`; cada incremento termina com algo demonstrável no celular.
- Registre decisões tomadas em `docs/decisoes.md` (crie se não existir): data, decisão, motivo. Esse registro vira material do artigo no AWS Builder Center.
- Quando houver dúvida sobre serviço/limite/preço da AWS, consulte o MCP `aws-knowledge` em vez de supor.
