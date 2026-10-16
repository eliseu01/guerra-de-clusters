import { lerAtual } from './dados.mjs';

const resposta = (status, corpo, cache = 'no-store') => ({
  statusCode: status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  body: JSON.stringify(corpo),
});

export const handler = async (event) => {
  const metodo = event.requestContext?.http?.method;
  const rota = event.rawPath;

  try {
    if (metodo === 'GET' && rota === '/api/estado') {
      const atual = await lerAtual();
      return resposta(
        200,
        { status: 'aguardando', rodadaId: atual?.rodadaId ?? null, agoraServidor: Date.now() },
        'max-age=1',
      );
    }
    return resposta(404, { erro: 'rota não encontrada' });
  } catch (erro) {
    console.error(JSON.stringify({ nivel: 'erro', metodo, rota, mensagem: erro.message }));
    return resposta(500, { erro: 'falha interna' });
  }
};
