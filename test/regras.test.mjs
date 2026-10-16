import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DURACAO_MS, LARGADA_MS, MAX_TOQUES_POR_LOTE, TOLERANCIA_REDE_MS,
  aceitaPuxar, equipePorOrdem, horariosDaLargada, normalizarToques,
  posicaoCorda, statusDaRodada, vencedora,
} from '../api/regras.mjs';

const T0 = 1_000_000;
const rodada = { iniciaEm: T0, terminaEm: T0 + DURACAO_MS };

test('status segue o relógio do servidor', () => {
  assert.equal(statusDaRodada(null, T0), 'sem-rodada');
  assert.equal(statusDaRodada({}, T0), 'aguardando');
  assert.equal(statusDaRodada(rodada, T0 - 1), 'contagem');
  assert.equal(statusDaRodada(rodada, T0), 'jogando');
  assert.equal(statusDaRodada(rodada, T0 + DURACAO_MS - 1), 'jogando');
  assert.equal(statusDaRodada(rodada, T0 + DURACAO_MS), 'encerrada');
});

test('largada dá a contagem e 45 s de jogo', () => {
  const h = horariosDaLargada(T0);
  assert.equal(h.iniciaEm - T0, LARGADA_MS);
  assert.equal(h.terminaEm - h.iniciaEm, DURACAO_MS);
});

test('puxar só vale durante o jogo, com tolerância de rede no fim', () => {
  assert.equal(aceitaPuxar({}, T0), false);
  assert.equal(aceitaPuxar(rodada, T0 - 1), false);
  assert.equal(aceitaPuxar(rodada, T0), true);
  assert.equal(aceitaPuxar(rodada, rodada.terminaEm + TOLERANCIA_REDE_MS - 1), true);
  assert.equal(aceitaPuxar(rodada, rodada.terminaEm + TOLERANCIA_REDE_MS), false);
});

test('equipes alternam por ordem de entrada', () => {
  assert.deepEqual([1, 2, 3, 4].map(equipePorOrdem), ['laranja', 'verde', 'laranja', 'verde']);
});

test('toques: inteiro, não negativo e com teto por lote', () => {
  assert.equal(normalizarToques(12), 12);
  assert.equal(normalizarToques(0), 0);
  assert.equal(normalizarToques(999), MAX_TOQUES_POR_LOTE);
  for (const invalido of [-1, 1.5, '10', null, undefined]) assert.equal(normalizarToques(invalido), null);
});

test('corda: média por jogador ativo', () => {
  assert.equal(posicaoCorda(undefined, undefined), 0.5);
  assert.equal(posicaoCorda({ toques: 100, ativos: 10 }, { toques: 100, ativos: 10 }), 0.5);
  // Equipe menor com a mesma média por pessoa empata, apesar de ter metade dos toques
  assert.equal(posicaoCorda({ toques: 100, ativos: 10 }, { toques: 50, ativos: 5 }), 0.5);
  assert.equal(posicaoCorda({ toques: 30, ativos: 1 }, { toques: 10, ativos: 1 }), 0.75);
  assert.equal(vencedora({ toques: 30, ativos: 1 }, { toques: 10, ativos: 1 }), 'laranja');
  assert.equal(vencedora({ toques: 1, ativos: 1 }, { toques: 9, ativos: 1 }), 'verde');
  assert.equal(vencedora({ toques: 0, ativos: 0 }, { toques: 0, ativos: 0 }), 'empate');
});
