/* Handlers de Web Push, importados pelo service worker gerado pelo Workbox
   (workbox.importScripts em vite.config.ts). Mantém a lógica de push separada
   do SW de cache para não depender da estratégia de build. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Contabilidade Alves', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Contabilidade Alves';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'ca-notify',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        // Já há uma janela do app aberta → foca e navega.
        if ('focus' in client) {
          try {
            await client.navigate(targetUrl);
          } catch (_e) {
            /* navigate pode falhar em cross-origin; segue para focus */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })(),
  );
});
