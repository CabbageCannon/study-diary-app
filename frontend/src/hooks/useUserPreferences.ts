import { useCallback, useEffect, useState } from "react";

import {
  loadUserPreferences,
  saveUserPreferences,
  USER_PREFERENCES_CHANGED_EVENT,
  type UserPreferences,
} from "../services/userPreferences";

export function useUserPreferences() {
  const [preferences, setPreferencesState] = useState(loadUserPreferences);

  useEffect(() => {
    const sync = () => setPreferencesState(loadUserPreferences());
    window.addEventListener("storage", sync);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, sync);
    };
  }, []);

  const setPreferences = useCallback((next: UserPreferences) => {
    saveUserPreferences(next);
    setPreferencesState(next);
  }, []);

  return [preferences, setPreferences] as const;
}
