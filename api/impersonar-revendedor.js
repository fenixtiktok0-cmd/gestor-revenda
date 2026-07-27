const { auth } = require('../lib/firebaseAdmin');

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

    const { revendedorId } = req.body || {};
    if (!revendedorId) return res.status(400).json({ erro: 'revendedorId é obrigatório' });
    if (revendedorId === MASTER_UID) return res.status(400).json({ erro: 'Não faz sentido acessar a própria conta assim.' });

    // Token especial que autentica o navegador do admin COMO se fosse
    // aquele revendedor, só por essa sessão — usado pra suporte de emergência.
    const tokenCustomizado = await auth.createCustomToken(revendedorId, { impersonadoPeloAdmin: true });

    return res.status(200).json({ ok: true, token: tokenCustomizado });
  } catch (err) {
    console.error('Erro em /api/impersonar-revendedor:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
