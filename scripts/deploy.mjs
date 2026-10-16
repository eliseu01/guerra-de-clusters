// npm run deploy -- dev|evento
// Sobe (ou atualiza) a pilha, publica as páginas no S3 e limpa o cache do CloudFront.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { alvo, lerEstagio, pilhaDo, rodar, saidasDaPilha } from './comum.mjs';

const estagio = lerEstagio('deploy');
const pilha = pilhaDo(estagio);

// Token do admin: fica só nesta máquina, em .segredos/ (ignorado pelo git).
function tokenAdmin() {
  const arquivo = `.segredos/admin-${estagio}.txt`;
  if (!existsSync(arquivo)) {
    mkdirSync('.segredos', { recursive: true });
    writeFileSync(arquivo, randomBytes(24).toString('hex'));
    console.log(`Token do admin (${estagio}) criado em ${arquivo}`);
  }
  return readFileSync(arquivo, 'utf8').trim();
}

rodar(
  [
    'sam deploy --template-file template.yaml',
    `--stack-name ${pilha}`,
    '--resolve-s3 --capabilities CAPABILITY_IAM',
    `--parameter-overrides Estagio=${estagio} AdminToken=${tokenAdmin()}`,
    `--tags projeto=guerra-de-clusters estagio=${estagio}`,
    '--no-confirm-changeset --no-fail-on-empty-changeset',
    alvo(),
  ].join(' '),
);

const saidas = saidasDaPilha(pilha);
rodar(`aws s3 sync web s3://${saidas.Bucket} --delete --cache-control max-age=60 ${alvo()}`);
rodar(
  `aws cloudfront create-invalidation --distribution-id ${saidas.DistribuicaoId} --paths "/*" --query Invalidation.Id --output text ${alvo()}`,
);

console.log(`\nPronto (${estagio}): ${saidas.Url}`);
