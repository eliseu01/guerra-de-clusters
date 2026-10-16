// Regras puras do jogo: sem AWS, sem relógio global — tudo testável em test/regras.test.mjs.

export const EQUIPES = ['laranja', 'verde'];
export const LARGADA_MS = 5_000; // 2 s de folga para o polling + contagem 3, 2, 1
export const DURACAO_MS = 45_000;
export const TOLERANCIA_REDE_MS = 1_000; // lote que saiu antes do fim e chegou atrasado pelo 4G
export const MAX_TOQUES_POR_LOTE = 25;
export const INTERVALO_MIN_LOTES_MS = 400;

/** aguardando → contagem → jogando → encerrada, decidido só pelo relógio do servidor. */
export function statusDaRodada(rodada, agora) {
  if (!rodada) return 'sem-rodada';
  if (!rodada.iniciaEm) return 'aguardando';
  if (agora < rodada.iniciaEm) return 'contagem';
  if (agora < rodada.terminaEm) return 'jogando';
  return 'encerrada';
}

export function aceitaPuxar(rodada, agora) {
  return Boolean(rodada?.iniciaEm) && agora >= rodada.iniciaEm && agora < rodada.terminaEm + TOLERANCIA_REDE_MS;
}

export function horariosDaLargada(agora) {
  const iniciaEm = agora + LARGADA_MS;
  return { iniciaEm, terminaEm: iniciaEm + DURACAO_MS };
}

/** 1ª entrada → Laranja, 2ª → Verde, 3ª → Laranja… (D2: equilíbrio perfeito). */
export function equipePorOrdem(ordem) {
  return ordem % 2 === 1 ? 'laranja' : 'verde';
}

/** Inteiro entre 0 e o teto por lote; qualquer outra coisa vira null (requisição inválida). */
export function normalizarToques(valor) {
  if (!Number.isInteger(valor) || valor < 0) return null;
  return Math.min(valor, MAX_TOQUES_POR_LOTE);
}

/** D5: média de toques por jogador ativo. 0 = Verde venceu tudo, 0,5 = centro, 1 = Laranja. */
export function posicaoCorda(laranja, verde) {
  const media = (e) => (e?.toques ?? 0) / Math.max(e?.ativos ?? 0, 1);
  const mL = media(laranja);
  const mV = media(verde);
  return mL + mV === 0 ? 0.5 : mL / (mL + mV);
}

export function vencedora(laranja, verde) {
  const p = posicaoCorda(laranja, verde);
  if (p > 0.5) return 'laranja';
  if (p < 0.5) return 'verde';
  return 'empate';
}

export function idDeRodada(agora, aleatorio = Math.random) {
  return `${agora.toString(36)}${Math.floor(aleatorio() * 1296).toString(36).padStart(2, '0')}`;
}
