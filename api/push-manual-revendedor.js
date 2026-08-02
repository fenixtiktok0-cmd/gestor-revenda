const { auth, db, messaging } = require('../lib/firebaseAdmin');
const { enviarPushSeguro } = require('../lib/pushHelper');

const MASTER_UID = 'G8SAyrR7fFcslRmSIBUosRwA6QF2';

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
    if (decoded.uid !== MASTER_UID) {
      return res.status(403).json({ erro: 'Só o administrador da plataforma pode fazer isso.' });
    }

    const { revendedorId, mensagem } = req.body || {};
    if (!revendedorId || !mensagem) {
      return res.status(400).json({ erro: 'revendedorId e mensagem são obrigatórios.' });
    }

    const revSnap = await db.ref(`revendedores/${revendedorId}`).once('value');
    const rev = revSnap.val();
    if (!rev) return res.status(404).json({ erro: 'Revendedor não encontrado.' });
    if (!rev.fcmToken || !rev.notificacaoAtiva) {
      return res.status(400).json({ erro: 'Esse revendedor ainda não ativou as notificações dele.' });
    }

    const resultado = await enviarPushSeguro({
      messaging,
      db,
      caminhoRegistro: `revendedores/${revendedorId}`,
      token: rev.fcmToken,
      payload: {
        title: 'Aviso do Zero Block',
        body: mensagem,
        link: `${process.env.APP_URL}/painel.html`,
      },
    });

    if (!resultado.enviado) return res.status(200).json({ ok: false, motivo: resultado.motivo });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/push-manual-revendedor:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
