'use strict';
// Keep the existing endpoints through explicit Vercel rewrites.
// Each handler retains its own method, authentication and role checks.
const handlers = {
  'criar-revendedor': () => require('../handlers/criar-revendedor'),
  'gerenciar-revendedor': () => require('../handlers/gerenciar-revendedor'),
  'impersonar-revendedor': () => require('../handlers/impersonar-revendedor'),
  'pagar-comissao': () => require('../handlers/pagar-comissao'),
  'push-manual-revendedor': () => require('../handlers/push-manual-revendedor'),
  'meus-chamados': () => require('../handlers/meus-chamados'),
  'meus-indicados': () => require('../handlers/meus-indicados'),
  'minhas-comissoes': () => require('../handlers/minhas-comissoes'),
};
module.exports = async (req,res) => {
  const name = req.query && req.query.operacao;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(handlers,name)) {
    return res.status(404).json({erro:'Rota não encontrada.'});
  }
  return handlers[name]()(req,res);
};
