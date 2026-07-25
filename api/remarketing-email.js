const { auth, db } = require('../lib/firebaseAdmin');
const { preencherTemplate } = require('../lib/templates');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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

    const { clienteIds, assunto, corpo } = req.body || {};
    if (!Array.isArray(clienteIds) || clienteIds.length === 0) {
      return res.status(400).json({ erro: 'clienteIds é obrigatório (array)' });
    }
    if (!corpo) return res.status(400).json({ erro: 'corpo é obrigatório' });

    const resultados = [];
    for (const id of clienteIds) {
      const snap = await db.ref(`revendedores/${revId}/clientes/${id}`).once('value');
      const cliente = snap.val();
      if (!cliente || !cliente.email) {
        resultados.push({ id, enviado: false, motivo: 'sem e-mail' });
        continue;
      }
      try {
        const resultado = await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: cliente.email,
          subject: preencherTemplate(assunto || 'Oferta especial', cliente, revId, id),
          text: preencherTemplate(corpo, cliente, revId, id),
        });
        resultados.push({ id, enviado: !resultado.error, motivo: resultado.error?.message });
      } catch (err) {
        resultados.push({ id, enviado: false, motivo: err.message });
      }
    }

    return res.status(200).json({ resultados });
  } catch (err) {
    console.error('Erro em /api/remarketing-email:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
