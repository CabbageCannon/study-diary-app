import { useState } from "react";

import type { LocalWindowPreferences } from "../types";

interface PetSettingsPanelProps {
  accessTokenSet: boolean;
  preferences: LocalWindowPreferences;
  onAccessTokenSave: (token: string) => void;
  onPreferencesChange: (preferences: LocalWindowPreferences) => Promise<void>;
}

export function PetSettingsPanel({ accessTokenSet, preferences, onAccessTokenSave, onPreferencesChange }: PetSettingsPanelProps) {
  const [accessCode, setAccessCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updatePreference(key: keyof Pick<LocalWindowPreferences, "alwaysOnTop" | "mouseThrough" | "autostart" | "localNotifications">, value: boolean) {
    setIsSaving(true);
    try { await onPreferencesChange({ ...preferences, [key]: value }); } finally { setIsSaving(false); }
  }

  return <section className="pet-settings"><div className="settings-auth"><label><span>访问码</span><input autoComplete="current-password" onChange={(event) => setAccessCode(event.currentTarget.value)} placeholder={accessTokenSet ? "已在本次运行中验证" : "用于同步到学习系统"} type="password" value={accessCode} /></label><button disabled={!accessCode.trim()} onClick={() => { onAccessTokenSave(accessCode); setAccessCode(""); }} type="button">应用</button></div><p>访问码仅保留在本次桌宠运行的内存中。</p><div className="local-setting-list"><label><input checked={preferences.alwaysOnTop} disabled={isSaving} onChange={(event) => void updatePreference("alwaysOnTop", event.currentTarget.checked)} type="checkbox" />始终置顶</label><label><input checked={preferences.autostart} disabled={isSaving} onChange={(event) => void updatePreference("autostart", event.currentTarget.checked)} type="checkbox" />开机启动</label><label><input checked={preferences.mouseThrough} disabled={isSaving} onChange={(event) => void updatePreference("mouseThrough", event.currentTarget.checked)} type="checkbox" />鼠标穿透</label><label><input checked={preferences.localNotifications} disabled={isSaving} onChange={(event) => void updatePreference("localNotifications", event.currentTarget.checked)} type="checkbox" />本地通知</label></div></section>;
}
