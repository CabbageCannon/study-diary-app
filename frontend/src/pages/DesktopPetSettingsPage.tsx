import { useEffect, useMemo, useState, type FormEvent } from "react";

import { getDesktopPetConfig, updateDesktopPetConfig } from "../api/desktopPet";
import type { DesktopPetConfig, DesktopPetConfigUpdate } from "../types/desktopPet";

const defaultConfig: DesktopPetConfig = {
  weather_enabled: true,
  location_label: "",
  latitude: null,
  longitude: null,
  weather_refresh_minutes: 15,
  milestone_minutes: [10, 20, 50],
  milestone_display_seconds: 10,
  show_notifications: true,
  open_page_on_study_start: false,
  updated_at: "",
};

function configToForm(config: DesktopPetConfig): DesktopPetConfigUpdate {
  const { updated_at: _updatedAt, ...form } = config;
  return form;
}

export function DesktopPetSettingsPage() {
  const [form, setForm] = useState<DesktopPetConfigUpdate>(configToForm(defaultConfig));
  const [milestoneInput, setMilestoneInput] = useState("10, 20, 50");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const config = await getDesktopPetConfig();
        if (cancelled) return;
        setForm(configToForm(config));
        setMilestoneInput(config.milestone_minutes.join(", "));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "桌宠设置加载失败。");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const locationReady = form.latitude !== null && form.longitude !== null;
  const helpText = useMemo(
    () => form.weather_enabled && !locationReady ? "启用天气前，请填写有效的纬度和经度。" : "桌宠只会读取是否下雨，不会保存天气密钥。",
    [form.weather_enabled, locationReady],
  );

  function updateField<K extends keyof DesktopPetConfigUpdate>(key: K, value: DesktopPetConfigUpdate[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const milestones = milestoneInput
      .split(/[，,\s]+/)
      .filter(Boolean)
      .map((value) => Number(value));
    if (!milestones.length || milestones.some((value) => !Number.isInteger(value) || value < 1 || value > 1440)) {
      setError("里程碑请填写 1 到 1440 之间的整数分钟，以逗号分隔。");
      return;
    }
    if (milestones.length > 20) {
      setError("里程碑最多可填写 20 个。");
      return;
    }
    if (form.weather_enabled && !locationReady) {
      setError("启用天气时，请同时填写纬度和经度。");
      return;
    }
    setIsSaving(true);
    try {
      const saved = await updateDesktopPetConfig({ ...form, milestone_minutes: milestones });
      setForm(configToForm(saved));
      setMilestoneInput(saved.milestone_minutes.join(", "));
      setSuccess("桌宠设置已保存，桌面端会在下次轮询时同步。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "桌宠设置保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack desktop-pet-settings-page">
      <header className="page-header">
        <div><span className="page-kicker">桌面伴侣</span><h1>桌宠设置</h1></div>
        <p>配置天气、学习里程碑和桌宠提醒。窗口位置等设备选项保存在桌宠本机。</p>
      </header>
      <form className="desktop-pet-settings-form" onSubmit={(event) => void submit(event)} noValidate>
        {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
        {success ? <p className="settings-success" role="status">{success}</p> : null}
        <section className="settings-section" aria-labelledby="weather-title">
          <div className="settings-section-heading"><div><span className="pane-label">天气</span><h2 id="weather-title">下雨时切换动作</h2></div><label className="toggle-field"><input checked={form.weather_enabled} onChange={(event) => updateField("weather_enabled", event.currentTarget.checked)} type="checkbox" /><span>启用天气</span></label></div>
          <p>{helpText}</p>
          <div className="settings-grid">
            <label className="form-field"><span>位置名称</span><input disabled={isLoading} maxLength={120} onChange={(event) => updateField("location_label", event.currentTarget.value)} placeholder="例如：东京" value={form.location_label} /></label>
            <label className="form-field"><span>天气刷新</span><select disabled={isLoading || !form.weather_enabled} onChange={(event) => updateField("weather_refresh_minutes", Number(event.currentTarget.value))} value={form.weather_refresh_minutes}>{[5, 10, 15, 20, 30, 60, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label>
            <label className="form-field"><span>纬度</span><input disabled={isLoading || !form.weather_enabled} inputMode="decimal" max="90" min="-90" onChange={(event) => updateField("latitude", event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} placeholder="35.6762" step="any" type="number" value={form.latitude ?? ""} /></label>
            <label className="form-field"><span>经度</span><input disabled={isLoading || !form.weather_enabled} inputMode="decimal" max="180" min="-180" onChange={(event) => updateField("longitude", event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} placeholder="139.6503" step="any" type="number" value={form.longitude ?? ""} /></label>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="milestone-title">
          <div className="settings-section-heading"><div><span className="pane-label">学习节奏</span><h2 id="milestone-title">里程碑与提醒</h2></div></div>
          <div className="settings-grid settings-grid-wide">
            <label className="form-field"><span>里程碑分钟</span><input disabled={isLoading} onChange={(event) => setMilestoneInput(event.currentTarget.value)} placeholder="10, 20, 50" value={milestoneInput} /><small>正整数，自动去重和升序，最多 20 个。</small></label>
            <label className="form-field"><span>鼓励动画</span><select disabled={isLoading} onChange={(event) => updateField("milestone_display_seconds", Number(event.currentTarget.value))} value={form.milestone_display_seconds}>{[3, 5, 10, 15, 20, 30, 45, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</select></label>
          </div>
          <div className="settings-check-list"><label><input checked={form.show_notifications} disabled={isLoading} onChange={(event) => updateField("show_notifications", event.currentTarget.checked)} type="checkbox" />显示本地通知</label><label><input checked={form.open_page_on_study_start} disabled={isLoading} onChange={(event) => updateField("open_page_on_study_start", event.currentTarget.checked)} type="checkbox" />开始学习时自动打开对应训练页</label></div>
        </section>
        <div className="settings-actions"><button className="button button-primary" disabled={isLoading || isSaving} type="submit">{isSaving ? "正在保存…" : "保存桌宠设置"}</button></div>
      </form>
    </div>
  );
}
