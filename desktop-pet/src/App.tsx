import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { PetAvatar } from "./components/PetAvatar";
import { PetBubble } from "./components/PetBubble";
import { PetSettingsPanel } from "./components/PetSettingsPanel";
import { QuickActions } from "./components/QuickActions";
import { StudyTimerPanel } from "./components/StudyTimerPanel";
import { SyncStatus } from "./components/SyncStatus";
import { useDesktopPetConfig } from "./hooks/useDesktopPetConfig";
import { useDesktopPetControl } from "./hooks/useDesktopPetControl";
import { useInteractionMode } from "./hooks/useInteractionMode";
import { useMilestoneScheduler } from "./hooks/useMilestoneScheduler";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { usePetStateMachine } from "./hooks/usePetStateMachine";
import { useStudyTimer } from "./hooks/useStudyTimer";
import { useWeatherState } from "./hooks/useWeatherState";
import { clearAccessToken, getAccessToken, loadAccessToken, setAccessToken } from "./services/auth";
import { openActivityPage, openStudyRoute } from "./services/appLinks";
import { notifyMilestone } from "./services/notifications";
import { loadWindowPreferences, saveWindowPreferences } from "./services/storage";
import { applyPetWindowLayout, applyWindowPreferences, hidePetWindow, readAutostartState, restoreWindowPreferences, updateTrayStudyStatus } from "./services/window";
import { clampPetScale, PET_SCALE_MAX, PET_SCALE_MIN, PET_SCALE_STEP } from "./types";
import type { InteractionMode, LocalWindowPreferences, PetScale, StudyActivityType } from "./types";
import type { StudyRouteKey } from "./services/appLinks";

type BubbleView = "actions" | "settings";

const initialPreferences: LocalWindowPreferences = {
  alwaysOnTop: true,
  interactionMode: "interactive",
  autostart: false,
  localNotifications: true,
  position: null,
  scale: 1,
};

export default function App() {
  const [accessToken, setAccessTokenState] = useState(getAccessToken());
  const [authReady, setAuthReady] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubbleView, setBubbleView] = useState<BubbleView>("actions");
  const [appFeedback, setAppFeedback] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<LocalWindowPreferences>(initialPreferences);
  const preferencesRef = useRef(preferences);
  const bubbleOpenRef = useRef(false);
  const bubbleLayoutRequestRef = useRef(0);
  const requestedScaleRef = useRef<PetScale>(preferences.scale);
  const pendingScaleRef = useRef<PetScale | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const scaleQueueRef = useRef<Promise<void> | null>(null);
  const { state: petState, clearMilestone, setStudyStatus, setWeatherState, triggerMilestone } = usePetStateMachine();
  const configState = useDesktopPetConfig(accessToken, authReady);
  useDesktopPetControl(accessToken, authReady);
  const weatherState = useWeatherState(configState.config, accessToken, authReady);
  const timerState = useStudyTimer(accessToken, authReady);
  const syncState = useOfflineSync(
    accessToken,
    authReady,
    timerState.setRemoteSessionId,
    timerState.markQueuedCompletionSynced,
  );

  const showAppFeedback = useCallback((message: string) => {
    setAppFeedback(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setAppFeedback(null), 3200);
  }, []);

  useEffect(() => {
    if (!timerState.completionNotice) return;
    showAppFeedback(timerState.completionNotice);
    timerState.clearCompletionNotice();
  }, [showAppFeedback, timerState.clearCompletionNotice, timerState.completionNotice]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

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

  const changePetScale = useCallback((scale: PetScale): Promise<void> => {
    const targetScale = clampPetScale(scale);
    requestedScaleRef.current = targetScale;
    pendingScaleRef.current = targetScale;
    if (scaleQueueRef.current) return scaleQueueRef.current;

    const drainScaleRequests = async () => {
      while (pendingScaleRef.current !== null) {
        const nextScale = pendingScaleRef.current;
        pendingScaleRef.current = null;
        const next = { ...preferencesRef.current, scale: nextScale };
        if (next.scale === preferencesRef.current.scale) continue;
        try {
          await applyPetWindowLayout(nextScale, bubbleOpenRef.current);
          await updatePreferences(next);
          showAppFeedback(`桌宠大小：${Math.round(nextScale * 100)}%`);
        } catch (error) {
          console.error("[desktop-pet] Failed to change pet scale.", error);
          pendingScaleRef.current = null;
          requestedScaleRef.current = preferencesRef.current.scale;
          showAppFeedback("调整桌宠大小失败");
          break;
        }
      }
    };

    const queued = drainScaleRequests().finally(() => {
      scaleQueueRef.current = null;
    });
    scaleQueueRef.current = queued;
    return queued;
  }, [showAppFeedback, updatePreferences]);

  const adjustPetScale = useCallback((direction: -1 | 1) => {
    const current = requestedScaleRef.current;
    const target = clampPetScale(current + direction * PET_SCALE_STEP);
    if (target === current) {
      showAppFeedback(direction > 0 ? "已经是最大大小" : "已经是最小大小");
      return;
    }
    requestedScaleRef.current = target;
    void changePetScale(target);
  }, [changePetScale, showAppFeedback]);

  const adjustPetScaleByWheel = useCallback((deltaY: number) => {
    const current = requestedScaleRef.current;
    const delta = Math.min(Math.max(-deltaY * 0.0005, -0.08), 0.08);
    const target = clampPetScale(current + delta);
    if (target === current) {
      if (current <= PET_SCALE_MIN || current >= PET_SCALE_MAX) {
        showAppFeedback(current <= PET_SCALE_MIN ? "已经是最小大小" : "已经是最大大小");
      }
      return;
    }
    requestedScaleRef.current = target;
    void changePetScale(target);
  }, [changePetScale, showAppFeedback]);

  const {
    changeInteractionMode,
    feedback: interactionFeedback,
    interactionMode,
    restoreInteractive,
    toggleThrough,
  } = useInteractionMode({ preferences, onPreferencesChange: updatePreferences });

  useEffect(() => {
    const blockWheelScroll = (event: WheelEvent) => event.preventDefault();
    window.addEventListener("wheel", blockWheelScroll, { passive: false });
    return () => window.removeEventListener("wheel", blockWheelScroll);
  }, []);

  const closeBubble = useCallback(() => {
    bubbleOpenRef.current = false;
    bubbleLayoutRequestRef.current += 1;
    setBubbleOpen(false);
    const layout = applyPetWindowLayout(requestedScaleRef.current, false);
    void layout.catch((error) => {
      console.error("[desktop-pet] Failed to close the pet panel layout.", error);
    });
    return layout;
  }, []);

  const hideDesktopPet = useCallback(async () => {
    try {
      await closeBubble();
      await hidePetWindow();
    } catch (error) {
      console.error("[desktop-pet] Failed to hide the pet window.", error);
      showAppFeedback("隐藏桌宠失败");
    }
  }, [closeBubble, showAppFeedback]);

  const openBubble = useCallback((view: BubbleView) => {
    const requestId = bubbleLayoutRequestRef.current + 1;
    bubbleLayoutRequestRef.current = requestId;
    bubbleOpenRef.current = true;
    setBubbleView(view);
    void applyPetWindowLayout(requestedScaleRef.current, true)
      .then(() => {
        if (bubbleLayoutRequestRef.current === requestId && bubbleOpenRef.current) setBubbleOpen(true);
      })
      .catch((error) => {
        if (bubbleLayoutRequestRef.current === requestId) {
          bubbleOpenRef.current = false;
          setBubbleOpen(false);
        }
        console.error("[desktop-pet] Failed to prepare the pet panel layout.", error);
      });
  }, []);

  const toggleActionsBubble = useCallback(() => {
    if (bubbleOpenRef.current) closeBubble();
    else openBubble("actions");
  }, [closeBubble, openBubble]);

  useEffect(() => {
    if (interactionMode === "through") closeBubble();
  }, [closeBubble, interactionMode]);

  useEffect(() => {
    let cancelled = false;
    let dispose: () => void = () => {};
    void loadWindowPreferences().then(async (stored) => {
      let autostart = stored.autostart;
      try {
        autostart = (await readAutostartState()) || stored.autostart;
      } catch (error) {
        if (!cancelled) console.warn("[desktop-pet] Unable to read the autostart state; using the stored preference.", error);
      }
      if (cancelled) return;
      const next = { ...stored, autostart };
      preferencesRef.current = next;
      requestedScaleRef.current = next.scale;
      setPreferences(next);
      const nextDispose = await restoreWindowPreferences(next, saveWindowPosition);
      if (cancelled) nextDispose();
      else dispose = nextDispose;
    }).catch((error) => console.error("[desktop-pet] Failed to restore window preferences.", error));
    return () => {
      cancelled = true;
      dispose();
    };
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
    if (bubbleOpenRef.current) setBubbleView("settings");
    else openBubble("settings");
  }, [openBubble]);

  const startStudy = useCallback(async (activity: StudyActivityType, title: string) => {
    await timerState.start(activity, title);
    if (configState.config.open_page_on_study_start) {
      try {
        await openActivityPage(activity);
      } catch (error) {
        console.error("[desktop-pet] Failed to open the study activity page.", error);
        showAppFeedback(error instanceof Error ? error.message : "无法打开学习系统");
      }
    }
  }, [configState.config.open_page_on_study_start, showAppFeedback, timerState]);

  const openRouteFromPet = useCallback(async (route: StudyRouteKey) => {
    try {
      await openStudyRoute(route);
    } catch (error) {
      console.error("[desktop-pet] Failed to open a study route.", error);
      showAppFeedback(error instanceof Error ? error.message : "无法打开学习系统");
    }
  }, [showAppFeedback]);

  const openMainStudyApp = useCallback(() => {
    void openRouteFromPet("dashboard");
  }, [openRouteFromPet]);

  const saveAccessCode = useCallback(async (value: string) => {
    await setAccessToken(value);
    setAccessTokenState(getAccessToken());
  }, []);

  const removeAccessCode = useCallback(async () => {
    await clearAccessToken();
    setAccessTokenState("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAccessToken()
      .then((token) => {
        if (!cancelled) setAccessTokenState(token);
      })
      .catch((error) => {
        console.error("[desktop-pet] Failed to restore the saved access code.", error);
        if (!cancelled) showAppFeedback("无法读取系统凭据，请重新输入访问码");
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => { cancelled = true; };
  }, [showAppFeedback]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBubble();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeBubble]);

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
          else openBubble("actions");
          break;
        case "complete_study":
          void timerState.complete();
          break;
        case "open_app":
          void openRouteFromPet("dashboard");
          break;
        case "open_settings":
          void openRouteFromPet("desktopPetSettings");
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
        case "decrease_scale":
          adjustPetScale(-1);
          break;
        case "reset_scale":
          void changePetScale(1);
          break;
        case "increase_scale":
          adjustPetScale(1);
          break;
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten();
  }, [adjustPetScale, changePetScale, openRouteFromPet, restoreInteractive, startStudy, timerState, toggleThrough, updatePreferences]);

  return (
    <main className="pet-app">
      {bubbleOpen ? (
        <PetBubble onClose={() => void closeBubble()} onHide={hideDesktopPet}>
          {bubbleView === "settings" ? (
            <PetSettingsPanel
              accessTokenSet={Boolean(accessToken)}
              onAccessTokenClear={removeAccessCode}
              interactionMode={interactionMode}
              onAccessTokenSave={saveAccessCode}
              onInteractionModeChange={changeInteractionMode}
              onPreferencesChange={updatePreferences}
              preferences={preferences}
            />
          ) : (
            <>
              <StudyTimerPanel authReady={authReady} elapsed={timerState.elapsed} isCompleting={timerState.isCompleting} onComplete={timerState.complete} onPause={timerState.pause} onResume={timerState.resume} onStart={startStudy} timer={timerState.timer} />
              <QuickActions onOpenLocalSettings={openSettings} onOpenRoute={openStudyRoute} onRouteOpened={closeBubble} />
              <SyncStatus error={timerState.syncError || syncState.error || configState.error} isSyncing={syncState.isSyncing} pendingCount={syncState.pendingCount} />
            </>
          )}
        </PetBubble>
      ) : null}
      <div className="pet-stage">
        <PetAvatar onClick={toggleActionsBubble} onDoubleClick={openMainStudyApp} onScaleWheel={adjustPetScaleByWheel} visualState={petState.visualState} />
      </div>
      {interactionFeedback || appFeedback || timerState.completionNotice ? <div aria-live="polite" className="interaction-feedback">{interactionFeedback ?? appFeedback ?? timerState.completionNotice}</div> : null}
    </main>
  );
}
