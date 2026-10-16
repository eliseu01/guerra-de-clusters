// Acesso ao DynamoDB. Uma tabela, chaves PK/SK (modelo em docs/plano-implementacao.md).
import { randomUUID } from 'node:crypto';
import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  INTERVALO_MIN_LOTES_MS, aceitaPuxar, equipePorOrdem, horariosDaLargada,
  idDeRodada, posicaoCorda, statusDaRodada, vencedora,
} from './regras.mjs';

const db = new DynamoDBClient({});
const TableName = process.env.TABELA;
const TTL_SEGUNDOS = 30 * 24 * 3600;

const S = (v) => ({ S: String(v) });
const N = (v) => ({ N: String(v) });
const chave = (PK, SK) => ({ PK: S(PK), SK: S(SK) });
const num = (atributo, padrao = 0) => (atributo?.N !== undefined ? Number(atributo.N) : padrao);
const expiraEm = (agora) => N(Math.floor(agora / 1000) + TTL_SEGUNDOS);
const falhouCondicao = (erro) => erro.name === 'ConditionalCheckFailedException';

export class Conflito extends Error {}

// ---------- Evento e rodada atual

export async function lerAtual() {
  const { Item } = await db.send(new GetItemCommand({ TableName, Key: chave('ATUAL', 'ATUAL') }));
  return Item ? { eventoId: Item.eventoId.S, rodadaId: Item.rodadaId?.S ?? null } : null;
}

async function garantirAtual() {
  const atual = await lerAtual();
  if (atual) return atual;
  try {
    await db.send(new PutItemCommand({
      TableName,
      Item: { ...chave('ATUAL', 'ATUAL'), eventoId: S(randomUUID().slice(0, 8)) },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
  } catch (erro) {
    if (!falhouCondicao(erro)) throw erro; // outra Lambda criou ao mesmo tempo
  }
  return lerAtual();
}

// Metadados da rodada ficam 1 s na memória da Lambda: durante o jogo, quase todo "puxar"
// evita uma leitura. Encerrar antes do tempo leva no máximo 1 s a mais para valer — igual à tolerância de rede.
const memoRodada = new Map();

async function lerMetaRodada(rodadaId, agora) {
  const memo = memoRodada.get(rodadaId);
  if (memo && memo.ate > agora) return memo.meta;
  const { Item } = await db.send(new GetItemCommand({ TableName, Key: chave(`RODADA#${rodadaId}`, 'META') }));
  const meta = Item ? { iniciaEm: num(Item.iniciaEm, null), terminaEm: num(Item.terminaEm, null) } : null;
  memoRodada.set(rodadaId, { meta, ate: agora + 1_000 });
  return meta;
}

// ---------- Jogador

export async function entrar(agora) {
  const { eventoId } = await garantirAtual();
  const { Attributes } = await db.send(new UpdateItemCommand({
    TableName,
    Key: chave(`EVENTO#${eventoId}`, 'META'),
    UpdateExpression: 'ADD entradas :um SET criadoEm = if_not_exists(criadoEm, :agora)',
    ExpressionAttributeValues: { ':um': N(1), ':agora': N(agora) },
    ReturnValues: 'UPDATED_NEW',
  }));
  const equipe = equipePorOrdem(num(Attributes.entradas));
  await db.send(new UpdateItemCommand({
    TableName,
    Key: chave(`EVENTO#${eventoId}`, 'META'),
    UpdateExpression: 'ADD #p :um',
    ExpressionAttributeNames: { '#p': `participantes_${equipe}` },
    ExpressionAttributeValues: { ':um': N(1) },
  }));
  return { eventoId, jogadorId: randomUUID(), equipe };
}

/**
 * Soma um lote de toques. Idempotente por `seq`: um reenvio do mesmo lote (4G instável) não conta em dobro.
 * Também recusa lotes a menos de 400 ms do anterior e troca de equipe no meio da rodada.
 */
export async function puxar(agora, { rodadaId, jogadorId, equipe, seq, toques }) {
  const meta = await lerMetaRodada(rodadaId, agora);
  if (!meta) return { aceito: false, motivo: 'rodada-desconhecida', status: 'sem-rodada', agoraServidor: agora };

  const base = { status: statusDaRodada(meta, agora), terminaEm: meta.terminaEm, agoraServidor: agora };
  if (!aceitaPuxar(meta, agora)) return { ...base, aceito: false, motivo: 'fora-do-jogo' };
  if (toques === 0) return { ...base, aceito: true };

  const pk = `RODADA#${rodadaId}`;
  const contarSegundo = db.send(new UpdateItemCommand({
    TableName,
    Key: chave(pk, `SEG#${Math.floor(agora / 1000)}`),
    UpdateExpression: 'ADD requisicoes :um SET expira = if_not_exists(expira, :exp)',
    ExpressionAttributeValues: { ':um': N(1), ':exp': expiraEm(agora) },
  }));

  let primeiroLote;
  try {
    const { Attributes } = await db.send(new UpdateItemCommand({
      TableName,
      Key: chave(pk, `JOG#${jogadorId}`),
      UpdateExpression:
        'SET ultimoSeq = :seq, ultimoMs = :agora, equipe = if_not_exists(equipe, :eq), expira = if_not_exists(expira, :exp) ADD toques :t',
      ConditionExpression:
        '(attribute_not_exists(ultimoSeq) OR (ultimoSeq < :seq AND ultimoMs <= :limite)) AND (attribute_not_exists(equipe) OR equipe = :eq)',
      ExpressionAttributeValues: {
        ':seq': N(seq), ':agora': N(agora), ':eq': S(equipe), ':t': N(toques),
        ':exp': expiraEm(agora), ':limite': N(agora - INTERVALO_MIN_LOTES_MS),
      },
      ReturnValues: 'UPDATED_OLD',
      ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
    }));
    primeiroLote = Attributes?.ultimoSeq === undefined;
  } catch (erro) {
    await contarSegundo;
    if (!falhouCondicao(erro)) throw erro;
    const anterior = erro.Item;
    if (anterior?.equipe && anterior.equipe.S !== equipe) return { ...base, aceito: false, motivo: 'equipe-invalida' };
    if (num(anterior?.ultimoSeq) >= seq) return { ...base, aceito: true, motivo: 'duplicado' };
    return { ...base, aceito: false, motivo: 'rapido-demais' };
  }

  await Promise.all([
    contarSegundo,
    db.send(new UpdateItemCommand({
      TableName,
      Key: chave(pk, `EQUIPE#${equipe}`),
      UpdateExpression: 'ADD toques :t, ativos :a',
      ExpressionAttributeValues: { ':t': N(toques), ':a': N(primeiroLote ? 1 : 0) },
    })),
  ]);
  return { ...base, aceito: true };
}

// ---------- Estado (jogador, telão e admin)

async function lerVarios(chaves) {
  const itens = [];
  let pendentes = { [TableName]: { Keys: chaves } };
  for (let tentativa = 0; pendentes && Object.keys(pendentes).length && tentativa < 3; tentativa++) {
    const r = await db.send(new BatchGetItemCommand({ RequestItems: pendentes }));
    itens.push(...(r.Responses?.[TableName] ?? []));
    pendentes = r.UnprocessedKeys;
  }
  return new Map(itens.map((i) => [`${i.PK.S}|${i.SK.S}`, i]));
}

// O pico só é calculado depois que a rodada termina (e os lotes atrasados chegaram); aí fica na memória.
const memoPico = new Map();

async function picoDaRodada(rodadaId, terminaEm, agora) {
  if (memoPico.has(rodadaId)) return memoPico.get(rodadaId);
  let pico = 0;
  let inicio;
  do {
    const r = await db.send(new QueryCommand({
      TableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :seg)',
      ExpressionAttributeValues: { ':pk': S(`RODADA#${rodadaId}`), ':seg': S('SEG#') },
      ProjectionExpression: 'requisicoes',
      ExclusiveStartKey: inicio,
    }));
    for (const item of r.Items ?? []) pico = Math.max(pico, num(item.requisicoes));
    inicio = r.LastEvaluatedKey;
  } while (inicio);
  if (agora > terminaEm + 3_000) memoPico.set(rodadaId, pico);
  return pico;
}

export async function lerEstado(agora) {
  const atual = await lerAtual();
  if (!atual) return { status: 'sem-rodada', agoraServidor: agora, participantes: { laranja: 0, verde: 0 } };

  const { eventoId, rodadaId } = atual;
  const chaves = [chave(`EVENTO#${eventoId}`, 'META')];
  if (rodadaId) {
    const pk = `RODADA#${rodadaId}`;
    chaves.push(chave(pk, 'META'), chave(pk, 'EQUIPE#laranja'), chave(pk, 'EQUIPE#verde'));
  }
  const itens = await lerVarios(chaves);
  const evento = itens.get(`EVENTO#${eventoId}|META`);
  const metaRodada = itens.get(`RODADA#${rodadaId}|META`);
  const equipe = (nome) => {
    const item = itens.get(`RODADA#${rodadaId}|EQUIPE#${nome}`);
    return { toques: num(item?.toques), ativos: num(item?.ativos) };
  };

  const rodada = metaRodada ? { iniciaEm: num(metaRodada.iniciaEm, null), terminaEm: num(metaRodada.terminaEm, null) } : null;
  const equipes = { laranja: equipe('laranja'), verde: equipe('verde') };
  const estado = {
    status: statusDaRodada(rodada, agora),
    eventoId,
    rodadaId,
    iniciaEm: rodada?.iniciaEm ?? null,
    terminaEm: rodada?.terminaEm ?? null,
    agoraServidor: agora,
    participantes: { laranja: num(evento?.participantes_laranja), verde: num(evento?.participantes_verde) },
    equipes,
    posicaoCorda: posicaoCorda(equipes.laranja, equipes.verde),
  };
  if (estado.status === 'encerrada') {
    estado.vencedora = vencedora(equipes.laranja, equipes.verde);
    estado.picoReqPorSeg = await picoDaRodada(rodadaId, rodada.terminaEm, agora);
  }
  return estado;
}

// ---------- Admin

export async function novaRodada(agora) {
  const { eventoId } = await garantirAtual();
  const rodadaId = idDeRodada(agora);
  await db.send(new PutItemCommand({
    TableName,
    Item: { ...chave(`RODADA#${rodadaId}`, 'META'), eventoId: S(eventoId), criadaEm: N(agora) },
  }));
  await db.send(new UpdateItemCommand({
    TableName,
    Key: chave('ATUAL', 'ATUAL'),
    UpdateExpression: 'SET rodadaId = :r',
    ExpressionAttributeValues: { ':r': S(rodadaId) },
  }));
  return { eventoId, rodadaId };
}

async function rodadaAtualOuConflito() {
  const atual = await lerAtual();
  if (!atual?.rodadaId) throw new Conflito('Crie uma rodada primeiro.');
  return atual.rodadaId;
}

export async function iniciar(agora) {
  const rodadaId = await rodadaAtualOuConflito();
  const { iniciaEm, terminaEm } = horariosDaLargada(agora);
  try {
    await db.send(new UpdateItemCommand({
      TableName,
      Key: chave(`RODADA#${rodadaId}`, 'META'),
      UpdateExpression: 'SET iniciaEm = :i, terminaEm = :t',
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(iniciaEm)',
      ExpressionAttributeValues: { ':i': N(iniciaEm), ':t': N(terminaEm) },
    }));
  } catch (erro) {
    if (falhouCondicao(erro)) throw new Conflito('Esta rodada já foi iniciada. Crie uma nova rodada.');
    throw erro;
  }
  memoRodada.delete(rodadaId);
  return { rodadaId, iniciaEm, terminaEm };
}

export async function encerrar(agora) {
  const rodadaId = await rodadaAtualOuConflito();
  memoRodada.delete(rodadaId);
  const meta = await lerMetaRodada(rodadaId, agora);
  if (!meta?.iniciaEm || meta.terminaEm <= agora) throw new Conflito('A rodada não está em andamento.');
  // Encerrar na contagem também precisa trazer o início para agora, senão o status ficaria em "contagem".
  const iniciaEm = Math.min(meta.iniciaEm, agora);
  await db.send(new UpdateItemCommand({
    TableName,
    Key: chave(`RODADA#${rodadaId}`, 'META'),
    UpdateExpression: 'SET iniciaEm = :i, terminaEm = :t, encerradaNoAdmin = :sim',
    ExpressionAttributeValues: { ':i': N(iniciaEm), ':t': N(agora), ':sim': { BOOL: true } },
  }));
  memoRodada.delete(rodadaId);
  return { rodadaId, terminaEm: agora };
}

export async function novoEvento() {
  const eventoId = randomUUID().slice(0, 8);
  await db.send(new PutItemCommand({ TableName, Item: { ...chave('ATUAL', 'ATUAL'), eventoId: S(eventoId) } }));
  return { eventoId };
}
