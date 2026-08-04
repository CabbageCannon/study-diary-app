export type PetVisualState = "idle" | "rain" | "studying" | "milestone";
export type StudyStatus = "idle" | "running" | "paused";
export type WeatherState = "unknown" | "clear" | "rain";
export type StudyActivityType = "algorithm" | "interview" | "diary" | "reading" | "course" | "custom";
export type InteractionMode = "interactive" | "through" | "temporary";
export const PET_SCALE_MIN = 0.75;
export const PET_SCALE_DEFAULT = 1;
export const PET_SCALE_MAX = 1.5;
export const PET_SCALE_STEP = 0.05;
export type PetScale = number;

export function clampPetScale(value: unknown): PetScale {
  if (typeof value !== "number" || !Number.isFinite(value)) return PET_SCALE_DEFAULT;
  const clamped = Math.min(Math.max(value, PET_SCALE_MIN), PET_SCALE_MAX);
  return Math.round(clamped * 100) / 100;
}

export interface PetRuntimeState {
  visualState: PetVisualState;
  transientState: "milestone" | null;
  studyStatus: StudyStatus;
  weatherState: WeatherState;
  currentMilestoneMinutes: number | null;
}

export interface StudyTimerState {
  localSessionId: string;
  remoteSessionId: string | null;
  clientEventId: string;
  activityType: StudyActivityType;
  title: string;
  status: Exclude<StudyStatus, "idle">;
  startedAt: number;
  lastResumedAt: number | null;
  accumulatedSeconds: number;
  triggeredMilestones: number[];
  createdAt: number;
  updatedAt: number;
}

export interface DesktopPetConfig {
  weather_enabled: boolean;
  location_label: string;
  latitude: number | null;
  longitude: number | null;
  weather_refresh_minutes: number;
  milestone_minutes: number[];
  milestone_display_seconds: number;
  show_notifications: boolean;
  open_page_on_study_start: boolean;
  updated_at: string;
}

export interface DesktopPetWeather {
  location: string;
  condition: string;
  is_raining: boolean;
  temperature_c: number | null;
  observed_at: string | null;
  provider: string;
  stale: boolean;
}

export interface PendingStudyEvent {
  clientEventId: string;
  type: "start" | "pause" | "resume" | "complete" | "abandon";
  occurredAt: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

export interface LocalWindowPreferences {
  alwaysOnTop: boolean;
  interactionMode: InteractionMode;
  autostart: boolean;
  localNotifications: boolean;
  position: { x: number; y: number } | null;
  scale: PetScale;
}

export interface StudySessionRemote {
  id: string;
  client_event_id: string;
  activity_type: StudyActivityType;
  title: string;
  status: "running" | "paused" | "completed" | "abandoned";
  accumulated_seconds: number;
}
