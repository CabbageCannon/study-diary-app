import { request } from "./client";
import type {
  DesktopPetConfig,
  DesktopPetConfigUpdate,
  DesktopPetControlState,
  DesktopPetDashboard,
  ShowDesktopPetResponse,
} from "../types/desktopPet";

export function getDesktopPetConfig(): Promise<DesktopPetConfig> {
  return request<DesktopPetConfig>("/api/desktop-pet/config");
}

export function updateDesktopPetConfig(payload: Partial<DesktopPetConfigUpdate>): Promise<DesktopPetConfig> {
  return request<DesktopPetConfig>("/api/desktop-pet/config", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function currentStudyDateParams(): URLSearchParams {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return new URLSearchParams({
    date: localDate,
    timezone_offset_minutes: String(-now.getTimezoneOffset()),
  });
}

export function getDesktopPetDashboard(signal?: AbortSignal): Promise<DesktopPetDashboard> {
  return request<DesktopPetDashboard>(`/api/desktop-pet/dashboard?${currentStudyDateParams()}`, {
    signal,
    cache: "no-store",
  });
}

export function requestDesktopPetShow(): Promise<ShowDesktopPetResponse> {
  return request<ShowDesktopPetResponse>("/api/desktop-pet/control/show", { method: "POST" });
}

export function getDesktopPetControl(signal?: AbortSignal): Promise<DesktopPetControlState> {
  return request<DesktopPetControlState>("/api/desktop-pet/control", { signal });
}

export async function waitForDesktopPetShow(
  requestVersion: number,
  timeoutMs = 9_000,
): Promise<DesktopPetControlState | null> {
  const deadline = Date.now() + timeoutMs;
  let latest: DesktopPetControlState | null = null;
  while (Date.now() < deadline) {
    latest = await getDesktopPetControl();
    if (latest.show_acknowledged_version >= requestVersion) return latest;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
  }
  return latest;
}
