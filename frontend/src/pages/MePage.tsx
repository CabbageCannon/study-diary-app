import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { DeviceMobileIcon } from "@phosphor-icons/react/DeviceMobile";

import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { MobileMoreSheet } from "../layout/MobileMoreSheet";
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

export function MePage() {
  const { data, isLoading } = useTodayWorkspace();
  const [preferences, setPreferences] = useUserPreferences();
  const [form, setForm] = useState<UserPreferences>(preferences);
  const [permission, setPermission] = useState(notificationPermission());
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setForm(preferences), [preferences]);

  const progressItems = getTodayProgressItems(data, form);
  const reminderCopy = useMemo(() => buildReminderCopy(progressItems), [progressItems]);
  const canUsePush = pushSupported();

  function updateField<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  function updateGoal(key: keyof UserPreferences["dailyGoals"], value: number) {
    setForm((current) => ({
      ...current,
      dailyGoals: { ...current.dailyGoals, [key]: clampGoal(value) },
    }));
    setMessage("");
    setError("");
  }

  function updateReminder(value: Partial<UserPreferences["reminder"]>) {
    setForm((current) => ({ ...current, reminder: { ...current.reminder, ...value } }));
    setMessage("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

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
        await Promise.allSettled([
          deleteReminderPush(preferences.reminder.subscriptionId),
          unsubscribeBrowserPush(),
        ]);
        next.reminder.subscriptionId = null;
      }

      if (next.reminder.enabled) {
        const subscription = await createBrowserPushSubscription();
        const payload = reminderPayloadFromPreferences(next, subscription);
        const saved = preferences.reminder.subscriptionId
          ? await updateReminderPush(preferences.reminder.subscriptionId, reminderSettingsFromPreferences(next))
          : await subscribeReminderPush(payload);
        next.reminder.subscriptionId = saved.id;
        setPermission(notificationPermission());
      }

      setPreferences(next);
      setMessage(next.reminder.enabled ? "已保存，并同步到系统提醒。" : "已保存。每日提醒已关闭。");
    } catch (reason) {
      setPreferences(next);
      setPermission(notificationPermission());
      setError(reason instanceof Error ? reason.message : "提醒同步失败，个人设置已保存。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack me-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">我的</span>
          <h1>{form.nickname ? `${form.nickname}的学习设置` : "学习设置"}</h1>
        </div>
        <p>把每日目标和提醒节奏放在这里，首页会按这些设置计算今天还差什么。</p>
      </header>

      <form className="me-settings-form" onSubmit={(event) => void submit(event)}>
        {message ? <p className="settings-success" role="status">{message}</p> : null}
        {error ? <p className="field-error page-error" role="alert">{error}</p> : null}

        <section className="settings-section" aria-labelledby="profile-title">
          <div className="settings-section-heading">
            <div>
              <span className="pane-label">个人</span>
              <h2 id="profile-title">学习档案</h2>
            </div>
          </div>
          <div className="settings-grid">
            <label className="form-field">
              <span>昵称</span>
              <input maxLength={40} onChange={(event) => updateField("nickname", event.currentTarget.value)} placeholder="留空也可以" value={form.nickname} />
            </label>
            <label className="form-field">
              <span>目标岗位</span>
              <input maxLength={80} onChange={(event) => updateField("targetRole", event.currentTarget.value)} value={form.targetRole} />
            </label>
            <label className="form-field me-wide-field">
              <span>学习偏好</span>
              <textarea maxLength={180} onChange={(event) => updateField("learningStyle", event.currentTarget.value)} value={form.learningStyle} />
            </label>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="goals-title">
          <div className="settings-section-heading">
            <div>
              <span className="pane-label">目标</span>
              <h2 id="goals-title">每日目标</h2>
            </div>
          </div>
          <div className="me-goal-grid">
            <GoalInput label="八股" value={form.dailyGoals.interview} onChange={(value) => updateGoal("interview", value)} />
            <GoalInput label="算法" value={form.dailyGoals.algorithm} onChange={(value) => updateGoal("algorithm", value)} />
            <GoalInput label="日记" value={form.dailyGoals.diary} onChange={(value) => updateGoal("diary", value)} />
            <GoalInput label="复习" value={form.dailyGoals.review} onChange={(value) => updateGoal("review", value)} />
          </div>
          <div className="me-progress-preview" aria-label="今日目标预览">
            {progressItems.map((item) => (
              <span key={item.key}>{item.label} {isLoading ? "待同步" : `${Math.min(item.completed, item.target)}/${item.target}`}</span>
            ))}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="reminder-title">
          <div className="settings-section-heading">
            <div>
              <span className="pane-label">提醒</span>
              <h2 id="reminder-title">每日提醒</h2>
            </div>
            <label className="toggle-field">
              <input checked={form.reminder.enabled} onChange={(event) => updateReminder({ enabled: event.currentTarget.checked })} type="checkbox" />
              <span>启用</span>
            </label>
          </div>
          <div className="settings-grid settings-grid-wide">
            <label className="form-field">
              <span>提醒时间</span>
              <input onChange={(event) => updateReminder({ time: event.currentTarget.value })} type="time" value={form.reminder.time} />
              <small>后端按 Asia/Shanghai 定时推送，浏览器关闭后也由服务端触发。</small>
            </label>
            <div className="me-notification-state">
              <BellIcon aria-hidden="true" size={20} weight="bold" />
              <span>通知权限</span>
              <strong>{permission === "unsupported" ? "不支持" : permission === "granted" ? "已允许" : permission === "denied" ? "已拒绝" : "未询问"}</strong>
            </div>
          </div>

          <div className="me-reminder-preview">
            <div>
              <CheckCircleIcon aria-hidden="true" size={19} weight="fill" />
              <span>文案预览</span>
            </div>
            <strong>{reminderCopy.title}</strong>
            <p>{reminderCopy.body}</p>
          </div>

          <div className="me-ios-note">
            <DeviceMobileIcon aria-hidden="true" size={19} weight="bold" />
            <p>iPhone 需要先用 Safari 添加到主屏幕，再从主屏幕打开并点击保存，系统才会弹出通知授权。</p>
          </div>
          {!canUsePush ? <p className="field-error">当前浏览器不支持 Web Push，请在支持 PWA 推送的浏览器里开启。</p> : null}
        </section>

        <section className="settings-section" aria-labelledby="app-settings-title">
          <div className="settings-section-heading">
            <div><span className="pane-label">记录与应用</span><h2 id="app-settings-title">更多设置</h2></div>
          </div>
          <button className="button button-secondary" onClick={() => setMoreOpen(true)} type="button">历史、主题、安装与访问码</button>
        </section>

        <div className="settings-actions">
          <button className="button button-primary" disabled={isSaving} type="submit">{isSaving ? "保存中…" : "保存我的设置"}</button>
        </div>
      </form>
      <MobileMoreSheet open={moreOpen} reviewEnabled={import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true"} onClose={() => setMoreOpen(false)} />
    </div>
  );
}

function GoalInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="form-field me-goal-input">
      <span>{label}</span>
      <input inputMode="numeric" max={30} min={0} onChange={(event) => onChange(Number(event.currentTarget.value))} type="number" value={value} />
    </label>
  );
}
