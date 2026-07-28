const { db, messaging } = require('../lib/firebaseAdmin');
const { preencherTemplate, TEMPLATES_PADRAO } = require('../lib/templates');
const { enviarPushSeguro } = require('../lib/pushHelper');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    const revendedoresSnap = await db.ref('revendedores').once('value');
    const revendedores = revendedoresSnap.val() || {};
    const log = { processados: 0, emails: 0, avisosAcabando: 0, avisosAcabou: 0, erros: [] };

    for (const revId of Object.keys(revendedores)) {
      const [clientesSnap, templatesSnap] = await Promise.all([
        db.ref(`revendedores/${revId}/clientes`).once('value'),
        db.ref(`revendedores/${revId}/config/templates`).once('value'),
      ]);
      const clientes = clientesSnap.val() || {};
      const templates = templatesSnap.val() || {};

      for (const [id, cliente] of Object.entries(clientes)) {
        if (!cliente.emTeste) continue;
        log.processados++;

        const horasRestantes = (cliente.vencimento - Date.now()) / (1000 * 60 * 60);
        let tipo = null;
        if (horasRestantes <= 0) tipo = 'testeAcabou';
        else if (horasRestantes <= 1) tipo = 'testeAcabando';
        if (!tipo) continue;

        if (cliente.ultimaNotificacao?.tipo === tipo) continue;

        const templateMsg = tipo === 'testeAcabando'
          ? (templates.msgTesteAcabando || TEMPLATES_PADRAO.msgTesteAcabando)
          : (templates.msgTesteAcabou || TEMPLATES_PADRAO.msgTesteAcabou);
        const corpo = preencherTemplate(templateMsg, cliente, revId, id);

        if (cliente.fcmToken && cliente.notificacaoAtiva) {
          const resultadoPush = await enviarPushSeguro({
            messaging,
            db,
            caminhoRegistro: `revendedores/${revId}/clientes/${id}`,
            token: cliente.fcmToken,
            payload: {
              title: tipo === 'testeAcabando' ? 'Seu teste está acabando!' : 'Seu teste terminou',
              body: corpo,
              link: `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${id}`,
            },
          });
          if (resultadoPush.enviado) {
            if (tipo === 'testeAcabando') log.avisosAcabando++;
            else log.avisosAcabou++;
          } else {
            log.erros.push(`push ${revId}/${id}: ${resultadoPush.motivo}`);
          }
        }

        if (cliente.email) {
          try {
            const resultado = await resend.emails.send({
              from: process.env.RESEND_FROM,
              to: cliente.email,
              subject: tipo === 'testeAcabando' ? 'Seu teste está acabando!' : 'Seu teste terminou',
              text: corpo,
            });
            if (!resultado.error) log.emails++;
          } catch (err) {
            log.erros.push(`email ${revId}/${id}: ${err.message}`);
          }
        }

        await db.ref(`revendedores/${revId}/clientes/${id}/ultimaNotificacao`).set({ tipo, data: Date.now() });
      }
    }

    return res.status(200).json(log);
  } catch (err) {
    console.error('Erro no cron de testes:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
