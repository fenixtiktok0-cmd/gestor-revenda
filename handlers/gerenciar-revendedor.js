const { auth, db } = require('../lib/firebaseAdmin');

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

    const { acao, revendedorId, nome, email, whatsapp, pagoAte } = req.body || {};
    if (!acao || !revendedorId) {
      return res.status(400).json({ erro: 'acao e revendedorId são obrigatórios.' });
    }
    if (revendedorId === MASTER_UID) {
      return res.status(400).json({ erro: 'Não dá pra editar/excluir a própria conta admin por aqui.' });
    }

    if (acao === 'editar') {
      if (!nome || !email) return res.status(400).json({ erro: 'nome e email são obrigatórios.' });

      await auth.updateUser(revendedorId, { email, displayName: nome });
      await db.ref(`revendedores/${revendedorId}`).update({ nome, email, whatsapp: whatsapp || null });

      return res.status(200).json({ ok: true });
    }

    if (acao === 'ativar-manual') {
      if (!pagoAte) return res.status(400).json({ erro: 'pagoAte é obrigatório.' });

      await db.ref(`revendedores/${revendedorId}`).update({
        assinaturaStatus: 'ativa',
        pagoAte,
        ativadoManualmente: true,
        ativadoManualmenteEm: Date.now(),
      });

      return res.status(200).json({ ok: true });
    }

    if (acao === 'excluir') {
      try {
        await auth.deleteUser(revendedorId);
      } catch (err) {
        // Se a conta de login já não existir mais, seguimos e limpamos os dados mesmo assim.
        if (err.code !== 'auth/user-not-found') throw err;
      }
      await db.ref(`revendedores/${revendedorId}`).remove();

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ erro: 'Ação inválida.' });
  } catch (err) {
    console.error('Erro em /api/gerenciar-revendedor:', err);
    let mensagem = 'Erro interno.';
    if (err.code === 'auth/email-already-exists') mensagem = 'Já existe uma conta com esse e-mail.';
    if (err.code === 'auth/invalid-email') mensagem = 'E-mail inválido.';
    return res.status(500).json({ erro: mensagem });
  }
};
