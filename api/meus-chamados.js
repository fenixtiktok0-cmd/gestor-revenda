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
      return res.status(401).json({ erro: 'Sessão inválida, faz login de novo.' });
    }
    const meuUid = decoded.uid;

    const chamadosSnap = await db.ref('chamados').once('value');
    const todos = chamadosSnap.val() || {};

    const meus = Object.entries(todos)
      .filter(([, c]) => c.revendedorId === meuUid)
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => b.criadoEm - a.criadoEm);

    return res.status(200).json({ chamados: meus });
  } catch (err) {
    console.error('Erro em /api/meus-chamados:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
