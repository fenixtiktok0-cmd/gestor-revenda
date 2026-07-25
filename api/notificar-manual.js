const { auth, db, messaging } = require('../lib/firebaseAdmin');
const { preencherTemplate } = require('../lib/templates');

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
    if (!cliente.fcmToken) return res.status(200).json({ ok: true, enviado: false, motivo: 'sem token FCM' });

    const configSnap = await db.ref(`revendedores/${revId}/config/templates`).once('value');
    const templates = configSnap.val() || {};

    const corpo = mensagemCustom
      ? preencherTemplate(mensagemCustom, cliente, revId, clienteId)
      : preencherTemplate(templates.msgManual, cliente, revId, clienteId);

    try {
      await messaging.send({
        token: cliente.fcmToken,
        data: {
          title: 'Aviso sobre seu plano',
          body: corpo,
          link: `${process.env.APP_URL}/meu-plano.html?rev=${revId}&id=${clienteId}`,
        },
      });
      await db.ref(`revendedores/${revId}/clientes/${clienteId}/ultimaNotificacao`).set({ tipo: 'manual', data: Date.now() });
      return res.status(200).json({ ok: true, enviado: true });
    } catch (err) {
      return res.status(200).json({ ok: true, enviado: false, motivo: err.message });
    }
  } catch (err) {
    console.error('Erro em /api/notificar-manual:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
