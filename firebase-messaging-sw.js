/* firebase-messaging-sw.js — MUST live at site root for scope */
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC74YFnCKeO5TjmPa4H4BMm_pFwohOVAX4",
  authDomain: "store-dashboard-2025.firebaseapp.com",
  projectId: "store-dashboard-2025",
  storageBucket: "store-dashboard-2025.firebasestorage.app",
  messagingSenderId: "556566448299",
  appId: "1:556566448299:web:a2cbe4dda5d21fc6c5cfee"
});

const messaging = firebase.messaging();

// Handle background notifications (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'New Message', {
    body: body || 'You have a new message',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.channel || 'chat',          // collapse same-channel notifications
    renotify: true,                        // vibrate even if tag matches
    data: { url: data.link || '/' }
  });
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes('store-dashboard-2025') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
