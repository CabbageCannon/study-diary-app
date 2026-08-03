import { useCallback, useEffect, useReducer, useRef } from "react";

import { initialPetRuntimeState, petReducer } from "../state/petReducer";
import type { StudyStatus, WeatherState } from "../types";

export function usePetStateMachine() {
  const [state, dispatch] = useReducer(petReducer, initialPetRuntimeState);
  const milestoneTimeoutRef = useRef<number | null>(null);

  const setStudyStatus = useCallback((status: StudyStatus) => dispatch({ type: "study", status }), []);
  const setWeatherState = useCallback((weather: WeatherState) => dispatch({ type: "weather", weather }), []);
  const clearMilestone = useCallback(() => {
    if (milestoneTimeoutRef.current !== null) window.clearTimeout(milestoneTimeoutRef.current);
    milestoneTimeoutRef.current = null;
    dispatch({ type: "clear-milestone" });
  }, []);
  const triggerMilestone = useCallback((minutes: number, displaySeconds: number) => {
    if (milestoneTimeoutRef.current !== null) window.clearTimeout(milestoneTimeoutRef.current);
    dispatch({ type: "milestone", minutes });
    milestoneTimeoutRef.current = window.setTimeout(() => {
      milestoneTimeoutRef.current = null;
      dispatch({ type: "clear-milestone" });
    }, displaySeconds * 1000);
  }, []);

  useEffect(() => () => {
    if (milestoneTimeoutRef.current !== null) window.clearTimeout(milestoneTimeoutRef.current);
  }, []);

  return { state, setStudyStatus, setWeatherState, triggerMilestone, clearMilestone };
}
