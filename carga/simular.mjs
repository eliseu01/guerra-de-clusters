// npm run carga -- dev [--jogadores 150] [--sem-admin]
//
// Simula N celulares jogando uma rodada completa e confere se o servidor contou tudo:
// entrar → (admin cria e inicia a rodada) → 1 lote por segundo durante 45 s → compara totais.
// Critério de aceite: perda de toques < 1 % e nenhum erro 5xx.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const estagio = process.argv[2];
if (!['dev', 'evento'].includes(estagio)) {
  console.error('Uso: npm run carga -- dev [--jogadores 150] [--sem-admin]');
  process.exit(1);
}
const opcao = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const N = Number(opcao('jogadores', 150));
const comAdmin = !process.argv.includes('--sem-admin');

const url = execSync(
  `aws cloudformation describe-stacks --stack-name guerra-${estagio} --query "Stacks[0].Outputs[?OutputKey=='Url'].OutputValue" --output text --profile ${process.env.AWS_PROFILE || 'guerra'} --region sa-east-1`,
  { encoding: 'utf8' },
).trim();
const token = readFileSync(`.segredos/admin-${estagio}.txt`, 'utf8').trim();

const espera = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const latencias = [];
const erros = {};

async function chamar(caminho, { metodo = 'GET', corpo, admin = false } = {}) {
  const inicio = performance.now();
  try {
    const r = await fetch(url + caminho, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-token': token } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    latencias.push(performance.now() - inicio);
    if (!r.ok) erros[r.status] = (erros[r.status] ?? 0) + 1;
    return r.ok ? r.json() : null;
  } catch {
    erros.rede = (erros.rede ?? 0) + 1;
    return null;
  }
}

console.log(`Alvo: ${url} · ${N} jogadores simulados`);

const jogadores = (await Promise.all(Array.from({ length: N }, () => chamar('/api/entrar', { metodo: 'POST' })))).filter(Boolean);
console.log(`Entraram: ${jogadores.length} (${jogadores.filter((j) => j.equipe === 'laranja').length} Laranja)`);

if (comAdmin) {
  await chamar('/api/admin/rodada', { metodo: 'POST', admin: true });
  await chamar('/api/admin/iniciar', { metodo: 'POST', admin: true });
}
const estado = await chamar('/api/estado?telao=1');
if (!estado?.iniciaEm) {
  console.error('Rodada não iniciada. Rode sem --sem-admin ou inicie pelo painel.');
  process.exit(1);
}
const desvio = estado.agoraServidor - Date.now();
const relogio = () => Date.now() + desvio;
console.log(`Rodada ${estado.rodadaId}: largada em ${Math.round((estado.iniciaEm - relogio()) / 1000)} s`);

const enviados = { laranja: 0, verde: 0 };
const contados = { laranja: 0, verde: 0 };
const motivos = {};

const anotar = (motivo) => { motivos[motivo] = (motivos[motivo] ?? 0) + 1; };

// Mesmo protocolo da página do jogador (web/index.html): toques acumulam, sai 1 lote por segundo;
// lote recusado por "rápido demais" volta para o próximo; lote sem resposta é reenviado com o mesmo seq.
async function jogar(j) {
  await espera(estado.iniciaEm - relogio() + Math.random() * 1000); // celulares não começam no mesmo milissegundo
  let seq = 0, acumulado = 0, pendente = null;
  for (;;) {
    const jogando = relogio() < estado.terminaEm - 50;
    if (jogando) {
      const toques = 6 + Math.floor(Math.random() * 9); // 6 a 14 toques/s, como um dedo humano
      acumulado += toques;
      enviados[j.equipe] += toques;
    }
    if (!pendente && acumulado) {
      const toques = Math.min(acumulado, 25);
      acumulado -= toques;
      pendente = { rodadaId: estado.rodadaId, jogadorId: j.jogadorId, equipe: j.equipe, seq: ++seq, toques };
    }
    if (pendente) {
      const r = await chamar('/api/puxar', { metodo: 'POST', corpo: pendente });
      if (!r) anotar('sem-resposta'); // mantém o pendente: reenvio no próximo ciclo
      else {
        if (r.aceito) contados[j.equipe] += pendente.toques;
        else if (r.motivo === 'rapido-demais') acumulado += pendente.toques;
        if (r.motivo) anotar(r.motivo);
        pendente = null;
      }
    }
    if (!jogando && (!pendente && !acumulado || relogio() > estado.terminaEm + 1000)) break;
    await espera(1000 - (Date.now() % 1000) + Math.random() * 50);
  }
}

await Promise.all(jogadores.map(jogar));
await espera(estado.terminaEm + 4000 - relogio());

const final = await chamar('/api/estado?telao=1');
const totalEnviado = enviados.laranja + enviados.verde;
const totalServidor = final.equipes.laranja.toques + final.equipes.verde.toques;
const perda = totalEnviado ? (1 - totalServidor / totalEnviado) * 100 : 0;
latencias.sort((a, b) => a - b);
const pct = (p) => Math.round(latencias[Math.floor((latencias.length - 1) * p)] ?? 0);
const erros5xx = Object.entries(erros).filter(([k]) => k.startsWith('5')).reduce((s, [, v]) => s + v, 0);

console.log(`
Resultado da rodada ${final.rodadaId} (${final.status})
  Toques enviados:   ${totalEnviado}  (Laranja ${enviados.laranja} · Verde ${enviados.verde})
  Toques contados:   ${totalServidor}  (Laranja ${final.equipes.laranja.toques} · Verde ${final.equipes.verde.toques})
  Perda:             ${perda.toFixed(2)} %   ${perda < 1 ? 'OK' : 'ACIMA DE 1 %'}
  Ativos:            ${final.equipes.laranja.ativos + final.equipes.verde.ativos}
  Vencedora:         ${final.vencedora} · corda em ${final.posicaoCorda.toFixed(3)}
  Pico:              ${final.picoReqPorSeg} req/s
  Latência:          p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms
  Erros HTTP:        ${JSON.stringify(erros)}${erros5xx ? '   <- há 5xx' : ''}
  Lotes recusados:   ${JSON.stringify(motivos)}`);

process.exit(perda < 1 && !erros5xx ? 0 : 1);
