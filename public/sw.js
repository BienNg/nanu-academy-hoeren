/* Installability, plus the evening streak reminder. Requests stay on the network. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let payload = {
    title: "NaNu Go",
    body: "Một phần nữa là giữ được.",
    url: "/",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* keep the fallback copy */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon",
      badge: "/icon",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (!client.url.startsWith(self.location.origin) || !("focus" in client)) continue;
        return client.focus().then((focused) => {
          if (focused && "navigate" in focused && typeof focused.navigate === "function") {
            return focused.navigate(url);
          }
          return self.clients.openWindow(url);
        });
      }
      return self.clients.openWindow(url);
    }),
  );
});
