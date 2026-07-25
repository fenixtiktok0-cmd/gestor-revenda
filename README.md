# Painel de Revenda — em construção

Sistema multi-revendedor: cada revendedor loga com a própria conta e só
enxerga os próprios clientes/dados. Construído do zero, separado do
sistema atual (gestao-clientes), sem nenhum risco pro que já está em produção.

## Onde estamos (Fase 1 — concluída)
- [x] Projeto Firebase criado (`gestor-revenda-a0e61`) com Authentication (e-mail/senha) ativado
- [x] Tela de login (`public/login.html`)
- [x] Painel mínimo pós-login, só confirmando que a autenticação funciona (`public/index.html`)

## Próximos passos (Fase 2)
- [ ] Subir esses arquivos no GitHub → conectar na Vercel → testar login de ponta a ponta
- [ ] Criar sua primeira conta de revendedor de teste (manualmente, no Firebase Console → Authentication → Add user)
- [ ] Criar o nó `/revendedores/{uid}` correspondente no Realtime Database
- [ ] Portar o cadastro de clientes (a primeira funcionalidade de verdade)

## Como criar um revendedor de teste agora
1. Firebase Console → Authentication → Users → "Add user"
2. Preenche e-mail + senha
3. Copia o UID gerado
4. Realtime Database → Dados → cria manualmente:
   ```
   /revendedores/{UID_COPIADO}/nome = "Teste"
   /revendedores/{UID_COPIADO}/email = "mesmo e-mail usado no Authentication"
   /revendedores/{UID_COPIADO}/criadoEm = (timestamp em ms, ex: 1732900000000)
   /revendedores/{UID_COPIADO}/ativo = true
   ```

## Deploy
Mesmo processo do sistema atual: adicionar variáveis de ambiente na Vercel
(`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`FIREBASE_DATABASE_URL`) quando começarmos a construir os endpoints de backend.
Por enquanto (só login), não precisa de nenhuma variável — tudo roda direto
no navegador com o Firebase client SDK.
