// Utilidades compartilhadas pelas três páginas. Sem framework: o celular baixa poucos KB.
const Guerra = (() => {
  // Diferença servidor − celular. Só é recalculada com respostas que não vieram do cache
  // do CloudFront (calibrar: true), para o cronômetro bater em todas as telas.
  let desvio = 0;
  let melhorIda = Infinity;

  async function api(caminho, { calibrar = false, token, ...opcoes } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-admin-token'] = token;
    const antes = Date.now();
    const r = await fetch(caminho, { ...opcoes, headers });
    const depois = Date.now();
    const corpo = await r.json().catch(() => ({}));
    if (calibrar && corpo.agoraServidor) {
      const ida = (depois - antes) / 2;
      // Prefere a medição com a rede mais rápida (menos incerteza), mas aceita novas de tempos em tempos.
      if (ida <= melhorIda * 1.5) {
        melhorIda = Math.min(melhorIda, ida);
        desvio = corpo.agoraServidor + ida - depois;
      }
    }
    if (!r.ok) throw Object.assign(new Error(corpo.erro || `HTTP ${r.status}`), { status: r.status });
    return corpo;
  }

  const agora = () => Date.now() + desvio;
  const segundosAte = (instante) => Math.max(0, Math.ceil((instante - agora()) / 1000));
  const numero = (n) => (n ?? 0).toLocaleString('pt-BR');

  const NOMES = { laranja: 'Laranja Lambda', verde: 'Verde DynamoDB' };

  return { api, agora, segundosAte, numero, NOMES };
})();
