const { admin, db, auth } = require('../lib/firebaseAdmin');

// Só esse UID (o dono da plataforma) pode criar revendedores novos.
const MASTER_UID = 'G8SAyrR7fFcslRmSIBUosRwA6QF2';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ erro: `Método ${req.method} não permitido` });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ erro: 'Sessão inválida, faz login de novo.' });
    }

    if (decoded.uid !== MASTER_UID) {
      return res.status(403).json({ erro: 'Só o administrador da plataforma pode criar revendedores.' });
    }

    const { nome, email, senha } = req.body || {};
    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
    }

    const novoUsuario = await auth.createUser({
      email,
      password: senha,
      displayName: nome,
    });

    await db.ref(`revendedores/${novoUsuario.uid}`).set({
      nome,
      email,
      criadoEm: Date.now(),
      ativo: true,
    });

    return res.status(200).json({ ok: true, uid: novoUsuario.uid });
  } catch (err) {
    console.error('Erro em /api/criar-revendedor:', err);
    let mensagem = 'Erro interno ao criar revendedor.';
    if (err.code === 'auth/email-already-exists') mensagem = 'Já existe uma conta com esse e-mail.';
    if (err.code === 'auth/invalid-email') mensagem = 'E-mail inválido.';
    return res.status(500).json({ erro: mensagem });
  }
};
