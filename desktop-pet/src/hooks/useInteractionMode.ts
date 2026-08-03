import { useCallback, useEffect, useRef, useState } from "react";

import { applyInteractionMode } from "../services/window";
import type { InteractionMode, LocalWindowPreferences } from "../types";

interface UseInteractionModeOptions {
  preferences: LocalWindowPreferences;
  onPreferencesChange: (preferences: LocalWindowPreferences) => Promise<void>;
}

export function useInteractionMode({ preferences, onPreferencesChange }: UseInteractionModeOptions) {
  const [interactionMode, setInteractionModeState] = useState<InteractionMode>(preferences.interactionMode);
  const [feedback, setFeedback] = useState<string | null>(null);
  const preferencesRef = useRef(preferences);
  const recoveryTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    preferencesRef.current = preferences;
    if (preferences.interactionMode !== "temporary") setInteractionModeState(preferences.interactionMode);
  }, [preferences]);

  useEffect(() => () => {
    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2200);
  }, []);

  const changeInteractionMode = useCallback(async (nextMode: Exclude<InteractionMode, "temporary">) => {
    const next = { ...preferencesRef.current, interactionMode: nextMode };
    setInteractionModeState(nextMode);
    showFeedback(nextMode === "through" ? "进入专注模式" : "我回来啦" );
    try {
      await onPreferencesChange(next);
    } catch (error) {
      console.error("[desktop-pet] Failed to change interaction mode.", error);
      setInteractionModeState(preferencesRef.current.interactionMode);
      showFeedback("交互模式切换失败");
    }
  }, [onPreferencesChange, showFeedback]);

  const restoreInteractive = useCallback(async () => {
    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    setInteractionModeState("temporary");
    showFeedback("我回来啦");
    try {
      await applyInteractionMode(preferencesRef.current.alwaysOnTop, "temporary");
    } catch (error) {
      console.error("[desktop-pet] Failed to restore pointer interaction.", error);
      setInteractionModeState(preferencesRef.current.interactionMode);
      showFeedback("恢复交互失败");
      return;
    }
    recoveryTimerRef.current = window.setTimeout(() => {
      void changeInteractionMode("interactive");
    }, 650);
  }, [changeInteractionMode, showFeedback]);

  const toggleThrough = useCallback(() => {
    if (preferencesRef.current.interactionMode === "through") void restoreInteractive();
    else void changeInteractionMode("through");
  }, [changeInteractionMode, restoreInteractive]);

  return { changeInteractionMode, feedback, interactionMode, restoreInteractive, toggleThrough };
}
