const { db, messaging } = require('../lib/firebaseAdmin');
const { consultarPagamento, consultarAssinatura } = require('../lib/mercadopago');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const MASTER_UID = 'G8SAyrR7fFcslRmSIBUosRwA6QF2';

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

      if (pagamento.status === 'rejected' || pagamento.status === 'cancelled') {
        const revId = pagamento.external_reference;
        if (!revId) return res.status(200).json({ ok: true, ignorado: 'sem referência' });

        const revendedorSnap = await db.ref(`revendedores/${revId}`).once('value');
        const revendedor = revendedorSnap.val();
        if (!revendedor) return res.status(200).json({ ok: true, ignorado: 'revendedor não encontrado' });

        // Evita avisar duas vezes o mesmo pagamento recusado
        const jaAvisadoSnap = await db.ref(`revendedores/${revId}/pagamentosRecusados`)
          .orderByChild('mpPaymentId').equalTo(String(pagamento.id)).once('value');
        if (jaAvisadoSnap.exists()) {
          return res.status(200).json({ ok: true, ignorado: 'já avisado' });
        }

        await db.ref(`revendedores/${revId}/pagamentosRecusados`).push({
          mpPaymentId: String(pagamento.id),
          data: Date.now(),
          motivo: pagamento.status_detail || pagamento.status,
        });

        const corpo = `Olá ${revendedor.nome || ''}! Seu pagamento da mensalidade não foi aprovado (motivo: ${pagamento.status_detail || pagamento.status}). Tenta de novo pelo painel — com cartão ou PIX — pra não perder o acesso.`;

        if (revendedor.email) {
          try {
            await resend.emails.send({
              from: process.env.RESEND_FROM,
              to: revendedor.email,
              subject: '⚠️ Seu pagamento não foi aprovado',
              text: corpo,
            });
          } catch (err) {
            console.error('Erro ao enviar e-mail de pagamento recusado:', err.message);
          }
        }

        if (revendedor.fcmToken && revendedor.notificacaoAtiva) {
          try {
            await messaging.send({
              token: revendedor.fcmToken,
              data: {
                title: '⚠️ Pagamento não aprovado',
                body: corpo,
                link: `${process.env.APP_URL}/index.html`,
              },
            });
          } catch (err) {
            console.error('Erro ao enviar push de pagamento recusado:', err.message);
          }
        }

        return res.status(200).json({ ok: true, avisado: true });
      }

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
      const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

      await db.ref(`revendedores/${revId}`).update({
        assinaturaStatus: 'ativa',
        ultimoPagamento: Date.now(),
        pagoAte: Date.now() + TRINTA_DIAS,
      });

      await db.ref(`revendedores/${revId}/pagamentos`).push({
        mpPaymentId: String(pagamento.id),
        valor: valorPago,
        data: Date.now(),
        mesReferencia: chaveMes(Date.now()),
      });

      // Calcula a comissão pra quem indicou (só 1 nível, sem cascata)
      // Comissão só existe quando quem indicou é OUTRO revendedor — se foi
      // o próprio admin (dono da plataforma) que indicou, o dinheiro já é
      // 100% dele, não tem "comissão" nenhuma a repassar.
      if (revendedor.indicadoPor && revendedor.indicadoPor !== MASTER_UID) {
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
        if (assinatura.status === 'authorized') {
          // Assinatura autorizada — o pagamento em si (que libera de fato
          // o acesso e define o pagoAte) chega separado, pelo evento de
          // "payment". Aqui só marcamos que a autorização está de pé.
          await db.ref(`revendedores/${revId}`).update({ assinaturaAutorizada: true });
        } else {
          // Cancelou/pausou: NÃO cortamos o acesso na hora. O pagoAte que
          // ele já tinha continua valendo até o fim do período — só
          // registramos que não vai renovar sozinho de novo.
          await db.ref(`revendedores/${revId}`).update({
            assinaturaAutorizada: false,
            assinaturaCanceladaEm: Date.now(),
          });
        }
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
