export type StudyActivityType = "algorithm" | "interview" | "diary" | "reading" | "course" | "custom";

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
