import { timingSafeEqual } from 'node:crypto';
import { Conflito, encerrar, entrar, iniciar, lerEstado, novaRodada, novoEvento, puxar } from './dados.mjs';
import { EQUIPES, normalizarToques } from './regras.mjs';

const resposta = (status, corpo, cache = 'no-store') => ({
  statusCode: status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  body: JSON.stringify(corpo),
});

class RequisicaoInvalida extends Error {}

function lerCorpo(event) {
  if (!event.body) return {};
  const texto = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(texto);
  } catch {
    throw new RequisicaoInvalida('JSON inválido');
  }
}

const textoCurto = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

function validarPuxar(corpo) {
  const toques = normalizarToques(corpo.toques);
  const ok =
    textoCurto(corpo.rodadaId, 32) &&
    textoCurto(corpo.jogadorId, 64) &&
    EQUIPES.includes(corpo.equipe) &&
    Number.isInteger(corpo.seq) && corpo.seq >= 1 &&
    toques !== null;
  if (!ok) throw new RequisicaoInvalida('Lote inválido');
  return { rodadaId: corpo.rodadaId, jogadorId: corpo.jogadorId, equipe: corpo.equipe, seq: corpo.seq, toques };
}

function adminAutorizado(event) {
  const enviado = Buffer.from(event.headers?.['x-admin-token'] ?? '');
  const esperado = Buffer.from(process.env.ADMIN_TOKEN ?? '');
  return esperado.length > 0 && enviado.length === esperado.length && timingSafeEqual(enviado, esperado);
}

const ACOES_ADMIN = {
  'POST /api/admin/rodada': novaRodada,
  'POST /api/admin/iniciar': iniciar,
  'POST /api/admin/encerrar': encerrar,
  'POST /api/admin/novo-evento': novoEvento,
};

export const handler = async (event) => {
  const metodo = event.requestContext?.http?.method;
  const rota = `${metodo} ${event.rawPath}`;
  const agora = Date.now();

  try {
    if (rota === 'GET /api/estado') {
      // Jogadores: 1 s no cache do CloudFront. Telão: sempre fresco (RNF2).
      const telao = event.queryStringParameters?.telao === '1';
      return resposta(200, await lerEstado(agora), telao ? 'no-store' : 'max-age=1');
    }
    if (rota === 'POST /api/entrar') return resposta(200, await entrar(agora));
    if (rota === 'POST /api/puxar') return resposta(200, await puxar(agora, validarPuxar(lerCorpo(event))));

    const acao = ACOES_ADMIN[rota];
    if (acao) {
      if (!adminAutorizado(event)) return resposta(401, { erro: 'Token do admin inválido.' });
      const resultado = await acao(agora);
      console.log(JSON.stringify({ nivel: 'info', admin: rota, ...resultado }));
      return resposta(200, resultado);
    }

    return resposta(404, { erro: 'Rota não encontrada.' });
  } catch (erro) {
    if (erro instanceof RequisicaoInvalida) return resposta(400, { erro: erro.message });
    if (erro instanceof Conflito) return resposta(409, { erro: erro.message });
    console.error(JSON.stringify({ nivel: 'erro', rota, mensagem: erro.message, tipo: erro.name }));
    return resposta(500, { erro: 'Falha interna.' });
  }
};
