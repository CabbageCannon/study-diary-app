let currentUserId = "anonymous";

export function setStorageUser(userId: string | null) {
  currentUserId = userId || "anonymous";
}

export function userStorageKey(key: string) {
  return scopedUserStorageKey(currentUserId, key);
}

export function scopedUserStorageKey(userId: string, key: string) {
  return `study-diary:user:${userId}:${key.replace(/^study-diary:/, "")}`;
}

export function copyLegacyAdminStorage(userId: string) {
  try {
    const marker = scopedUserStorageKey(userId, "legacy-imported");
    if (window.localStorage.getItem(marker)) return;
    const legacyKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && (
        key === "study-diary:diary:working-draft"
        || key === "study-diary:review-baseline"
        || key.startsWith("study-diary:interview:")
        || key.startsWith("study-diary:algorithm:")
      )) legacyKeys.push(key);
    }
    for (const key of legacyKeys) {
      const target = scopedUserStorageKey(userId, key);
      const value = window.localStorage.getItem(key);
      if (value !== null && window.localStorage.getItem(target) === null) window.localStorage.setItem(target, value);
    }
    window.localStorage.setItem(marker, "1");
  } catch {
    // Local migration is best-effort when browser storage is unavailable.
  }
}

if (import.meta.env.DEV) console.assert(scopedUserStorageKey("a", "draft") !== scopedUserStorageKey("b", "draft"), "用户本地数据必须隔离");
