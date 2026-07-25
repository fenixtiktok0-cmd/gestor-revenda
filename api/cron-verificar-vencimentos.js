const { db, messaging } = require('../lib/firebaseAdmin');
const { preencherTemplate, TEMPLATES_PADRAO } = require('../lib/templates');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const UM_DIA = 1000 * 60 * 60 * 24;

function diasAte(timestampVencimento) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(timestampVencimento); venc.setHours(0, 0, 0, 0);
  return Math.round((venc - hoje) / UM_DIA);
}

module.exports = async (req, res) => {
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    const revendedoresSnap = await db.ref('revendedores').once('value');
    const revendedores = revendedoresSnap.val() || {};
    const hojeStr = new Date().toDateString();

    const log = { revendedoresProcessados: 0, clientesProcessados: 0, emails: 0, erros: [] };

    for (const revId of Object.keys(revendedores)) {
      log.revendedoresProcessados++;

      const [clientesSnap, templatesSnap] = await Promise.all([
        db.ref(`revendedores/${revId}/clientes`).once('value'),
        db.ref(`revendedores/${revId}/config/templates`).once('value'),
      ]);
      const clientes = clientesSnap.val() || {};
      const templates = templatesSnap.val() || {};

      for (const [id, cliente] of Object.entries(clientes)) {
        if (cliente.emTeste) continue;
        log.clientesProcessados++;

        const dias = diasAte(cliente.vencimento);
        let tipo = null;
        if (dias === 7) tipo = '7dias';
        else if (dias === 3) tipo = '3dias';
        else if (dias === 0) tipo = 'vencimento';
        else if (dias === -3) tipo = 'vencido';
        if (!tipo) continue;

        const jaEnviadoHoje =
          cliente.ultimaNotificacao?.tipo === tipo &&
          new Date(cliente.ultimaNotificacao?.data || 0).toDateString() === hojeStr;
        if (jaEnviadoHoje) continue;

        const mapaTemplate = {
          '7dias': templates.msg7dias || TEMPLATES_PADRAO.msg7dias,
          '3dias': templates.msg3dias || TEMPLATES_PADRAO.msg3dias,
          vencimento: templates.msgVencimento || TEMPLATES_PADRAO.msgVencimento,
          vencido: templates.msgVencido || TEMPLATES_PADRAO.msgVencido,
        };
        const corpo = preencherTemplate(mapaTemplate[tipo], cliente, revId, id);

        if (cliente.fcmToken && cliente.notificacaoAtiva) {
          try {
            await messaging.send({
              token: cliente.fcmToken,
              data: {
                title: 'Aviso sobre seu plano',
                body: corpo,
                link: `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${id}`,
              },
            });
          } catch (err) {
            log.erros.push(`push ${revId}/${id}: ${err.message}`);
          }
        }

        if (cliente.email) {
          try {
            const resultado = await resend.emails.send({
              from: process.env.RESEND_FROM,
              to: cliente.email,
              subject: preencherTemplate(templates.emailAssunto || TEMPLATES_PADRAO.emailAssunto, cliente, revId, id),
              text: preencherTemplate(templates.emailCorpo || TEMPLATES_PADRAO.emailCorpo, cliente, revId, id),
            });
            if (resultado.error) {
              log.erros.push(`email ${revId}/${id}: ${resultado.error.message}`);
            } else {
              log.emails++;
            }
          } catch (err) {
            log.erros.push(`email ${revId}/${id}: ${err.message}`);
          }
        }

        await db.ref(`revendedores/${revId}/clientes/${id}/ultimaNotificacao`).set({ tipo, data: Date.now() });
      }
    }

    return res.status(200).json(log);
  } catch (err) {
    console.error('Erro no cron:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
