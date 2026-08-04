import { invoke } from "@tauri-apps/api/core";
import { availableMonitors, getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import type { Monitor } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

import type { InteractionMode, LocalWindowPreferences, PetScale } from "../types";

export const PET_BASE_SIZE = { width: 280, height: 292 } as const;
export const PET_PANEL_SIZE = { width: 236, height: 220 } as const;
const PET_PANEL_GAP = 8;
const PET_WINDOW_RENDER_PADDING = 10;

type PanelPlacement = "right" | "left" | "bottom" | "top";

interface PetWindowFrame {
  width: number;
  height: number;
  petOffsetX: number;
  petOffsetY: number;
  panelX: number;
  panelY: number;
  placement: PanelPlacement;
}

let currentFrame: PetWindowFrame = {
  width: PET_BASE_SIZE.width,
  height: PET_BASE_SIZE.height,
  petOffsetX: 0,
  petOffsetY: 0,
  panelX: 0,
  panelY: 0,
  placement: "right",
};
let currentScale: PetScale = 1;
let petWindowLayoutQueue: Promise<void> = Promise.resolve();
let activeNativeDrag: Promise<void> | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function applyWindowPreferences(preferences: LocalWindowPreferences): Promise<void> {
  if (!isTauriRuntime()) return;
  await applyInteractionMode(preferences.alwaysOnTop, preferences.interactionMode);
  const autostartEnabled = await isEnabled();
  if (preferences.autostart && !autostartEnabled) await enable();
  else if (!preferences.autostart && autostartEnabled) await disable();
  await invoke("set_autostart_checked", { enabled: preferences.autostart });
}

function setCssPixels(name: string, value: number): void {
  document.documentElement.style.setProperty(name, `${Math.round(value * 100) / 100}px`);
}

function applyPetWindowCss(scale: PetScale, frame: PetWindowFrame): void {
  document.documentElement.style.setProperty("--pet-scale", String(scale));
  setCssPixels("--pet-window-width", frame.width);
  setCssPixels("--pet-window-height", frame.height);
  setCssPixels("--pet-offset-x", frame.petOffsetX);
  setCssPixels("--pet-offset-y", frame.petOffsetY);
  setCssPixels("--pet-panel-x", frame.panelX);
  setCssPixels("--pet-panel-y", frame.panelY);
  document.documentElement.dataset.petPanelPlacement = frame.placement;
}

function buildPetWindowFrame(scale: PetScale, panelOpen: boolean, placement: PanelPlacement): PetWindowFrame {
  const petWidth = PET_BASE_SIZE.width * scale;
  const petHeight = PET_BASE_SIZE.height * scale;
  if (!panelOpen) {
    return {
      width: Math.ceil(petWidth + PET_WINDOW_RENDER_PADDING),
      height: Math.ceil(petHeight + PET_WINDOW_RENDER_PADDING),
      petOffsetX: 0,
      petOffsetY: 0,
      panelX: 0,
      panelY: 0,
      placement,
    };
  }

  if (placement === "left" || placement === "right") {
    const width = Math.ceil(petWidth + PET_PANEL_GAP + PET_PANEL_SIZE.width + PET_WINDOW_RENDER_PADDING);
    const height = Math.ceil(Math.max(petHeight, PET_PANEL_SIZE.height) + PET_WINDOW_RENDER_PADDING);
    const petOffsetX = placement === "left" ? PET_PANEL_SIZE.width + PET_PANEL_GAP : 0;
    const panelX = placement === "left" ? 0 : petWidth + PET_PANEL_GAP;
    return {
      width,
      height,
      petOffsetX,
      petOffsetY: (height - petHeight) / 2,
      panelX,
      panelY: (height - PET_PANEL_SIZE.height) / 2,
      placement,
    };
  }

  const width = Math.ceil(Math.max(petWidth, PET_PANEL_SIZE.width) + PET_WINDOW_RENDER_PADDING);
  const height = Math.ceil(petHeight + PET_PANEL_GAP + PET_PANEL_SIZE.height + PET_WINDOW_RENDER_PADDING);
  const petOffsetY = placement === "top" ? PET_PANEL_SIZE.height + PET_PANEL_GAP : 0;
  const panelY = placement === "top" ? 0 : petHeight + PET_PANEL_GAP;
  return {
    width,
    height,
    petOffsetX: (width - petWidth) / 2,
    petOffsetY,
    panelX: (width - PET_PANEL_SIZE.width) / 2,
    panelY,
    placement,
  };
}

function monitorForPosition(monitors: Monitor[], position: { x: number; y: number }): Monitor | null {
  const monitor = monitors.find((candidate) => (
    position.x >= candidate.position.x
    && position.x < candidate.position.x + candidate.size.width
    && position.y >= candidate.position.y
    && position.y < candidate.position.y + candidate.size.height
  )) ?? monitors
    .map((candidate) => {
      const centerX = candidate.workArea.position.x + candidate.workArea.size.width / 2;
      const centerY = candidate.workArea.position.y + candidate.workArea.size.height / 2;
      return {
        monitor: candidate,
        distance: Math.hypot(position.x - centerX, position.y - centerY),
      };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.monitor;
  return monitor ?? null;
}

function pickPanelPlacement(
  petPosition: { x: number; y: number },
  scale: PetScale,
  monitor: Monitor,
): PanelPlacement {
  const factor = monitor.scaleFactor;
  const workLeft = monitor.workArea.position.x;
  const workTop = monitor.workArea.position.y;
  const workRight = workLeft + monitor.workArea.size.width;
  const workBottom = workTop + monitor.workArea.size.height;
  const petWidth = PET_BASE_SIZE.width * scale * factor;
  const petHeight = PET_BASE_SIZE.height * scale * factor;
  const gap = PET_PANEL_GAP * factor;
  const panelWidth = PET_PANEL_SIZE.width * factor;
  const panelHeight = PET_PANEL_SIZE.height * factor;
  const options: Array<{ placement: PanelPlacement; free: number; need: number }> = [
    { placement: "right", free: workRight - (petPosition.x + petWidth), need: panelWidth + gap },
    { placement: "left", free: petPosition.x - workLeft, need: panelWidth + gap },
    { placement: "bottom", free: workBottom - (petPosition.y + petHeight), need: panelHeight + gap },
    { placement: "top", free: petPosition.y - workTop, need: panelHeight + gap },
  ];
  const fitting = options.filter((option) => option.free >= option.need);
  return (fitting.length ? fitting : options).sort((a, b) => (b.free - b.need) - (a.free - a.need))[0].placement;
}

function clampWindowPosition(
  position: { x: number; y: number },
  frame: PetWindowFrame,
  monitor: Monitor,
): { x: number; y: number } {
  const width = frame.width * monitor.scaleFactor;
  const height = frame.height * monitor.scaleFactor;
  const minX = monitor.workArea.position.x;
  const minY = monitor.workArea.position.y;
  const maxX = Math.max(minX, minX + monitor.workArea.size.width - width);
  const maxY = Math.max(minY, minY + monitor.workArea.size.height - height);
  return {
    x: Math.round(Math.min(Math.max(position.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(position.y, minY), maxY)),
  };
}

async function readCurrentPetPosition(monitors: Monitor[]): Promise<{ x: number; y: number }> {
  const appWindow = getCurrentWindow();
  const windowPosition = await appWindow.outerPosition();
  const monitor = monitorForPosition(monitors, windowPosition) ?? monitors[0];
  const factor = monitor?.scaleFactor ?? 1;
  return {
    x: windowPosition.x + currentFrame.petOffsetX * factor,
    y: windowPosition.y + currentFrame.petOffsetY * factor,
  };
}

async function setVerifiedWindowSize(
  appWindow: ReturnType<typeof getCurrentWindow>,
  frame: PetWindowFrame,
): Promise<PetWindowFrame> {
  if (activeNativeDrag) await activeNativeDrag.catch(() => undefined);
  await appWindow.setSize(new LogicalSize(frame.width, frame.height));

  const factor = await appWindow.scaleFactor();
  const logicalSize = (await appWindow.innerSize()).toLogical(factor);
  const missingWidth = Math.max(0, Math.ceil(frame.width - logicalSize.width));
  const missingHeight = Math.max(0, Math.ceil(frame.height - logicalSize.height));
  if (missingWidth === 0 && missingHeight === 0) return frame;

  const correctedFrame = {
    ...frame,
    width: frame.width + missingWidth,
    height: frame.height + missingHeight,
  };
  await appWindow.setSize(new LogicalSize(correctedFrame.width, correctedFrame.height));

  const verifiedSize = (await appWindow.innerSize()).toLogical(factor);
  if (verifiedSize.width + 0.5 < frame.width || verifiedSize.height + 0.5 < frame.height) {
    throw new Error(`Desktop pet window stayed smaller than its content (${verifiedSize.width}x${verifiedSize.height}, expected at least ${frame.width}x${frame.height}).`);
  }
  return correctedFrame;
}

async function commitPetWindowLayout(
  scale: PetScale,
  panelOpen: boolean,
  preferredPetPosition?: { x: number; y: number } | null,
): Promise<void> {
  const fallbackFrame = buildPetWindowFrame(scale, panelOpen, currentFrame.placement);
  if (!isTauriRuntime()) {
    currentFrame = fallbackFrame;
    currentScale = scale;
    applyPetWindowCss(scale, fallbackFrame);
    return;
  }

  const appWindow = getCurrentWindow();
  const monitors = await availableMonitors();
  const petPosition = preferredPetPosition ?? await readCurrentPetPosition(monitors);
  const monitor = monitorForPosition(monitors, petPosition);
  if (!monitor) return;

  const placement = panelOpen ? pickPanelPlacement(petPosition, scale, monitor) : currentFrame.placement;
  const frame = buildPetWindowFrame(scale, panelOpen, placement);
  const previousFrame = currentFrame;
  const previousScale = currentScale;
  const canShrinkContentFirst = frame.width <= previousFrame.width
    && frame.height <= previousFrame.height
    && frame.placement === previousFrame.placement
    && frame.petOffsetX === previousFrame.petOffsetX
    && frame.petOffsetY === previousFrame.petOffsetY;

  if (canShrinkContentFirst) applyPetWindowCss(scale, frame);

  let appliedFrame: PetWindowFrame;
  try {
    appliedFrame = await setVerifiedWindowSize(appWindow, frame);
  } catch (error) {
    if (canShrinkContentFirst) applyPetWindowCss(previousScale, previousFrame);
    throw error;
  }

  const targetWindowPosition = clampWindowPosition({
    x: petPosition.x - appliedFrame.petOffsetX * monitor.scaleFactor,
    y: petPosition.y - appliedFrame.petOffsetY * monitor.scaleFactor,
  }, appliedFrame, monitor);

  await appWindow.setPosition(new PhysicalPosition(targetWindowPosition.x, targetWindowPosition.y));
  if (!canShrinkContentFirst) applyPetWindowCss(scale, appliedFrame);
  else if (appliedFrame !== frame) applyPetWindowCss(scale, appliedFrame);
  currentFrame = appliedFrame;
  currentScale = scale;
  await invoke("update_pet_scale", { scale });
}

export function applyPetWindowLayout(
  scale: PetScale,
  panelOpen: boolean,
  preferredPetPosition?: { x: number; y: number } | null,
): Promise<void> {
  const commit = () => commitPetWindowLayout(scale, panelOpen, preferredPetPosition);
  const queued = petWindowLayoutQueue.then(commit, commit);
  petWindowLayoutQueue = queued.catch(() => undefined);
  return queued;
}

export function applyPetScale(scale: PetScale): Promise<void> {
  return applyPetWindowLayout(scale, false);
}

export function startPetDragging(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  if (activeNativeDrag) return activeNativeDrag;

  const trackedDrag = getCurrentWindow().startDragging().finally(() => {
    if (activeNativeDrag === trackedDrag) activeNativeDrag = null;
  });
  activeNativeDrag = trackedDrag;
  return trackedDrag;
}

export async function applyInteractionMode(alwaysOnTop: boolean, interactionMode: InteractionMode): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("apply_window_preferences", {
    alwaysOnTop,
    interactionMode,
  });
}

export async function hidePetWindow(): Promise<void> {
  if (!isTauriRuntime()) throw new Error("隐藏桌宠只能在桌面端应用中执行。");
  await invoke("hide_pet_window");
}

export async function showPetWindow(): Promise<void> {
  if (!isTauriRuntime()) throw new Error("显示桌宠只能在桌面端应用中执行。");
  await invoke("show_pet_window");
}

export async function restoreWindowPreferences(
  preferences: LocalWindowPreferences,
  onPositionChange: (position: { x: number; y: number }) => Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  await applyWindowPreferences(preferences);
  await applyPetWindowLayout(preferences.scale, false, preferences.position);
  const appWindow = getCurrentWindow();
  let timer: number | null = null;
  const unlisten = await appWindow.onMoved(async () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const monitors = await availableMonitors();
        const petPosition = await readCurrentPetPosition(monitors);
        const monitor = monitorForPosition(monitors, petPosition);
        if (monitor) {
          const windowPosition = await appWindow.outerPosition();
          const clamped = clampWindowPosition(windowPosition, currentFrame, monitor);
          if (clamped.x !== windowPosition.x || clamped.y !== windowPosition.y) {
            await appWindow.setPosition(new PhysicalPosition(clamped.x, clamped.y));
          }
        }
        const nextPetPosition = await readCurrentPetPosition(monitors);
        await onPositionChange({ x: Math.round(nextPetPosition.x), y: Math.round(nextPetPosition.y) });
      } catch (error) {
        console.error("[desktop-pet] Failed to save the pet window position.", error);
      }
    }, 160);
  });
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    unlisten();
  };
}

export async function readAutostartState(): Promise<boolean> {
  return isTauriRuntime() ? isEnabled() : false;
}

export async function updateTrayStudyStatus(status: "idle" | "running" | "paused"): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("update_study_status", { studyStatus: status });
}
