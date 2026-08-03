import { resolveVisualState } from "./selectors";
import type { PetRuntimeState, StudyStatus, WeatherState } from "../types";

export type PetAction =
  | { type: "study"; status: StudyStatus }
  | { type: "weather"; weather: WeatherState }
  | { type: "milestone"; minutes: number }
  | { type: "clear-milestone" };

export const initialPetRuntimeState: PetRuntimeState = {
  visualState: "idle",
  transientState: null,
  studyStatus: "idle",
  weatherState: "unknown",
  currentMilestoneMinutes: null,
};

export function petReducer(state: PetRuntimeState, action: PetAction): PetRuntimeState {
  let next: PetRuntimeState;
  switch (action.type) {
    case "study":
      next = { ...state, studyStatus: action.status };
      break;
    case "weather":
      next = { ...state, weatherState: action.weather };
      break;
    case "milestone":
      next = { ...state, transientState: "milestone", currentMilestoneMinutes: action.minutes };
      break;
    case "clear-milestone":
      next = { ...state, transientState: null, currentMilestoneMinutes: null };
      break;
  }
  return { ...next, visualState: resolveVisualState(next) };
}
