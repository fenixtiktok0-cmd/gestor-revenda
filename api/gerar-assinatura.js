const { auth, db } = require('../lib/firebaseAdmin');
const { criarAssinatura } = require('../lib/mercadopago');

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

    const revendedorSnap = await db.ref(`revendedores/${revId}`).once('value');
    const revendedor = revendedorSnap.val();
    if (!revendedor) return res.status(404).json({ erro: 'Revendedor não encontrado.' });

    const configSnap = await db.ref('configPlataforma').once('value');
    const configPlataforma = configSnap.val() || {};
    const valor = configPlataforma.mensalidadeValor || 19.90;

    const { assinaturaId, linkCheckout } = await criarAssinatura({
      revendedorId: revId,
      email: revendedor.email,
      valor,
      nomePlano: 'Assinatura do painel de revenda',
    });

    await db.ref(`revendedores/${revId}`).update({
      assinaturaId,
      assinaturaStatus: 'pendente',
    });

    return res.status(200).json({ ok: true, linkCheckout });
  } catch (err) {
    console.error('Erro em /api/gerar-assinatura:', err.detalhes || err);
    return res.status(500).json({ erro: 'Erro ao gerar assinatura no Mercado Pago.' });
  }
};
