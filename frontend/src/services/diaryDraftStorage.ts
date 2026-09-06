import type { DiaryDraft } from "../types/diary";

const STORAGE_KEY = "study-diary:diary:working-draft";

export interface DiaryDraftSnapshot {
  version: 1;
  savedAt: string;
  date: string;
  rawText: string;
  draft: DiaryDraft | null;
  feedback: string;
}

export type DiaryDraftSnapshotInput = Omit<DiaryDraftSnapshot, "version" | "savedAt">;

function isDiaryDraft(value: unknown): value is DiaryDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.date === "string"
    && typeof candidate.raw_text === "string"
    && typeof candidate.title === "string"
    && typeof candidate.polished_text === "string"
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.tags)
    && candidate.tags.every((tag) => typeof tag === "string")
  );
}

export function loadDiaryDraftSnapshot(): DiaryDraftSnapshot | null {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;
    const value = JSON.parse(rawValue) as Record<string, unknown>;
    if (
      value.version !== 1
      || typeof value.savedAt !== "string"
      || typeof value.date !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
      || typeof value.rawText !== "string"
      || typeof value.feedback !== "string"
      || (value.draft !== null && !isDiaryDraft(value.draft))
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value as unknown as DiaryDraftSnapshot;
  } catch {
    return null;
  }
}

export function saveDiaryDraftSnapshot(input: DiaryDraftSnapshotInput): DiaryDraftSnapshot | null {
  const snapshot: DiaryDraftSnapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...input,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function clearDiaryDraftSnapshot() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Local draft persistence is best-effort and must never block editing.
  }
}

export function diaryDraftContentKey(input: DiaryDraftSnapshotInput) {
  return JSON.stringify({
    date: input.date,
    rawText: input.rawText,
    draft: input.draft,
    feedback: input.feedback,
  });
}
