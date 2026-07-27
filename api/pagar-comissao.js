const { auth, db, messaging } = require('../lib/firebaseAdmin');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
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
      return res.status(403).json({ erro: 'Só o administrador da plataforma pode confirmar pagamentos.' });
    }

    const { revendedorId, codigoPix } = req.body || {};
    if (!revendedorId) return res.status(400).json({ erro: 'revendedorId é obrigatório' });

    const comissoesSnap = await db.ref('comissoes').once('value');
    const todasComissoes = comissoesSnap.val() || {};
    const pendentes = Object.entries(todasComissoes).filter(
      ([, c]) => c.revendedorId === revendedorId && c.status === 'pendente'
    );

    if (pendentes.length === 0) {
      return res.status(400).json({ erro: 'Não há comissões pendentes pra esse revendedor.' });
    }

    const totalPago = pendentes.reduce((s, [, c]) => s + c.valor, 0);

    await Promise.all(pendentes.map(([id]) =>
      db.ref(`comissoes/${id}`).update({
        status: 'pago',
        dataPagamento: Date.now(),
        codigoPix: codigoPix || null,
      })
    ));

    const revendedorSnap = await db.ref(`revendedores/${revendedorId}`).once('value');
    const revendedor = revendedorSnap.val() || {};

    const corpo = `Olá ${revendedor.nome || ''}! Sua comissão de indicação no valor de R$ ${totalPago.toFixed(2)} foi paga. Obrigado por fazer parte da nossa rede!`;

    let emailEnviado = false;
    if (revendedor.email) {
      try {
        const resultado = await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: revendedor.email,
          subject: 'Sua comissão foi paga! 💰',
          text: corpo,
        });
        emailEnviado = !resultado.error;
      } catch (err) {
        console.error('Erro ao enviar e-mail de comissão paga:', err.message);
      }
    }

    let pushEnviado = false;
    if (revendedor.fcmToken && revendedor.notificacaoAtiva) {
      try {
        await messaging.send({
          token: revendedor.fcmToken,
          data: {
            title: 'Sua comissão foi paga! 💰',
            body: corpo,
            link: `${process.env.APP_URL}/index.html`,
          },
        });
        pushEnviado = true;
      } catch (err) {
        console.error('Erro ao enviar push de comissão paga:', err.message);
      }
    }

    return res.status(200).json({
      ok: true,
      quantidade: pendentes.length,
      totalPago,
      emailEnviado,
      pushEnviado,
    });
  } catch (err) {
    console.error('Erro em /api/pagar-comissao:', err);
    return res.status(500).json({ erro: 'Erro interno' });
  }
};
