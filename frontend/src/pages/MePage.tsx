import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { DeviceMobileIcon } from "@phosphor-icons/react/DeviceMobile";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { TargetIcon } from "@phosphor-icons/react/Target";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";

import { usePwaInstall } from "../contexts/PwaInstallContext";
import { usePwaUpdate, type PwaUpdatePhase } from "../contexts/PwaUpdateContext";
import { useTheme, type AppTheme } from "../contexts/ThemeContext";
import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { dailyGoalsDirty, profileSettingsDirty } from "../utils/settingsDirty";
import {
  buildReminderCopy, clampGoal, createBrowserPushSubscription, deleteReminderPush,
  getTodayProgressItems, notificationPermission, pushSupported,
  reminderPayloadFromPreferences, reminderSettingsFromPreferences,
  subscribeReminderPush, unsubscribeBrowserPush, updateReminderPush,
  type UserPreferences,
} from "../services/userPreferences";

const themes: { id: AppTheme; label: string; note: string; colors: string[] }[] = [
  { id: "mist", label: "雾松", note: "安静自然", colors: ["#f3f4f0", "#e3eee8", "#39755e"] },
  { id: "sea", label: "海盐", note: "清爽蓝灰", colors: ["#f2f5f5", "#e1ecef", "#527986"] },
  { id: "tea", label: "杏茶", note: "温暖纸感", colors: ["#f5f0e8", "#f1e1d2", "#9a6848"] },
  { id: "night", label: "墨夜", note: "夜间阅读", colors: ["#1a201d", "#2d3d31", "#a9ca8b"] },
];

type SettingsSection = "profile" | "appearance" | "goals" | "reminder" | "version" | "install";

const versionCopy: Record<PwaUpdatePhase, { title: string; detail: string; button: string }> = {
  idle: { title: "随时检查新版本", detail: "主动向服务器确认，无需清空缓存。", button: "检测新版本" },
  checking: { title: "正在检测", detail: "正在确认最新版本，请稍候。", button: "检测中…" },
  downloading: { title: "正在后台下载", detail: "你可以继续使用应用，准备好后会自动提醒。", button: "重新检测" },
  current: { title: "已是最新版本", detail: "当前应用已经是服务器上的最新版。", button: "再次检测" },
  available: { title: "发现新版本", detail: "更新已准备好，可以直接安装。", button: "立即更新" },
  updating: { title: "正在安装更新", detail: "请保持页面打开，安装完成后会自动刷新。", button: "更新中…" },
  reloading: { title: "更新完成", detail: "正在重新打开应用，请稍候。", button: "正在打开…" },
  restart: { title: "新版本已经下载", detail: "iPhone 暂未完成切换，请关闭应用后从主屏幕重新打开。", button: "再次尝试切换" },
  error: { title: "暂时无法检查", detail: "网络恢复后可以直接重试。", button: "重新检测" },
};

export function MePage() {
  const { data, isLoading } = useTodayWorkspace();
  const [preferences, setPreferences] = useUserPreferences();
  const [form, setForm] = useState<UserPreferences>(preferences);
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const [pendingReminderTime, setPendingReminderTime] = useState<string | null>(null);
  const [permission, setPermission] = useState(notificationPermission());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { theme, setTheme } = useTheme();
  const [draftTheme, setDraftTheme] = useState<AppTheme>(theme);
  const { canOfferInstall, closeIosGuide, dismissIosGuide, isIosGuideOpen, requestInstall } = usePwaInstall();
  const { applyUpdate, checkForUpdate, error: updateError, phase: updatePhase } = usePwaUpdate();

  useEffect(() => setForm(preferences), [preferences]);
  useEffect(() => setDraftTheme(theme), [theme]);

  const progressItems = getTodayProgressItems(data, form);
  const reminderCopy = useMemo(() => buildReminderCopy(progressItems), [progressItems]);
  const canUsePush = pushSupported();
  const todayCompleted = (data.interviewStats?.today_answered_count ?? 0) + (data.algorithmStats?.today_completed_count ?? 0);
  const totalCompleted = (data.interviewStats?.total_answered_count ?? 0) + (data.algorithmStats?.total_attempt_count ?? 0);
  const streak = Math.max(data.interviewStats?.streak_days ?? 0, data.algorithmStats?.current_streak_days ?? 0);
  const displayName = preferences.nickname.trim() || "学习者";
  const avatar = displayName.slice(0, 1).toUpperCase();
  const savedTheme = themes.find((item) => item.id === theme)?.label ?? "雾松";
  const updateCopy = versionCopy[updatePhase];
  const updateBusy = updatePhase === "checking" || updatePhase === "updating" || updatePhase === "reloading";
  const reminderSaving = savingSection === "reminder";
  const reminderHasMissingTasks = progressItems.some((item) => item.target > 0 && item.completed < item.target);
  const profileDirty = profileSettingsDirty(form, preferences);
  const appearanceDirty = draftTheme !== theme;
  const goalsDirty = dailyGoalsDirty(form.dailyGoals, preferences.dailyGoals);

  function clearStatus() { setMessage(""); setError(""); }

  function toggleSection(section: SettingsSection) {
    clearStatus();
    setPendingReminderTime(null);
    setForm(preferences);
    setDraftTheme(theme);
    if (activeSection === "install") closeIosGuide();
    setActiveSection((current) => current === section ? null : section);
  }

  function cancelSection() {
    setForm(preferences);
    setDraftTheme(theme);
    closeIosGuide();
    clearStatus();
    setActiveSection(null);
  }

  function updateField<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    clearStatus();
  }

  function updateGoal(key: keyof UserPreferences["dailyGoals"], value: number) {
    setForm((current) => ({ ...current, dailyGoals: { ...current.dailyGoals, [key]: clampGoal(value) } }));
    clearStatus();
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDirty) return;
    const next = { ...preferences, nickname: form.nickname.trim(), targetRole: form.targetRole.trim(), learningStyle: form.learningStyle.trim() };
    setPreferences(next); setForm(next); setMessage("个人资料已保存。");
  }

  function saveAppearance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appearanceDirty) return;
    setTheme(draftTheme);
    setMessage("外观已保存。");
  }

  function saveGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goalsDirty) return;
    const next = { ...preferences, dailyGoals: {
      interview: clampGoal(form.dailyGoals.interview), algorithm: clampGoal(form.dailyGoals.algorithm),
      diary: clampGoal(form.dailyGoals.diary), review: clampGoal(form.dailyGoals.review),
    } };
    setPreferences(next); setForm(next); setMessage("每日计划已保存。");
    if (next.reminder.enabled && next.reminder.subscriptionId) {
      void updateReminderPush(next.reminder.subscriptionId, reminderSettingsFromPreferences(next))
        .catch(() => setError("计划已保存，但提醒目标同步失败，请稍后重试。"));
    }
  }

  async function toggleReminder(enabled: boolean) {
    if (reminderSaving) return;
    const previous = preferences;
    const next: UserPreferences = {
      ...previous,
      reminder: { ...previous.reminder, enabled, subscriptionId: enabled ? previous.reminder.subscriptionId : null },
    };
    setPreferences(next); setForm(next);
    setSavingSection("reminder"); clearStatus();
    try {
      if (enabled) {
        const subscription = await createBrowserPushSubscription();
        const saved = previous.reminder.subscriptionId
          ? await updateReminderPush(previous.reminder.subscriptionId, reminderSettingsFromPreferences(next))
          : await subscribeReminderPush(reminderPayloadFromPreferences(next, subscription));
        const committed = { ...next, reminder: { ...next.reminder, subscriptionId: saved.id } };
        setPreferences(committed); setForm(committed);
        setMessage(`已开启，每天 ${committed.reminder.time} 提醒。`);
      } else {
        if (previous.reminder.subscriptionId) await deleteReminderPush(previous.reminder.subscriptionId);
        await unsubscribeBrowserPush().catch(() => undefined);
        setMessage("每日提醒已关闭。");
      }
    } catch (reason) {
      setPreferences(previous); setForm(previous);
      setError(reason instanceof Error ? reason.message : "提醒同步失败，已恢复原来的设置。");
    } finally {
      setPermission(notificationPermission());
      setSavingSection(null);
    }
  }

  function updateReminderTimeDraft(time: string) {
    if (!time || !form.reminder.enabled || reminderSaving) return;
    clearStatus();
    setForm((current) => ({ ...current, reminder: { ...current.reminder, time } }));
  }

  function settleReminderTimeChange(time: string) {
    if (!time || !form.reminder.enabled || reminderSaving) {
      setForm((current) => ({ ...current, reminder: { ...current.reminder, time: preferences.reminder.time } }));
      return;
    }
    if (time === preferences.reminder.time) {
      setPendingReminderTime(null);
      return;
    }
    setPendingReminderTime(time);
  }

  function cancelReminderTimeChange() {
    setForm((current) => ({ ...current, reminder: { ...current.reminder, time: preferences.reminder.time } }));
    setPendingReminderTime(null);
  }

  async function confirmReminderTimeChange() {
    if (!pendingReminderTime || reminderSaving) return;
    const previous = preferences;
    const next: UserPreferences = { ...previous, reminder: { ...previous.reminder, time: pendingReminderTime } };
    setPendingReminderTime(null);
    setPreferences(next); setForm(next);
    setSavingSection("reminder"); clearStatus();
    try {
      const saved = previous.reminder.subscriptionId
        ? await updateReminderPush(previous.reminder.subscriptionId, reminderSettingsFromPreferences(next))
        : await createBrowserPushSubscription().then((subscription) => subscribeReminderPush(reminderPayloadFromPreferences(next, subscription)));
      const committed = { ...next, reminder: { ...next.reminder, subscriptionId: saved.id } };
      setPreferences(committed); setForm(committed);
      setMessage(`提醒时间已改为 ${committed.reminder.time}。`);
    } catch (reason) {
      setPreferences(previous); setForm(previous);
      setError(reason instanceof Error ? reason.message : "修改失败，已恢复原来的提醒时间。");
    } finally {
      setPermission(notificationPermission());
      setSavingSection(null);
    }
  }

  async function installApp() {
    clearStatus();
    const result = await requestInstall();
    if (result === "unsupported") setMessage("当前已经以 App 方式打开，或浏览器暂不提供安装入口。");
  }

  return <div className="page-stack me-page">
    <header className="me-profile-header">
      <div className="me-profile-main">
        <span className="me-avatar" aria-hidden="true">{avatar}</span>
        <div><h1>{displayName}</h1><p>{preferences.targetRole || "还没有设置学习方向"}</p></div>
      </div>
      <p className="me-profile-note">{preferences.learningStyle || "写下一句属于自己的学习目标。"}</p>
      <div className="me-summary" aria-label="学习摘要">
        <span><strong>{isLoading ? "-" : streak}</strong><small>连续天数</small></span>
        <span><strong>{isLoading ? "-" : todayCompleted}</strong><small>今日完成</small></span>
        <span><strong>{isLoading ? "-" : totalCompleted}</strong><small>累计练习</small></span>
      </div>
    </header>

    <div className="me-settings-list">
      <SettingsItem active={activeSection === "profile"} controls="me-profile-panel" icon={<UserCircleIcon aria-hidden="true" size={21} />} label="个人资料" note={preferences.targetRole || "昵称与学习方向"} onToggle={() => toggleSection("profile")}>
        <form className="me-settings-panel" id="me-profile-panel" onSubmit={saveProfile}>
          <div className="settings-grid">
            <label className="form-field"><span>昵称</span><input maxLength={40} onChange={(event) => updateField("nickname", event.currentTarget.value)} placeholder="留空也可以" value={form.nickname} /></label>
            <label className="form-field"><span>学习方向</span><input maxLength={80} onChange={(event) => updateField("targetRole", event.currentTarget.value)} value={form.targetRole} /></label>
            <label className="form-field me-wide-field"><span>一句话目标</span><textarea maxLength={180} onChange={(event) => updateField("learningStyle", event.currentTarget.value)} value={form.learningStyle} /></label>
          </div>
          <SectionActions dirty={profileDirty} error={error} message={message} onCancel={cancelSection} />
        </form>
      </SettingsItem>

      <SettingsItem active={activeSection === "appearance"} controls="me-appearance-panel" icon={<PaletteIcon aria-hidden="true" size={21} />} label="外观" note={savedTheme} onToggle={() => toggleSection("appearance")}>
        <form className="me-settings-panel" id="me-appearance-panel" onSubmit={saveAppearance}>
          <div className="theme-picker" role="radiogroup" aria-label="外观主题">
            {themes.map((item) => <button aria-checked={draftTheme === item.id} className={draftTheme === item.id ? "theme-option theme-option-active" : "theme-option"} key={item.id} onClick={() => { setDraftTheme(item.id); clearStatus(); }} role="radio" type="button"><span className="theme-swatches" aria-hidden="true">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><span><strong>{item.label}</strong><small>{item.note}</small></span></button>)}
          </div>
          <SectionActions dirty={appearanceDirty} error={error} message={message} onCancel={cancelSection} />
        </form>
      </SettingsItem>

      <SettingsItem active={activeSection === "goals"} controls="me-goals-panel" icon={<TargetIcon aria-hidden="true" size={21} />} label="每日计划" note={`八股 ${preferences.dailyGoals.interview} · 算法 ${preferences.dailyGoals.algorithm}`} onToggle={() => toggleSection("goals")}>
        <form className="me-settings-panel" id="me-goals-panel" onSubmit={saveGoals}>
          <div className="me-goal-grid">
            <GoalInput label="八股" value={form.dailyGoals.interview} onChange={(value) => updateGoal("interview", value)} />
            <GoalInput label="算法" value={form.dailyGoals.algorithm} onChange={(value) => updateGoal("algorithm", value)} />
            <GoalInput label="日记" value={form.dailyGoals.diary} onChange={(value) => updateGoal("diary", value)} />
            <GoalInput label="复习" value={form.dailyGoals.review} onChange={(value) => updateGoal("review", value)} />
          </div>
          <p className="me-inline-preview">{progressItems.map((item) => `${item.label} ${isLoading ? "-" : `${Math.min(item.completed, item.target)}/${item.target}`}`).join(" · ")}</p>
          <SectionActions dirty={goalsDirty} error={error} message={message} onCancel={cancelSection} />
        </form>
      </SettingsItem>

      <SettingsItem active={activeSection === "reminder"} controls="me-reminder-panel" icon={<BellIcon aria-hidden="true" size={21} />} label="每日提醒" note={preferences.reminder.enabled ? `${preferences.reminder.time} · 已开启` : "未开启"} onToggle={() => toggleSection("reminder")}>
        <div className="me-settings-panel" id="me-reminder-panel">
          <div className="settings-section-heading"><strong>开启提醒</strong><label className="ios-switch"><span className="sr-only">每日提醒</span><input checked={form.reminder.enabled} disabled={reminderSaving} onChange={(event) => void toggleReminder(event.currentTarget.checked)} type="checkbox" /><i aria-hidden="true" /></label></div>
          <label className={form.reminder.enabled ? "setting-row" : "setting-row setting-row-disabled"}><span><strong>提醒时间</strong><small>按 Asia/Shanghai 推送</small></span><input aria-label="提醒时间" disabled={!form.reminder.enabled || reminderSaving} onBlur={(event) => settleReminderTimeChange(event.currentTarget.value)} onChange={(event) => { updateReminderTimeDraft(event.currentTarget.value); if (event.nativeEvent.type === "change") settleReminderTimeChange(event.currentTarget.value); }} onInput={(event) => updateReminderTimeDraft(event.currentTarget.value)} type="time" value={form.reminder.time} /></label>
          <div className="setting-row"><span><strong>通知权限</strong><small>iPhone 需从主屏幕打开</small></span><span className="setting-value">{permission === "unsupported" ? "不支持" : permission === "granted" ? "已允许" : permission === "denied" ? "已拒绝" : "未询问"}</span></div>
          <div className="me-reminder-preview"><div><CheckCircleIcon aria-hidden="true" size={18} weight="fill" /><span>{reminderHasMissingTasks ? "今晚可能收到" : "今日不再提醒"}</span></div><strong>{reminderCopy.title}</strong><p>{reminderCopy.body}</p></div>
          {!canUsePush ? <p className="field-error">当前浏览器不支持 Web Push。</p> : null}
          {reminderSaving ? <p className="me-reminder-sync" role="status"><SpinnerGapIcon aria-hidden="true" size={16} />正在同步提醒…</p> : null}
          {!reminderSaving && message ? <p className="settings-success" role="status">{message}</p> : null}
          {!reminderSaving && error ? <p className="field-error" role="alert">{error}</p> : null}
        </div>
      </SettingsItem>

      <SettingsItem active={activeSection === "version"} controls="me-version-panel" icon={<ArrowClockwiseIcon aria-hidden="true" size={21} />} label="版本更新" note={updatePhase === "available" ? "有新版本可用" : updatePhase === "downloading" ? "正在后台下载" : updatePhase === "current" ? "已是最新版" : "一键检测，无需清缓存"} onToggle={() => toggleSection("version")}>
        <div className="me-settings-panel" id="me-version-panel">
          <div aria-live="polite" className={`me-version-state is-${updatePhase}`} role="status"><span>{updateBusy ? <SpinnerGapIcon aria-hidden="true" size={22} /> : updatePhase === "current" ? <CheckCircleIcon aria-hidden="true" size={22} weight="fill" /> : <ArrowClockwiseIcon aria-hidden="true" size={22} />}</span><div><strong>{updateCopy.title}</strong><p>{updateError || updateCopy.detail}</p></div></div>
          <button className="button button-primary me-version-button" disabled={updateBusy} onClick={() => void (["available", "restart"].includes(updatePhase) ? applyUpdate() : checkForUpdate())} type="button">{updateBusy ? <SpinnerGapIcon aria-hidden="true" size={17} /> : <ArrowClockwiseIcon aria-hidden="true" size={17} weight="bold" />}{updateCopy.button}</button>
        </div>
      </SettingsItem>

      <SettingsItem active={activeSection === "install"} controls="me-install-panel" icon={<DeviceMobileIcon aria-hidden="true" size={21} />} label="添加到主屏幕" note={canOfferInstall ? "获得完整屏幕与系统提醒" : "已安装或当前不可用"} onToggle={() => toggleSection("install")}>
        <div className="me-settings-panel" id="me-install-panel">
          <p className="me-install-copy">从主屏幕打开后，可获得更完整的显示和系统提醒体验。</p>
          <button className="button button-primary" disabled={!canOfferInstall} onClick={() => void installApp()} type="button">添加到主屏幕</button>
          {message ? <p className="settings-success" role="status">{message}</p> : null}
          {isIosGuideOpen ? <div className="me-install-guide"><strong>在 Safari 中安装</strong><ol><li>点按底部“分享”。</li><li>选择“添加到主屏幕”。</li><li>从主屏幕重新打开。</li></ol><div><button className="button button-secondary" onClick={dismissIosGuide} type="button">稍后提醒</button><button className="button button-primary" onClick={closeIosGuide} type="button">知道了</button></div></div> : null}
        </div>
      </SettingsItem>
    </div>
    <ConfirmActionDialog confirmLabel={`改为 ${pendingReminderTime ?? ""}`} description={`之后每天将在 ${pendingReminderTime ?? ""} 左右提醒；当天任务全部完成时不会发送。`} onCancel={cancelReminderTimeChange} onConfirm={() => void confirmReminderTimeChange()} open={pendingReminderTime !== null} title="修改提醒时间？" />
  </div>;
}

function SettingsItem({ active, children, controls, icon, label, note, onToggle }: { active: boolean; children: ReactNode; controls: string; icon: ReactNode; label: string; note: string; onToggle: () => void }) {
  return <section className={active ? "me-settings-item me-settings-item-active" : "me-settings-item"}><button aria-controls={controls} aria-expanded={active} className="me-settings-trigger" onClick={onToggle} type="button"><span className="me-settings-icon">{icon}</span><span><strong>{label}</strong><small>{note}</small></span><CaretDownIcon aria-hidden="true" className="me-settings-caret" size={18} weight="bold" /></button>{active ? children : null}</section>;
}

function SectionActions({ dirty, error, message, onCancel, saving = false }: { dirty: boolean; error: string; message: string; onCancel: () => void; saving?: boolean }) {
  return <><div className="me-section-actions"><button className="button button-secondary" disabled={saving} onClick={onCancel} type="button">取消</button><button className="button button-primary" disabled={saving || !dirty} type="submit">{saving ? "保存中…" : "保存"}</button></div>{message ? <p className="settings-success" role="status">{message}</p> : null}{error ? <p className="field-error" role="alert">{error}</p> : null}</>;
}

function GoalInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="me-goal-input"><span>{label}</span><input inputMode="numeric" max={30} min={0} onChange={(event) => onChange(Number(event.currentTarget.value))} type="number" value={value} /></label>;
}
