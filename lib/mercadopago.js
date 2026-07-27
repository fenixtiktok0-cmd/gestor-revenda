// Integração com o Mercado Pago — assinatura recorrente (preapproval).
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/subscriptions

const MP_API = 'https://api.mercadopago.com';

async function mpFetch(caminho, opcoes = {}) {
  const resposta = await fetch(`${MP_API}${caminho}`, {
    ...opcoes,
    headers: {
      'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    const erro = new Error(dados.message || 'Erro na API do Mercado Pago');
    erro.detalhes = dados;
    throw erro;
  }
  return dados;
}

// Cria uma assinatura recorrente (o revendedor autoriza uma vez, e o MP
// cobra sozinho todo mês a partir daí). Retorna o link de checkout.
async function criarAssinatura({ revendedorId, email, valor, nomePlano }) {
  const payload = {
    reason: nomePlano || 'Assinatura do painel',
    external_reference: revendedorId,
    payer_email: email,
    back_url: `${process.env.APP_URL}/index.html`,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: Number(valor),
      currency_id: 'BRL',
    },
    status: 'pending',
  };

  const resultado = await mpFetch('/preapproval', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    assinaturaId: resultado.id,
    linkCheckout: resultado.init_point,
  };
}

async function consultarAssinatura(assinaturaId) {
  return mpFetch(`/preapproval/${assinaturaId}`);
}

async function consultarPagamento(pagamentoId) {
  return mpFetch(`/v1/payments/${pagamentoId}`);
}

module.exports = { criarAssinatura, consultarAssinatura, consultarPagamento };
