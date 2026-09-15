self.addEventListener("push", (event) => {
  const fallback = {
    title: "学习日记",
    body: "今天还有学习目标没收尾，打开看一眼。",
    url: "/today",
  };
  let payload = fallback;
  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() || fallback.body };
    }
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/pwa-192.png",
    badge: "/icons/pwa-192.png",
    tag: payload.tag || "study-diary-daily-reminder",
    data: { url: payload.url || "/today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/today", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
