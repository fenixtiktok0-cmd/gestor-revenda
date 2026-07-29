const { auth, db, messaging } = require('../lib/firebaseAdmin');
const { preencherTemplate, TEMPLATES_PADRAO } = require('../lib/templates');
const { enviarPushSeguro } = require('../lib/pushHelper');
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

    const { clienteId, mensagemCustom } = req.body || {};
    if (!clienteId) return res.status(400).json({ erro: 'clienteId é obrigatório' });

    const clienteSnap = await db.ref(`revendedores/${revId}/clientes/${clienteId}`).once('value');
    const cliente = clienteSnap.val();
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });

    const configSnap = await db.ref(`revendedores/${revId}/config/templates`).once('value');
    const templates = configSnap.val() || {};

    const corpo = mensagemCustom
      ? preencherTemplate(mensagemCustom, cliente, revId, clienteId)
      : preencherTemplate(templates.msgManual || TEMPLATES_PADRAO.msgManual, cliente, revId, clienteId);

    let pushEnviado = false;
    let pushMotivo = 'sem token FCM';
    if (cliente.fcmToken) {
      const resultado = await enviarPushSeguro({
        messaging,
        db,
        caminhoRegistro: `revendedores/${revId}/clientes/${clienteId}`,
        token: cliente.fcmToken,
        payload: {
          title: 'Aviso sobre seu plano',
          body: corpo,
          link: `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${clienteId}`,
        },
      });
      pushEnviado = resultado.enviado;
      pushMotivo = resultado.tokenInvalido ? 'token expirado — notificação desativada, cliente precisa ativar de novo' : (resultado.motivo || null);
    }

    let emailEnviado = false;
    let emailMotivo = 'cliente não tem e-mail cadastrado';
    if (cliente.email) {
      try {
        const resultadoEmail = await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: cliente.email,
          subject: preencherTemplate(templates.emailAssunto || TEMPLATES_PADRAO.emailAssunto, cliente, revId, clienteId),
          text: corpo,
        });
        emailEnviado = !resultadoEmail.error;
        emailMotivo = emailEnviado ? null : (resultadoEmail.error?.message || 'falha ao enviar pelo provedor de e-mail');
      } catch (err) {
        console.error('Erro ao enviar e-mail manual:', err.message);
        emailMotivo = 'erro inesperado ao tentar enviar';
      }
    }

    if (pushEnviado || emailEnviado) {
      await db.ref(`revendedores/${revId}/clientes/${clienteId}/ultimaNotificacao`).set({ tipo: 'manual', data: Date.now() });
    }

    return res.status(200).json({ ok: true, enviado: pushEnviado || emailEnviado, pushEnviado, emailEnviado, motivo: pushMotivo, emailMotivo });
  } catch (err) {
    console.error('Erro em /api/notificar-manual:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
