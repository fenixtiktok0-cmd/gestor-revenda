# Schema — Painel de Revenda

Diferença fundamental pro sistema atual (gestao-clientes): aqui, TUDO fica
dentro de uma "gaveta" por revendedor, identificada pelo UID dele no
Firebase Authentication.

```
/revendedores/{uid}
  nome: string
  email: string
  criadoEm: number
  ativo: boolean          // você (admin master) pode desativar um revendedor

  config/
    whatsappAdmin: string
    apkLink, webLink, musicaApiBase (se revender música também)
    marca: { nome, logoUrl, corPrimaria, textoBotaoNotificacao, textoBotaoSuporte }
    templates: { msg7dias, msg3dias, ... } — mesma estrutura de hoje

  clientes/{id}
    (mesma estrutura do sistema atual: nome, usuario, senha, whatsapp,
    email, servidor, aplicativosIds, planoValor, vencimento, emTeste,
    musica, fcmToken, notificacaoAtiva, ultimaNotificacao, ...)

  servidores/{id}
  aplicativos/{id}
  financeiro/{id}
```

## Autenticação
- Login via Firebase Authentication (e-mail/senha)
- O UID do revendedor logado = a chave de tudo que ele acessa
- Regras do Realtime Database (aplicar antes de ir pra produção):
  ```json
  {
    "rules": {
      "revendedores": {
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    }
  }
  ```

## Como um revendedor novo é criado
Por enquanto (fase inicial), você (admin) cria a conta manualmente no
Firebase Authentication + cria o nó `/revendedores/{uid}` correspondente.
Mais pra frente dá pra automatizar isso com uma tela de "criar revendedor".
