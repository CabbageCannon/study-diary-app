import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { PetAvatar } from "./components/PetAvatar";
import { PetBubble } from "./components/PetBubble";
import { PetSettingsPanel } from "./components/PetSettingsPanel";
import { QuickActions } from "./components/QuickActions";
import { StudyTimerPanel } from "./components/StudyTimerPanel";
import { SyncStatus } from "./components/SyncStatus";
import { useDesktopPetConfig } from "./hooks/useDesktopPetConfig";
import { useInteractionMode } from "./hooks/useInteractionMode";
import { useMilestoneScheduler } from "./hooks/useMilestoneScheduler";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { usePetStateMachine } from "./hooks/usePetStateMachine";
import { useStudyTimer } from "./hooks/useStudyTimer";
import { useWeatherState } from "./hooks/useWeatherState";
import { getAccessToken, setAccessToken } from "./services/auth";
import { openActivityPage, openStudyApp } from "./services/appLinks";
import { notifyMilestone } from "./services/notifications";
import { loadWindowPreferences, saveWindowPreferences } from "./services/storage";
import { applyWindowPreferences, readAutostartState, restoreWindowPreferences, updateTrayStudyStatus } from "./services/window";
import type { InteractionMode, LocalWindowPreferences, StudyActivityType } from "./types";

type BubbleView = "actions" | "settings";

const initialPreferences: LocalWindowPreferences = {
  alwaysOnTop: true,
  interactionMode: "interactive",
  autostart: false,
  localNotifications: true,
  position: null,
};

export default function App() {
  const [accessToken, setAccessTokenState] = useState(getAccessToken());
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubbleView, setBubbleView] = useState<BubbleView>("actions");
  const [preferences, setPreferences] = useState<LocalWindowPreferences>(initialPreferences);
  const preferencesRef = useRef(preferences);
  const { state: petState, clearMilestone, setStudyStatus, setWeatherState, triggerMilestone } = usePetStateMachine();
  const configState = useDesktopPetConfig(accessToken);
  const weatherState = useWeatherState(configState.config, accessToken);
  const timerState = useStudyTimer(accessToken);
  const syncState = useOfflineSync(accessToken, timerState.setRemoteSessionId);

  const updatePreferences = useCallback(async (next: LocalWindowPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
    try {
      await saveWindowPreferences(next);
      await applyWindowPreferences(next);
    } catch (error) {
      console.error("[desktop-pet] Failed to apply window preferences.", error);
      throw error;
    }
  }, []);

  const saveWindowPosition = useCallback(async (position: { x: number; y: number }) => {
    const next = { ...preferencesRef.current, position };
    preferencesRef.current = next;
    setPreferences(next);
    await saveWindowPreferences(next);
  }, []);

  const {
    changeInteractionMode,
    feedback: interactionFeedback,
    interactionMode,
    restoreInteractive,
    toggleThrough,
  } = useInteractionMode({ preferences, onPreferencesChange: updatePreferences });

  useEffect(() => {
    let dispose: () => void = () => {};
    void loadWindowPreferences().then(async (stored) => {
      const autostart = await readAutostartState();
      const next = { ...stored, autostart: autostart || stored.autostart };
      preferencesRef.current = next;
      setPreferences(next);
      dispose = await restoreWindowPreferences(next, saveWindowPosition);
    }).catch((error) => console.error("[desktop-pet] Failed to restore window preferences.", error));
    return () => dispose();
  }, [saveWindowPosition]);

  useEffect(() => {
    setStudyStatus(timerState.timer?.status ?? "idle");
    if (timerState.timer?.status !== "running") clearMilestone();
  }, [clearMilestone, setStudyStatus, timerState.timer?.status]);

  useEffect(() => {
    setWeatherState(weatherState.weatherState);
  }, [setWeatherState, weatherState.weatherState]);

  useEffect(() => {
    void updateTrayStudyStatus(timerState.timer?.status ?? "idle");
  }, [timerState.timer?.status]);

  const handleMilestone = useCallback((largestMinutes: number, crossedMinutes: number[]) => {
    timerState.markTriggeredMilestones(crossedMinutes);
    triggerMilestone(largestMinutes, configState.config.milestone_display_seconds);
    void notifyMilestone(largestMinutes, configState.config.show_notifications && preferences.localNotifications);
  }, [configState.config.milestone_display_seconds, configState.config.show_notifications, preferences.localNotifications, timerState, triggerMilestone]);

  useMilestoneScheduler({
    timer: timerState.timer,
    elapsed: timerState.elapsed,
    milestones: configState.config.milestone_minutes,
    onMilestone: handleMilestone,
  });

  const openSettings = useCallback(() => {
    setBubbleView("settings");
    setBubbleOpen(true);
  }, []);

  const startStudy = useCallback(async (activity: StudyActivityType, title: string) => {
    await timerState.start(activity, title);
    if (configState.config.open_page_on_study_start) await openActivityPage(activity);
  }, [configState.config.open_page_on_study_start, timerState]);

  const saveAccessCode = useCallback((value: string) => {
    setAccessToken(value);
    setAccessTokenState(getAccessToken());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBubbleOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let unlisten: () => void = () => {};
    void listen<InteractionMode>("interaction-mode-command", (event) => {
      if (event.payload === "temporary") void restoreInteractive();
      else if (event.payload === "interactive" || event.payload === "through") void changeInteractionMode(event.payload);
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten();
  }, [changeInteractionMode, restoreInteractive]);

  useEffect(() => {
    let unlisten: () => void = () => {};
    void listen<string>("tray-command", (event) => {
      switch (event.payload) {
        case "start_study":
          void startStudy("reading", "自主学习");
          break;
        case "pause_resume":
          if (timerState.timer?.status === "running") void timerState.pause();
          else if (timerState.timer?.status === "paused") void timerState.resume();
          else setBubbleOpen(true);
          break;
        case "complete_study":
          void timerState.complete();
          break;
        case "open_app":
          void openStudyApp("/");
          break;
        case "open_settings":
          void openStudyApp("/settings/desktop-pet");
          break;
        case "autostart":
          void updatePreferences({ ...preferencesRef.current, autostart: !preferencesRef.current.autostart });
          break;
        case "always_on_top":
          void updatePreferences({ ...preferencesRef.current, alwaysOnTop: !preferencesRef.current.alwaysOnTop });
          break;
        case "mouse_through":
          toggleThrough();
          break;
        case "restore_interaction":
          void restoreInteractive();
          break;
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten();
  }, [restoreInteractive, startStudy, timerState, toggleThrough, updatePreferences]);

  return (
    <main className="pet-app">
      <div className="pet-stage">
        {bubbleOpen ? (
          <PetBubble onClose={() => setBubbleOpen(false)}>
            {bubbleView === "settings" ? (
              <PetSettingsPanel
                accessTokenSet={Boolean(accessToken)}
                interactionMode={interactionMode}
                onAccessTokenSave={saveAccessCode}
                onInteractionModeChange={changeInteractionMode}
                onPreferencesChange={updatePreferences}
                preferences={preferences}
              />
            ) : (
              <>
                <StudyTimerPanel elapsed={timerState.elapsed} onComplete={timerState.complete} onPause={timerState.pause} onResume={timerState.resume} onStart={startStudy} timer={timerState.timer} />
                <QuickActions onOpenAlgorithms={() => void openStudyApp("/algorithms")} onOpenDashboard={() => void openStudyApp("/")} onOpenDiary={() => void openStudyApp("/write")} onOpenInterview={() => void openStudyApp("/interview")} onOpenSettings={openSettings} />
                <SyncStatus error={timerState.syncError || configState.error} isSyncing={syncState.isSyncing} pendingCount={syncState.pendingCount} />
              </>
            )}
          </PetBubble>
        ) : null}
        <PetAvatar onClick={() => { setBubbleView("actions"); setBubbleOpen((open) => !open); }} onDoubleClick={() => void openStudyApp("/")} visualState={petState.visualState} />
      </div>
      {interactionFeedback ? <div aria-live="polite" className="interaction-feedback">{interactionFeedback}</div> : null}
      <div className="pet-status-line"><span>{petState.currentMilestoneMinutes ? `已完成 ${petState.currentMilestoneMinutes} 分钟` : weatherState.weather?.is_raining ? "下雨模式" : timerState.timer?.status === "running" ? "专注中" : "准备就绪"}</span></div>
    </main>
  );
}
