// Service worker for The League web push notifications.
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { /* plain text */ }
    const title = data.title || 'The League';
    const options = {
        body: data.body || '',
        icon: '/favicons/android-chrome-192x192.png',
        badge: '/favicons/favicon-32x32.png',
        data: { url: data.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            for (const w of windows) {
                if (w.url.includes(self.location.origin)) return w.focus();
            }
            return clients.openWindow(url);
        })
    );
});
