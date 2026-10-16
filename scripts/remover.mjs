// npm run remover -- dev|evento
// Esvazia o bucket do site (o CloudFormation não apaga bucket com arquivos) e remove a pilha.
// A pilha "evento" NÃO deve ser removida antes de 05/11: o domínio do CloudFront mudaria e o QR quebraria.
import { alvo, lerEstagio, pilhaDo, rodar, saidasDaPilha } from './comum.mjs';

const estagio = lerEstagio('remover');
const pilha = pilhaDo(estagio);

const { Bucket } = saidasDaPilha(pilha);
rodar(`aws s3 rm s3://${Bucket} --recursive ${alvo()}`);
rodar(`sam delete --stack-name ${pilha} --no-prompts ${alvo()}`);

console.log(`\nPilha ${pilha} removida.`);
