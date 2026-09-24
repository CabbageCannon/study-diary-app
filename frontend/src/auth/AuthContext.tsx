import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";

import { clearClientState, request, setAccessToken, setCacheUser } from "../api/client";
import { deleteReminderPush, defaultUserPreferences, normalizeUserPreferences, saveUserPreferences, unsubscribeBrowserPush, type UserPreferences } from "../services/userPreferences";
import { prefetchAppData } from "../services/appPrefetch";
import { supabase } from "./supabase";
import { copyLegacyAdminStorage, setStorageUser } from "./userStorage";

export interface CurrentUser {
  id: string;
  email: string;
  role: "admin" | "user";
  active: boolean;
  preferences: UserPreferences;
}

export interface AdminUser { id: string; email: string; role: string; active: boolean; created_at: string }

interface AuthValue {
  session: Session | null;
  me: CurrentUser | null;
  loading: boolean;
  recoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (preferences: UserPreferences) => Promise<void>;
  listUsers: () => Promise<AdminUser[]>;
  setUserActive: (id: string, active: boolean) => Promise<AdminUser>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(() => [window.location.hash.slice(1), window.location.search.slice(1)].some((query) => ["recovery", "invite"].includes(new URLSearchParams(query).get("type") ?? "")));

  useEffect(() => {
    let alive = true;
    let authVersion = 0;
    let enteredApp = false;
    async function applySession(next: Session | null, version: number) {
      clearClientState();
      setAccessToken(next?.access_token ?? "");
      setCacheUser(next?.user.id ?? null);
      setStorageUser(next?.user.id ?? null);
      setSession(next);
      setMe(null);
      setRecoveringPassword(false);
      if (!next) { enteredApp = false; if (alive) setLoading(false); return; }
      try {
        let profile = await request<Omit<CurrentUser, "preferences"> & { preferences?: Partial<UserPreferences> | null }>("/api/me");
        if (!alive || version !== authVersion) return;
        const preferencesEmpty = !profile.preferences || Object.keys(profile.preferences).length === 0;
        if (profile.role === "admin") {
          copyLegacyAdminStorage(profile.id);
          const legacyPreferences = preferencesEmpty ? readLegacyPreferences() : null;
          if (legacyPreferences) {
            profile = await request<CurrentUser>("/api/me/preferences", { method: "PATCH", body: JSON.stringify(legacyPreferences) });
            if (!alive || version !== authVersion) return;
          }
        }
        const normalized = { ...profile, preferences: normalizeUserPreferences(profile.preferences ?? defaultUserPreferences) };
        window.localStorage.setItem("study-diary:theme", normalized.preferences.theme);
        if (!enteredApp) {
          window.history.replaceState(null, "", "/today");
          enteredApp = true;
        }
        setMe(normalized);
        saveUserPreferences(normalized.preferences);
        void prefetchAppData();
      } catch (error) {
        if ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 403) await supabase.auth.signOut();
      } finally { if (alive && version === authVersion) setLoading(false); }
    }
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY" || (recoveringPassword && (event === "INITIAL_SESSION" || event === "SIGNED_IN"))) {
        authVersion += 1;
        clearClientState(); setAccessToken(""); setCacheUser(null); setStorageUser(null);
        setSession(next); setMe(null); setRecoveringPassword(true); setLoading(false); return;
      }
      if (event === "TOKEN_REFRESHED") { setAccessToken(next?.access_token ?? ""); setSession(next); return; }
      const version = ++authVersion;
      setLoading(true); void applySession(next, version);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session, me, loading, recoveringPassword,
    async signIn(email, password) { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; },
    async signUp(email, password) { const { data, error } = await supabase.auth.signUp({ email, password }); if (error) throw error; return !data.session; },
    async resetPassword(email) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (error) throw error; },
    async updatePassword(password) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; },
    async signOut() {
      const reminder = me?.preferences.reminder;
      if (reminder?.subscriptionId) await deleteReminderPush(reminder.subscriptionId).catch(() => undefined);
      await unsubscribeBrowserPush().catch(() => undefined);
      if (me && (reminder?.enabled || reminder?.subscriptionId)) {
        const preferences = { ...me.preferences, reminder: { ...me.preferences.reminder, enabled: false, subscriptionId: null } };
        await request("/api/me/preferences", { method: "PATCH", body: JSON.stringify(preferences) }).catch(() => undefined);
      }
      await supabase.auth.signOut(); clearClientState();
    },
    async updatePreferences(preferences) {
      const profile = await request<CurrentUser>("/api/me/preferences", { method: "PATCH", body: JSON.stringify(preferences) });
      const normalized = { ...profile, preferences: normalizeUserPreferences(profile.preferences) };
      setMe(normalized); saveUserPreferences(normalized.preferences);
    },
    listUsers: () => request<AdminUser[]>("/api/admin/users"),
    setUserActive: (id, active) => request<AdminUser>(`/api/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),
  }), [loading, me, recoveringPassword, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用"); return value; }

function readLegacyPreferences(): UserPreferences | null {
  try {
    const raw = window.localStorage.getItem("study-diary:user-preferences");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = normalizeUserPreferences(parsed as Partial<UserPreferences>);
    const goals = Object.values(value.dailyGoals);
    if (
      typeof value.nickname !== "string" || typeof value.targetRole !== "string" || typeof value.learningStyle !== "string"
      || !goals.every((goal) => Number.isFinite(goal))
      || typeof value.reminder.enabled !== "boolean" || typeof value.reminder.time !== "string"
      || !["mist", "clay", "night", "frost"].includes(value.theme)
    ) return null;
    return value;
  } catch { return null; }
}
