import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export async function notifyMilestone(minutes: number, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const granted = await isPermissionGranted();
  const permission = granted ? "granted" : await requestPermission();
  if (permission === "granted") {
    sendNotification({ title: "学习桌宠", body: `已专注学习 ${minutes} 分钟，继续保持。` });
  }
}
