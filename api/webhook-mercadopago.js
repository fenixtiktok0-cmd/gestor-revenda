const { db } = require('../lib/firebaseAdmin');
const { consultarPagamento, consultarAssinatura } = require('../lib/mercadopago');

function chaveMes(timestamp) {
  const d = new Date(timestamp);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

module.exports = async (req, res) => {
  // O Mercado Pago espera sempre um 200 rápido, mesmo se a gente ainda
  // estiver processando por dentro — por isso respondemos logo no fim,
  // mas sem deixar nada pendurado.
  try {
    const tipo = req.body?.type || req.body?.topic;
    const id = req.body?.data?.id || req.body?.resource;

    if (!tipo || !id) {
      return res.status(200).json({ ok: true, ignorado: true });
    }

    if (tipo === 'payment') {
      const pagamento = await consultarPagamento(id);
      if (pagamento.status !== 'approved') {
        return res.status(200).json({ ok: true, ignorado: 'pagamento não aprovado' });
      }

      const revId = pagamento.external_reference;
      if (!revId) return res.status(200).json({ ok: true, ignorado: 'sem referência' });

      const revendedorSnap = await db.ref(`revendedores/${revId}`).once('value');
      const revendedor = revendedorSnap.val();
      if (!revendedor) return res.status(200).json({ ok: true, ignorado: 'revendedor não encontrado' });

      // Evita processar o mesmo pagamento duas vezes
      const jaProcessadoSnap = await db.ref(`revendedores/${revId}/pagamentos`)
        .orderByChild('mpPaymentId').equalTo(String(pagamento.id)).once('value');
      if (jaProcessadoSnap.exists()) {
        return res.status(200).json({ ok: true, ignorado: 'já processado' });
      }

      const valorPago = pagamento.transaction_amount;

      await db.ref(`revendedores/${revId}`).update({
        assinaturaStatus: 'ativa',
        ultimoPagamento: Date.now(),
      });

      await db.ref(`revendedores/${revId}/pagamentos`).push({
        mpPaymentId: String(pagamento.id),
        valor: valorPago,
        data: Date.now(),
        mesReferencia: chaveMes(Date.now()),
      });

      // Calcula a comissão pra quem indicou (só 1 nível, sem cascata)
      if (revendedor.indicadoPor) {
        const configSnap = await db.ref('configPlataforma').once('value');
        const configPlataforma = configSnap.val() || {};
        const percentual = configPlataforma.comissaoPercentual ?? 40;
        const valorComissao = valorPago * (percentual / 100);

        await db.ref('comissoes').push({
          revendedorId: revendedor.indicadoPor,
          indicadoId: revId,
          indicadoNome: revendedor.nome,
          valor: valorComissao,
          status: 'pendente',
          mesReferencia: chaveMes(Date.now()),
          data: Date.now(),
          dataPagamento: null,
        });
      }

      return res.status(200).json({ ok: true, processado: true });
    }

    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      const assinatura = await consultarAssinatura(id);
      const revId = assinatura.external_reference;
      if (revId) {
        await db.ref(`revendedores/${revId}`).update({
          assinaturaStatus: assinatura.status === 'authorized' ? 'ativa' : assinatura.status,
        });
      }
      return res.status(200).json({ ok: true, processado: true });
    }

    return res.status(200).json({ ok: true, ignorado: 'tipo não tratado' });
  } catch (err) {
    console.error('Erro no webhook do Mercado Pago:', err.detalhes || err);
    // Mesmo com erro, devolve 200 pra evitar o MP ficar reenviando em loop
    // enquanto a gente investiga pelo log.
    return res.status(200).json({ ok: false, erro: 'erro interno registrado no log' });
  }
};
