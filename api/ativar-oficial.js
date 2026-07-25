const { auth, db, messaging } = require('../lib/firebaseAdmin');
const { preencherTemplate, TEMPLATES_PADRAO } = require('../lib/templates');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ erro: `Método ${req.method} não permitido` });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '');
    if (!idToken) return res.status(401).json({ erro: 'Não autenticado.' });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ erro: 'Sessão inválida, faz login de novo.' });
    }
    const revId = decoded.uid;

    const { clienteId, planoValor, vencimento } = req.body || {};
    if (!clienteId || !planoValor || !vencimento) {
      return res.status(400).json({ erro: 'clienteId, planoValor e vencimento são obrigatórios' });
    }

    await db.ref(`revendedores/${revId}/clientes/${clienteId}`).update({
      emTeste: false,
      planoValor: Number(planoValor),
      vencimento: Number(vencimento),
      ultimaNotificacao: { tipo: null, data: 0 },
    });

    const clienteSnap = await db.ref(`revendedores/${revId}/clientes/${clienteId}`).once('value');
    const cliente = clienteSnap.val();

    const templatesSnap = await db.ref(`revendedores/${revId}/config/templates`).once('value');
    const templates = templatesSnap.val() || {};

    const corpo = preencherTemplate(templates.msgBemVindoOficial || TEMPLATES_PADRAO.msgBemVindoOficial, cliente, revId, clienteId);

    let pushEnviado = false;
    if (cliente.fcmToken && cliente.notificacaoAtiva) {
      try {
        await messaging.send({
          token: cliente.fcmToken,
          data: {
            title: 'Seu plano foi ativado! ✅',
            body: corpo,
            link: `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${clienteId}`,
          },
        });
        pushEnviado = true;
      } catch (err) {
        console.error('Erro ao enviar push de ativação:', err.message);
      }
    }

    let emailEnviado = false;
    if (cliente.email) {
      try {
        const resultado = await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: cliente.email,
          subject: 'Seu plano foi ativado!',
          text: corpo,
        });
        emailEnviado = !resultado.error;
      } catch (err) {
        console.error('Erro ao enviar e-mail de ativação:', err.message);
      }
    }

    return res.status(200).json({ ok: true, pushEnviado, emailEnviado, cliente, comprovante: corpo });
  } catch (err) {
    console.error('Erro em /api/ativar-oficial:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
