import { execSync } from 'node:child_process';

export const REGIAO = 'sa-east-1';
const ESTAGIOS = ['dev', 'evento'];

export function lerEstagio(comando) {
  const estagio = process.argv[2];
  if (!ESTAGIOS.includes(estagio)) {
    console.error(`Uso: npm run ${comando} -- ${ESTAGIOS.join('|')}`);
    process.exit(1);
  }
  return estagio;
}

export const pilhaDo = (estagio) => `guerra-${estagio}`;

// Perfil e região sempre explícitos: nada vai parar em outra conta ou outra região por engano.
export const alvo = () => `--profile ${process.env.AWS_PROFILE || 'guerra'} --region ${REGIAO}`;

// execSync com shell: no Windows o SAM é um .cmd, que não roda sem shell.
export function rodar(linha, { capturar = false } = {}) {
  return execSync(linha, {
    stdio: capturar ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
}

export function saidasDaPilha(pilha) {
  const json = rodar(
    `aws cloudformation describe-stacks --stack-name ${pilha} --query "Stacks[0].Outputs" --output json ${alvo()}`,
    { capturar: true },
  );
  return Object.fromEntries(JSON.parse(json).map((s) => [s.OutputKey, s.OutputValue]));
}
