function formatarData(timestamp) {
  return new Date(timestamp).toLocaleDateString('pt-BR');
}

function preencherTemplate(template, cliente, revId, clienteId) {
  const diasRestantes = Math.ceil(
    (cliente.vencimento - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const link = (revId && clienteId)
    ? `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${clienteId}`
    : '';

  return (template || '')
    .replaceAll('{nome}', cliente.nome || '')
    .replaceAll('{data_vencimento}', formatarData(cliente.vencimento))
    .replaceAll('{valor_plano}', (cliente.planoValor || 0).toFixed(2))
    .replaceAll('{servidor}', cliente.servidor || '')
    .replaceAll('{dias_restantes}', String(diasRestantes))
    .replaceAll('{link}', link);
}

const TEMPLATES_PADRAO = {
  msg7dias: 'Olá {nome}! Passando pra lembrar que seu plano vence em {dias_restantes} dias ({data_vencimento}). Valor: R$ {valor_plano}.',
  msg3dias: 'Olá {nome}! Seu plano vence em {dias_restantes} dias ({data_vencimento}). Valor: R$ {valor_plano}. Quer renovar agora?',
  msgVencimento: 'Olá {nome}! Seu plano vence hoje ({data_vencimento}). Valor: R$ {valor_plano}. Renova pra não perder o acesso?',
  msgVencido: 'Olá {nome}! Seu plano venceu em {data_vencimento} e está com pagamento pendente. Valor: R$ {valor_plano}. Vamos regularizar hoje pra não perder o acesso?',
  msgManual: 'Olá {nome}! Passando aqui sobre o seu plano, vencimento em {data_vencimento}. Qualquer coisa me chama!',
  msgTesteAcabando: 'Olá {nome}! Seu teste está acabando em breve. Gostou? Fala com a gente pra virar cliente oficial!',
  msgTesteAcabou: 'Olá {nome}! Seu teste terminou. Fala com a gente pra ativar seu plano oficial!',
  msgBemVindoOficial: 'Olá {nome}! Seu plano foi ativado com sucesso ✅\nVencimento: {data_vencimento}\nValor: R$ {valor_plano}\nSeja bem-vindo(a)!',
  emailAssunto: 'Seu plano vence em breve',
  emailCorpo: 'Olá {nome},\n\nSeu plano vence em {data_vencimento}. Valor: R$ {valor_plano}.\n\nQualquer dúvida, chama no WhatsApp.',
};

module.exports = { preencherTemplate, TEMPLATES_PADRAO, formatarData };
