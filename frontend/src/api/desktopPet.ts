import { request } from "./client";
import type { DesktopPetConfig, DesktopPetConfigUpdate } from "../types/desktopPet";

export function getDesktopPetConfig(): Promise<DesktopPetConfig> {
  return request<DesktopPetConfig>("/api/desktop-pet/config");
}

export function updateDesktopPetConfig(payload: Partial<DesktopPetConfigUpdate>): Promise<DesktopPetConfig> {
  return request<DesktopPetConfig>("/api/desktop-pet/config", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
