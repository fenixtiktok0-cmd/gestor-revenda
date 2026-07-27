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

    const comissoesSnap = await db.ref('comissoes').once('value');
    const todas = comissoesSnap.val() || {};

    const minhas = Object.entries(todas)
      .filter(([, c]) => c.revendedorId === meuUid)
      .map(([id, c]) => ({ id, ...c }));

    return res.status(200).json({ comissoes: minhas });
  } catch (err) {
    console.error('Erro em /api/minhas-comissoes:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
