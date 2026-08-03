import { LazyStore } from "@tauri-apps/plugin-store";

import type { DesktopPetConfig, LocalWindowPreferences, PendingStudyEvent, StudyTimerState } from "../types";

const store = new LazyStore("desktop-pet.json", { autoSave: false });
const TIMER_KEY = "study-timer";
const PENDING_EVENTS_KEY = "pending-study-events";
const CONFIG_KEY = "desktop-pet-config";
const WINDOW_PREFERENCES_KEY = "window-preferences";

export const defaultWindowPreferences: LocalWindowPreferences = {
  alwaysOnTop: true,
  mouseThrough: false,
  autostart: false,
  localNotifications: true,
  position: null,
};

async function read<T>(key: string): Promise<T | null> {
  return (await store.get<T>(key)) ?? null;
}

async function write<T>(key: string, value: T): Promise<void> {
  await store.set(key, value);
  await store.save();
}

export const loadStudyTimer = () => read<StudyTimerState>(TIMER_KEY);
export const saveStudyTimer = (timer: StudyTimerState | null) => timer ? write(TIMER_KEY, timer) : store.delete(TIMER_KEY).then(() => store.save());
export const loadPendingEvents = async () => (await read<PendingStudyEvent[]>(PENDING_EVENTS_KEY)) ?? [];
export const savePendingEvents = (events: PendingStudyEvent[]) => write(PENDING_EVENTS_KEY, events);
export const loadCachedConfig = () => read<DesktopPetConfig>(CONFIG_KEY);
export const saveCachedConfig = (config: DesktopPetConfig) => write(CONFIG_KEY, config);
export const loadWindowPreferences = async () => ({ ...defaultWindowPreferences, ...(await read<LocalWindowPreferences>(WINDOW_PREFERENCES_KEY) ?? {}) });
export const saveWindowPreferences = (preferences: LocalWindowPreferences) => write(WINDOW_PREFERENCES_KEY, preferences);
