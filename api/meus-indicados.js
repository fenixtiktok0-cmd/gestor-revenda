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

    const revendedoresSnap = await db.ref('revendedores').once('value');
    const todos = revendedoresSnap.val() || {};

    const meusIndicados = Object.entries(todos)
      .filter(([, r]) => r.indicadoPor === meuUid)
      .map(([id, r]) => ({
        id,
        nome: r.nome,
        criadoEm: r.criadoEm,
        assinaturaStatus: r.assinaturaStatus,
        pagoAte: r.pagoAte || null,
        testeAte: r.testeAte || null,
      }));

    return res.status(200).json({ indicados: meusIndicados });
  } catch (err) {
    console.error('Erro em /api/meus-indicados:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
