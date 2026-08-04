export type StudyActivityType = "algorithm" | "interview" | "diary" | "reading" | "course" | "custom";

export type StudySessionStatus = "running" | "paused" | "completed" | "abandoned";

export interface StudySession {
  id: string;
  client_event_id: string;
  activity_type: StudyActivityType;
  title: string;
  status: StudySessionStatus;
  started_at: string;
  last_resumed_at: string | null;
  accumulated_seconds: number;
  updated_at: string;
}

export interface TodayStudyTopic {
  title: string;
  activity_type: StudyActivityType;
  study_seconds: number;
}

export interface DesktopPetDashboard {
  today_study_seconds: number;
  total_study_seconds: number;
  today_session_count: number;
  today_topic_count: number;
  today_topics: TodayStudyTopic[];
  active_session: StudySession | null;
  generated_at: string;
}

export interface DesktopPetControlState {
  show_request_version: number;
  show_acknowledged_version: number;
  show_requested_at: string | null;
  desktop_last_seen_at: string | null;
  show_request_pending: boolean;
}

export type ShowDesktopPetResponse = DesktopPetControlState;

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

export type DesktopPetConfigUpdate = Omit<DesktopPetConfig, "updated_at">;
