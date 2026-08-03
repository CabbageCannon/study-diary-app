import { useCallback, useEffect, useRef, useState } from "react";

const LAST_ACTIVE_SESSION_KEY = "study-diary:interview:last-active-session";
const SAVE_DELAY_MS = 750;

export type InterviewDraftSaveState = "idle" | "saving" | "saved" | "local_only";

function draftKey(setId: number, questionId: string) {
  return `study-diary:interview:session:${setId}:question:${questionId}:draft`;
}

function writeDraft(key: string, value: string) {
  if (!value.trim()) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, value);
}

export function setLastActiveInterviewSession(setId: number) {
  window.localStorage.setItem(LAST_ACTIVE_SESSION_KEY, String(setId));
}

export function clearLastActiveInterviewSession(setId?: number) {
  if (!setId || window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY) === String(setId)) {
    window.localStorage.removeItem(LAST_ACTIVE_SESSION_KEY);
  }
}

export function getLastActiveInterviewSession() {
  const value = Number(window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function clearInterviewAnswerDraft(setId: number, questionId: string) {
  window.localStorage.removeItem(draftKey(setId, questionId));
}

export function clearInterviewSessionDrafts(setId: number) {
  const prefix = `study-diary:interview:session:${setId}:question:`;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.localStorage.removeItem(key);
    }
  }
}

interface UseInterviewAnswerDraftOptions {
  setId: number;
  questionId: string | null;
  enabled: boolean;
}

export function useInterviewAnswerDraft({ setId, questionId, enabled }: UseInterviewAnswerDraftOptions) {
  const key = questionId ? draftKey(setId, questionId) : null;
  const [value, setValue] = useState("");
  const [saveState, setSaveState] = useState<InterviewDraftSaveState>("idle");
  const [wasRestored, setWasRestored] = useState(false);
  const valueRef = useRef("");
  const hydratedKeyRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (!key || hydratedKeyRef.current !== key) {
      return;
    }
    try {
      writeDraft(key, valueRef.current);
      setSaveState(valueRef.current.trim() ? "saved" : "idle");
    } catch {
      setSaveState("local_only");
    }
  }, [key]);

  useEffect(() => {
    if (!key || !enabled) {
      hydratedKeyRef.current = null;
      setValue("");
      valueRef.current = "";
      setSaveState("idle");
      setWasRestored(false);
      return;
    }
    let restored = "";
    try {
      restored = window.localStorage.getItem(key) ?? "";
    } catch {
      setSaveState("local_only");
    }
    hydratedKeyRef.current = key;
    valueRef.current = restored;
    setValue(restored);
    setSaveState(restored ? "saved" : "idle");
    setWasRestored(Boolean(restored));
    return () => {
      if (hydratedKeyRef.current === key) {
        try {
          writeDraft(key, valueRef.current);
        } catch {
          // The current in-memory value remains editable even when browser storage is unavailable.
        }
      }
    };
  }, [enabled, key]);

  useEffect(() => {
    if (!key || !enabled || hydratedKeyRef.current !== key) {
      return;
    }
    if (!value.trim()) {
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, flush, key, value]);

  useEffect(() => {
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flush]);

  const updateValue = useCallback((nextValue: string) => {
    valueRef.current = nextValue;
    setValue(nextValue);
    setWasRestored(false);
  }, []);

  const clear = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        setSaveState("local_only");
      }
    }
    valueRef.current = "";
    setValue("");
    setSaveState("idle");
    setWasRestored(false);
  }, [key]);

  return { value, setValue: updateValue, saveState, wasRestored, clear, flush };
}
