export default {
  fetch(request, env) {
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
