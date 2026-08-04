import { useState } from "react";

import type { InteractionMode, LocalWindowPreferences } from "../types";

interface PetSettingsPanelProps {
  accessTokenSet: boolean;
  preferences: LocalWindowPreferences;
  interactionMode: InteractionMode;
  onAccessTokenSave: (token: string) => Promise<void>;
  onAccessTokenClear: () => Promise<void>;
  onInteractionModeChange: (mode: Exclude<InteractionMode, "temporary">) => Promise<void>;
  onPreferencesChange: (preferences: LocalWindowPreferences) => Promise<void>;
}

export function PetSettingsPanel({
  accessTokenSet,
  preferences,
  interactionMode,
  onAccessTokenSave,
  onAccessTokenClear,
  onInteractionModeChange,
  onPreferencesChange,
}: PetSettingsPanelProps) {
  const [accessCode, setAccessCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAccessCodeSaving, setIsAccessCodeSaving] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState("");

  async function saveAccessCode() {
    if (!accessCode.trim() || isAccessCodeSaving) return;
    setIsAccessCodeSaving(true);
    setAccessCodeError("");
    try {
      await onAccessTokenSave(accessCode);
      setAccessCode("");
    } catch (error) {
      setAccessCodeError(error instanceof Error ? error.message : "访问码保存失败。");
    } finally {
      setIsAccessCodeSaving(false);
    }
  }

  async function clearAccessCode() {
    if (isAccessCodeSaving) return;
    setIsAccessCodeSaving(true);
    setAccessCodeError("");
    try {
      await onAccessTokenClear();
    } catch (error) {
      setAccessCodeError(error instanceof Error ? error.message : "访问码移除失败。");
    } finally {
      setIsAccessCodeSaving(false);
    }
  }

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
          <input autoComplete="current-password" disabled={isAccessCodeSaving} onChange={(event) => setAccessCode(event.currentTarget.value)} placeholder={accessTokenSet ? "此设备已连接" : "用于同步到学习系统"} type="password" value={accessCode} />
        </label>
        <div className="settings-auth-actions">
          <button disabled={!accessCode.trim() || isAccessCodeSaving} onClick={() => void saveAccessCode()} type="button">{isAccessCodeSaving ? "保存中…" : "应用"}</button>
          {accessTokenSet ? <button className="access-code-clear" disabled={isAccessCodeSaving} onClick={() => void clearAccessCode()} type="button">移除</button> : null}
        </div>
        {accessCodeError ? <p className="settings-auth-error" role="alert">{accessCodeError}</p> : null}
      </div>
      <p>访问码保存在 Windows 凭据管理器，仅当前 Windows 用户可读取。</p>
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
