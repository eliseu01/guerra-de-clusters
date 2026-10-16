import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({});
const TABELA = process.env.TABELA;

export async function lerAtual() {
  const { Item } = await db.send(
    new GetItemCommand({ TableName: TABELA, Key: { PK: { S: 'ATUAL' }, SK: { S: 'ATUAL' } } }),
  );
  if (!Item) return null;
  return { eventoId: Item.eventoId?.S, rodadaId: Item.rodadaId?.S };
}
