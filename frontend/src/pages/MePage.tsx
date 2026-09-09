import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { DeviceMobileIcon } from "@phosphor-icons/react/DeviceMobile";
import { KeyIcon } from "@phosphor-icons/react/Key";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { Link } from "react-router-dom";

import { useAccessToken } from "../auth/AccessTokenContext";
import { usePwaInstall } from "../contexts/PwaInstallContext";
import { useTheme, type AppTheme } from "../contexts/ThemeContext";
import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import { useUserPreferences } from "../hooks/useUserPreferences";
import {
  buildReminderCopy,
  clampGoal,
  createBrowserPushSubscription,
  deleteReminderPush,
  getTodayProgressItems,
  notificationPermission,
  pushSupported,
  reminderPayloadFromPreferences,
  reminderSettingsFromPreferences,
  subscribeReminderPush,
  unsubscribeBrowserPush,
  updateReminderPush,
  type UserPreferences,
} from "../services/userPreferences";

const themes: { id: AppTheme; label: string; note: string; colors: string[] }[] = [
  { id: "mist", label: "雾松", note: "安静自然", colors: ["#f3f4f0", "#e3eee8", "#39755e"] },
  { id: "sea", label: "海盐", note: "清爽蓝灰", colors: ["#f2f5f5", "#e1ecef", "#527986"] },
  { id: "tea", label: "杏茶", note: "温暖纸感", colors: ["#f5f0e8", "#f1e1d2", "#9a6848"] },
  { id: "night", label: "墨夜", note: "夜间阅读", colors: ["#1a201d", "#2d3d31", "#a9ca8b"] },
];

export function MePage() {
  const { data, isLoading } = useTodayWorkspace();
  const [preferences, setPreferences] = useUserPreferences();
  const [form, setForm] = useState<UserPreferences>(preferences);
  const [permission, setPermission] = useState(notificationPermission());
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessCodeOpen, setAccessCodeOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const { theme, setTheme } = useTheme();
  const { canOfferInstall, closeIosGuide, dismissIosGuide, isIosGuideOpen, requestInstall } = usePwaInstall();
  const { hasAccessToken, saveAccessToken, clearAccessToken } = useAccessToken();

  useEffect(() => setForm(preferences), [preferences]);

  const progressItems = getTodayProgressItems(data, form);
  const reminderCopy = useMemo(() => buildReminderCopy(progressItems), [progressItems]);
  const canUsePush = pushSupported();
  const todayCompleted = (data.interviewStats?.today_answered_count ?? 0) + (data.algorithmStats?.today_completed_count ?? 0);
  const totalCompleted = (data.interviewStats?.total_answered_count ?? 0) + (data.algorithmStats?.total_attempt_count ?? 0);
  const streak = Math.max(data.interviewStats?.streak_days ?? 0, data.algorithmStats?.current_streak_days ?? 0);
  const displayName = form.nickname.trim() || "学习者";
  const avatar = displayName.slice(0, 1).toUpperCase();

  function clearStatus() {
    setMessage("");
    setError("");
  }

  function updateField<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    clearStatus();
  }

  function updateGoal(key: keyof UserPreferences["dailyGoals"], value: number) {
    setForm((current) => ({ ...current, dailyGoals: { ...current.dailyGoals, [key]: clampGoal(value) } }));
    clearStatus();
  }

  function updateReminder(value: Partial<UserPreferences["reminder"]>) {
    setForm((current) => ({ ...current, reminder: { ...current.reminder, ...value } }));
    clearStatus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    clearStatus();
    const next: UserPreferences = {
      ...form,
      nickname: form.nickname.trim(),
      targetRole: form.targetRole.trim(),
      learningStyle: form.learningStyle.trim(),
      dailyGoals: {
        interview: clampGoal(form.dailyGoals.interview),
        algorithm: clampGoal(form.dailyGoals.algorithm),
        diary: clampGoal(form.dailyGoals.diary),
        review: clampGoal(form.dailyGoals.review),
      },
    };

    try {
      if (!next.reminder.enabled && preferences.reminder.subscriptionId) {
        await Promise.allSettled([deleteReminderPush(preferences.reminder.subscriptionId), unsubscribeBrowserPush()]);
        next.reminder.subscriptionId = null;
      }
      if (next.reminder.enabled) {
        const subscription = await createBrowserPushSubscription();
        const saved = preferences.reminder.subscriptionId
          ? await updateReminderPush(preferences.reminder.subscriptionId, reminderSettingsFromPreferences(next))
          : await subscribeReminderPush(reminderPayloadFromPreferences(next, subscription));
        next.reminder.subscriptionId = saved.id;
        setPermission(notificationPermission());
      }
      setPreferences(next);
      setIsEditingProfile(false);
      setMessage(next.reminder.enabled ? "设置已保存，提醒也已同步。" : "设置已保存。");
    } catch (reason) {
      setPreferences(next);
      setPermission(notificationPermission());
      setError(reason instanceof Error ? reason.message : "提醒同步失败，其他设置已保存。");
    } finally {
      setIsSaving(false);
    }
  }

  async function installApp() {
    const result = await requestInstall();
    if (result === "unsupported") setMessage("当前已经以 App 方式打开，或浏览器暂不提供安装入口。");
  }

  function saveCode() {
    saveAccessToken(accessCode);
    setAccessCode("");
    setAccessCodeOpen(false);
    setMessage("访问码已更新。");
  }

  return (
    <div className="page-stack me-page">
      <header className="me-profile-header">
        <span className="page-kicker">我的</span>
        <div className="me-profile-main">
          <span className="me-avatar" aria-hidden="true">{avatar}</span>
          <div><h1>{displayName}</h1><p>{form.targetRole || "还没有设置学习方向"}</p></div>
          <button className="me-edit-button" onClick={() => setIsEditingProfile((value) => !value)} type="button"><PencilSimpleIcon aria-hidden="true" size={16} />{isEditingProfile ? "收起" : "编辑资料"}</button>
        </div>
        <p className="me-profile-note">{form.learningStyle || "写下一句属于自己的学习目标。"}</p>
        <div className="me-summary" aria-label="学习摘要">
          <span><strong>{isLoading ? "—" : streak}</strong><small>连续天数</small></span>
          <span><strong>{isLoading ? "—" : todayCompleted}</strong><small>今日完成</small></span>
          <span><strong>{isLoading ? "—" : totalCompleted}</strong><small>累计练习</small></span>
        </div>
      </header>

      <form className="me-settings-form" onSubmit={(event) => void submit(event)}>
        {message ? <p className="settings-success" role="status">{message}</p> : null}
        {error ? <p className="field-error page-error" role="alert">{error}</p> : null}

        {isEditingProfile ? <section className="settings-section me-profile-editor" aria-labelledby="profile-title">
          <SectionTitle eyebrow="个人资料" id="profile-title" title="让这里更像你" />
          <div className="settings-grid">
            <label className="form-field"><span>昵称</span><input maxLength={40} onChange={(event) => updateField("nickname", event.currentTarget.value)} placeholder="留空也可以" value={form.nickname} /></label>
            <label className="form-field"><span>学习方向</span><input maxLength={80} onChange={(event) => updateField("targetRole", event.currentTarget.value)} value={form.targetRole} /></label>
            <label className="form-field me-wide-field"><span>一句话目标</span><textarea maxLength={180} onChange={(event) => updateField("learningStyle", event.currentTarget.value)} value={form.learningStyle} /></label>
          </div>
        </section> : null}

        <section className="settings-section" aria-labelledby="appearance-title">
          <SectionTitle eyebrow="外观" id="appearance-title" title="选择一种心情" />
          <div className="theme-picker" role="radiogroup" aria-labelledby="appearance-title">
            {themes.map((item) => <button aria-checked={theme === item.id} className={theme === item.id ? "theme-option theme-option-active" : "theme-option"} key={item.id} onClick={() => setTheme(item.id)} role="radio" type="button"><span className="theme-swatches" aria-hidden="true">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><span><strong>{item.label}</strong><small>{item.note}</small></span></button>)}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="goals-title">
          <SectionTitle eyebrow="每日计划" id="goals-title" title="今天想完成多少" />
          <div className="me-goal-grid">
            <GoalInput label="八股" value={form.dailyGoals.interview} onChange={(value) => updateGoal("interview", value)} />
            <GoalInput label="算法" value={form.dailyGoals.algorithm} onChange={(value) => updateGoal("algorithm", value)} />
            <GoalInput label="日记" value={form.dailyGoals.diary} onChange={(value) => updateGoal("diary", value)} />
            <GoalInput label="复习" value={form.dailyGoals.review} onChange={(value) => updateGoal("review", value)} />
          </div>
          <p className="me-inline-preview">{progressItems.map((item) => `${item.label} ${isLoading ? "—" : `${Math.min(item.completed, item.target)}/${item.target}`}`).join(" · ")}</p>
        </section>

        <section className="settings-section" aria-labelledby="reminder-title">
          <div className="settings-section-heading"><SectionTitle eyebrow="提醒" id="reminder-title" title="每日提醒" /><label className="ios-switch"><input checked={form.reminder.enabled} onChange={(event) => updateReminder({ enabled: event.currentTarget.checked })} type="checkbox" /><span aria-hidden="true" /></label></div>
          <label className="setting-row"><span><strong>提醒时间</strong><small>按 Asia/Shanghai 推送</small></span><input aria-label="提醒时间" onChange={(event) => updateReminder({ time: event.currentTarget.value })} type="time" value={form.reminder.time} /></label>
          <div className="setting-row"><span><strong>通知权限</strong><small>iPhone 需从主屏幕打开</small></span><span className="setting-value"><BellIcon aria-hidden="true" size={18} />{permission === "unsupported" ? "不支持" : permission === "granted" ? "已允许" : permission === "denied" ? "已拒绝" : "未询问"}</span></div>
          <div className="me-reminder-preview"><div><CheckCircleIcon aria-hidden="true" size={18} weight="fill" /><span>今晚可能收到</span></div><strong>{reminderCopy.title}</strong><p>{reminderCopy.body}</p></div>
          {!canUsePush ? <p className="field-error">当前浏览器不支持 Web Push。</p> : null}
        </section>

        <section className="settings-section" aria-labelledby="app-title">
          <SectionTitle eyebrow="应用" id="app-title" title="这台 iPhone" />
          <button className="setting-row setting-row-button" disabled={!canOfferInstall} onClick={() => void installApp()} type="button"><span><strong>添加到主屏幕</strong><small>{canOfferInstall ? "获得完整屏幕与系统提醒" : "已安装或当前不可用"}</small></span><DeviceMobileIcon aria-hidden="true" size={20} /></button>
          <button className="setting-row setting-row-button" onClick={() => setAccessCodeOpen((value) => !value)} type="button"><span><strong>访问码</strong><small>{hasAccessToken ? "已设置" : "尚未设置"}</small></span><KeyIcon aria-hidden="true" size={20} /></button>
          {accessCodeOpen ? <div className="me-access-code"><label><span>新的访问码</span><input autoComplete="current-password" autoFocus onChange={(event) => setAccessCode(event.currentTarget.value)} type="password" value={accessCode} /></label><div><button className="button button-secondary" onClick={() => { clearAccessToken(); setAccessCodeOpen(false); }} type="button">清除</button><button className="button button-primary" onClick={saveCode} type="button">保存</button></div></div> : null}
          <Link className="setting-row setting-row-button" to="/settings/desktop-pet"><span><strong>桌宠设置</strong><small>天气、里程碑与桌面联动</small></span><span aria-hidden="true">›</span></Link>
          {isIosGuideOpen ? <div className="me-install-guide"><strong>在 Safari 中安装</strong><ol><li>点按底部“分享”。</li><li>选择“添加到主屏幕”。</li><li>从主屏幕重新打开。</li></ol><div><button className="button button-secondary" onClick={dismissIosGuide} type="button">稍后提醒</button><button className="button button-primary" onClick={closeIosGuide} type="button">知道了</button></div></div> : null}
        </section>

        <div className="settings-actions"><button className="button button-primary" disabled={isSaving} type="submit">{isSaving ? "保存中…" : "保存设置"}</button></div>
      </form>
    </div>
  );
}

function SectionTitle({ eyebrow, id, title }: { eyebrow: string; id: string; title: string }) {
  return <div><span className="pane-label">{eyebrow}</span><h2 id={id}>{title}</h2></div>;
}

function GoalInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="me-goal-input"><span>{label}</span><input inputMode="numeric" max={30} min={0} onChange={(event) => onChange(Number(event.currentTarget.value))} type="number" value={value} /></label>;
}
