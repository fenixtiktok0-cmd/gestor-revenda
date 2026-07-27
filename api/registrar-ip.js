const { auth, db } = require('../lib/firebaseAdmin');

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
      return res.status(401).json({ erro: 'Sessão inválida.' });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
    if (ip) {
      await db.ref(`revendedores/${decoded.uid}/cadastroIp`).set(ip);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/registrar-ip:', err);
    return res.status(200).json({ ok: false }); // nunca trava o cadastro por causa disso
  }
};
