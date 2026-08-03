import type { InteractionMode } from "../types";

export const isThroughMode = (mode: InteractionMode) => mode === "through";

// `temporary` only describes the short recovery transition. It must never be
// restored on a later launch because the user has regained direct control.
export const persistentInteractionMode = (mode: InteractionMode): Exclude<InteractionMode, "temporary"> => (
  mode === "temporary" ? "interactive" : mode
);
