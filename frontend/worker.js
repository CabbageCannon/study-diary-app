export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return fetch(new Request(new URL(`${url.pathname}${url.search}`, env.BACKEND_URL), request));
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env) {
    const response = await fetch(`${env.BACKEND_URL}/api/reminders/dispatch`, {
      method: "POST",
      headers: { "X-Reminder-Cron": env.REMINDER_CRON_SECRET },
    });
    if (!response.ok) throw new Error(`Reminder dispatch failed: ${response.status}`);
  },
};
