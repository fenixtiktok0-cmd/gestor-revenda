importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD_hPyEcvWiJ_XqwwbeDvFkUYWL2Rdk-5Y",
  authDomain: "gestor-revenda-a0e61.firebaseapp.com",
  databaseURL: "https://gestor-revenda-a0e61-default-rtdb.firebaseio.com",
  projectId: "gestor-revenda-a0e61",
  storageBucket: "gestor-revenda-a0e61.firebasestorage.app",
  messagingSenderId: "1026444053849",
  appId: "1:1026444053849:web:4590233bd375d70a139048"
});

const messaging = firebase.messaging();

// Assumimos o controle total da notificação em segundo plano — garante
// que o link customizado chega certinho até o clique (inclusive links
// externos como WhatsApp), sem depender do comportamento padrão do Chrome.
messaging.onBackgroundMessage(function (payload) {
  const titulo = payload.data?.title || 'Aviso';
  const opcoes = {
    body: payload.data?.body || '',
    data: { link: payload.data?.link || '' },
  };
  return self.registration.showNotification(titulo, opcoes);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const link = event.notification?.data?.link;
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});
