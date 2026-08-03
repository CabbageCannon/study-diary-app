import { useState } from "react";

import type { InteractionMode, LocalWindowPreferences } from "../types";

interface PetSettingsPanelProps {
  accessTokenSet: boolean;
  preferences: LocalWindowPreferences;
  interactionMode: InteractionMode;
  onAccessTokenSave: (token: string) => void;
  onInteractionModeChange: (mode: Exclude<InteractionMode, "temporary">) => Promise<void>;
  onPreferencesChange: (preferences: LocalWindowPreferences) => Promise<void>;
}

export function PetSettingsPanel({
  accessTokenSet,
  preferences,
  interactionMode,
  onAccessTokenSave,
  onInteractionModeChange,
  onPreferencesChange,
}: PetSettingsPanelProps) {
  const [accessCode, setAccessCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updatePreference(
    key: keyof Pick<LocalWindowPreferences, "alwaysOnTop" | "autostart" | "localNotifications">,
    value: boolean,
  ) {
    setIsSaving(true);
    try {
      await onPreferencesChange({ ...preferences, [key]: value });
    } catch (error) {
      console.error("[desktop-pet] Failed to update a preference.", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function updateInteractionMode(mode: Exclude<InteractionMode, "temporary">) {
    setIsSaving(true);
    try {
      await onInteractionModeChange(mode);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="pet-settings">
      <div className="settings-auth">
        <label>
          <span>访问码</span>
          <input autoComplete="current-password" onChange={(event) => setAccessCode(event.currentTarget.value)} placeholder={accessTokenSet ? "已在本次运行中验证" : "用于同步到学习系统"} type="password" value={accessCode} />
        </label>
        <button disabled={!accessCode.trim()} onClick={() => { onAccessTokenSave(accessCode); setAccessCode(""); }} type="button">应用</button>
      </div>
      <p>访问码仅保留在本次桌宠运行的内存中。</p>
      <div className="local-setting-list">
        <label><input checked={preferences.alwaysOnTop} disabled={isSaving} onChange={(event) => void updatePreference("alwaysOnTop", event.currentTarget.checked)} type="checkbox" />始终置顶</label>
        <label><input checked={preferences.autostart} disabled={isSaving} onChange={(event) => void updatePreference("autostart", event.currentTarget.checked)} type="checkbox" />开机启动</label>
        <label className="interaction-mode-setting">
          <span>鼠标交互</span>
          <select aria-label="鼠标交互模式" disabled={isSaving || interactionMode === "temporary"} onChange={(event) => void updateInteractionMode(event.currentTarget.value as Exclude<InteractionMode, "temporary">)} value={interactionMode === "temporary" ? "interactive" : interactionMode}>
            <option value="interactive">正常交互</option>
            <option value="through">专注穿透</option>
          </select>
          <small>穿透时请通过托盘或 Ctrl + Shift + P 恢复交互。</small>
        </label>
        <label><input checked={preferences.localNotifications} disabled={isSaving} onChange={(event) => void updatePreference("localNotifications", event.currentTarget.checked)} type="checkbox" />本地通知</label>
      </div>
    </section>
  );
}
