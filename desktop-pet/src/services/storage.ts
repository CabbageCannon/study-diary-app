import { LazyStore } from "@tauri-apps/plugin-store";

import { clampPetScale } from "../types";
import type { DesktopPetConfig, InteractionMode, LocalWindowPreferences, PendingStudyEvent, PetScale, StudyTimerState } from "../types";
import { persistentInteractionMode } from "../state/interactionState";

const store = new LazyStore("desktop-pet.json", { autoSave: false });
const TIMER_KEY = "study-timer";
const PENDING_EVENTS_KEY = "pending-study-events";
const CONFIG_KEY = "desktop-pet-config";
const WINDOW_PREFERENCES_KEY = "window-preferences";

export const defaultWindowPreferences: LocalWindowPreferences = {
  alwaysOnTop: true,
  interactionMode: "interactive",
  autostart: false,
  localNotifications: true,
  position: null,
  scale: 1,
};

export function normalizePetScale(value: unknown): PetScale {
  return clampPetScale(value);
}

async function read<T>(key: string): Promise<T | null> {
  return (await store.get<T>(key)) ?? null;
}

async function write<T>(key: string, value: T): Promise<void> {
  try {
    await store.set(key, value);
    await store.save();
  } catch (error) {
    console.error(`[desktop-pet] Failed to save ${key}.`, error);
    throw error;
  }
}

export const loadStudyTimer = () => read<StudyTimerState>(TIMER_KEY);
export const saveStudyTimer = (timer: StudyTimerState | null) => timer ? write(TIMER_KEY, timer) : store.delete(TIMER_KEY).then(() => store.save());
export const loadPendingEvents = async () => (await read<PendingStudyEvent[]>(PENDING_EVENTS_KEY)) ?? [];
export const savePendingEvents = (events: PendingStudyEvent[]) => write(PENDING_EVENTS_KEY, events);
export const loadCachedConfig = () => read<DesktopPetConfig>(CONFIG_KEY);
export const saveCachedConfig = (config: DesktopPetConfig) => write(CONFIG_KEY, config);
type StoredWindowPreferences = Partial<LocalWindowPreferences> & { mouseThrough?: boolean };

export async function loadWindowPreferences(): Promise<LocalWindowPreferences> {
  const stored = await read<StoredWindowPreferences>(WINDOW_PREFERENCES_KEY);
  const legacyMode: InteractionMode = stored?.mouseThrough ? "through" : "interactive";
  const interactionMode = persistentInteractionMode(stored?.interactionMode ?? legacyMode);
  const scale = normalizePetScale(stored?.scale);
  const preferences = {
    ...defaultWindowPreferences,
    ...stored,
    interactionMode,
    scale,
  };

  if (stored && (stored.interactionMode === "temporary" || stored.interactionMode === undefined || stored.scale !== scale)) {
    await write(WINDOW_PREFERENCES_KEY, preferences);
  }
  return preferences;
}

export const saveWindowPreferences = (preferences: LocalWindowPreferences) => write(
  WINDOW_PREFERENCES_KEY,
  { ...preferences, interactionMode: persistentInteractionMode(preferences.interactionMode) },
);
