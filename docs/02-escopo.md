# 02 · Escopo

## Visão em uma frase
A plateia escaneia o QR do slide 19, entra numa equipe e, durante 45 segundos, toca o botão o mais rápido possível; o telão mostra a corda sendo puxada ao vivo e, no fim, a equipe vencedora, o total de toques e o pico de requisições.

## Dinâmica
1. **Entrada:** o participante escaneia o QR e abre a página no celular. Não há login nem cadastro.
2. **Equipe:** o sistema atribui a equipe — **Laranja Lambda** ou **Verde DynamoDB** — equilibrando os lados (padrão; ver decisão D2). A tela do celular fica na cor da equipe.
3. **Espera:** enquanto a rodada não começa, o celular mostra "Aguardando a largada" e quantas pessoas há em cada equipe.
4. **Largada:** o operador inicia a rodada pelo painel admin. Celulares e telão mostram a contagem **3, 2, 1** e o **cronômetro de 45 s**.
5. **Jogo:** cada toque soma para a equipe. O celular agrega os toques e envia **1 vez por segundo**. O telão mostra a corda se movendo conforme a diferença entre as equipes, os totais e o tempo restante.
6. **Fim:** aos 45 s o servidor encerra a rodada e ignora envios posteriores. O telão mostra a vencedora, os totais, o número de participantes e o **pico de requisições por segundo**.
7. **Revelação:** o Tech Lead abre o diagrama e o console (ver `04-roteiro-palco.md`).

## Requisitos funcionais
| ID | Requisito |
|---|---|
| RF1 | Página do jogador (celular): entrar, ver a equipe, contagem, botão grande, cronômetro, resultado |
| RF2 | Página do telão: corda animada, totais, participantes por equipe, cronômetro, resultado e pico de req/s |
| RF3 | Painel admin protegido por token: criar/iniciar rodada, encerrar antes do tempo, zerar, ver estado |
| RF4 | Atribuição automática e equilibrada de equipe, mantida no navegador durante a sessão |
| RF5 | Cronômetro de 45 s controlado pelo servidor (horário de término definido no servidor) |
| RF6 | Envio de toques em lote, 1 requisição por segundo por celular |
| RF7 | Múltiplas rodadas (para ensaio e para revanche), cada uma com seu resultado guardado |
| RF8 | Resumo de cada rodada exportável (JSON/CSV) para o artigo: toques por equipe, participantes, pico de req/s, duração |
| RF9 | Contador de custo estimado da rodada no telão (cálculo a partir de requisições × preço público) — **desejável** |

## Requisitos não funcionais
| ID | Requisito |
|---|---|
| RNF1 | Suportar **150 celulares simultâneos** com folga (meta do evento: 80) |
| RNF2 | Telão atualizado com atraso percebido menor que ~1 s |
| RNF3 | Página do jogador abre em 4G em menos de 3 s; HTTPS; funciona em Android e iPhone comuns |
| RNF4 | Antitrapaça simples: limite de toques por segundo por celular aceito pelo servidor; limite de requisições na API |
| RNF5 | Custo total do evento abaixo de US$ 1; alerta de orçamento ativo |
| RNF6 | Implantação e remoção completas por comando (IaC); região `sa-east-1` |
| RNF7 | Legível num telão a 15 m: fontes grandes, alto contraste, cores das equipes inconfundíveis |
| RNF8 | Sem dados pessoais: nenhum nome, e-mail ou telefone é coletado |

## Fora de escopo (nesta versão)
- Enquetes, perguntas do tipo "de 1 a 5" e coleta para pesquisa científica (possível fase 2, reaproveitando a base).
- Texto livre, apelidos ou nomes na tela.
- Login, ranking individual, premiação (o Kahoot cuida da competição individual).
- App nativo; WebSocket (polling é suficiente para este volume — revisar só se RNF2 falhar no teste de carga).
- Domínio próprio, se não for resolvido até 22/10 (ver D1).

## Critérios de aceite
- [ ] 30+ celulares reais jogando juntos no ensaio de 29/10 sem erro visível
- [ ] Teste de carga com 150 clientes simulados por 45 s sem perda de toques acima de 1%
- [ ] Rodada iniciada, encerrada e zerada pelo painel admin em menos de 10 s
- [ ] Toques enviados depois do fim são ignorados
- [ ] URL e QR do slide 19 definitivos até **26/10**
- [ ] Alerta de orçamento ativo e custo acumulado verificado depois do ensaio
- [ ] Vídeo de backup de uma rodada completa gravado
- [ ] Remoção completa testada (`deploy` → `delete` → `deploy` sem erro)

## Decisões em aberto
| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Endereço do jogo | (a) `guerra.aws.dev` — **não é possível**: `aws.dev` pertence à Amazon; (b) domínio próprio do grupo, se houver; (c) domínio padrão do CloudFront + link curto | (c), a não ser que o grupo já tenha domínio. O QR esconde o endereço feio |
| D2 | Escolha de equipe | (a) automática e equilibrada; (b) o participante escolhe | (a): evita 70×10 e não exige decisão de ninguém |
| D3 | Linguagem do backend | Node.js, Python ou C# (.NET) | Node.js ou Python: menos configuração e cold start menor; a mesma linguagem do front reduz troca de contexto |
| D4 | Ferramenta de IaC | AWS SAM ou AWS CDK | SAM: um `template.yaml`, ideal para o tamanho do projeto e para o workshop futuro |
| D5 | Placar: o que move a corda | (a) diferença absoluta de toques; (b) toques por participante da equipe | (b) é mais justo se as equipes ficarem desiguais; decidir no ensaio |
