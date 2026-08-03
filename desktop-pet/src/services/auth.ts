let accessToken = "";

// The existing backend uses one short access code rather than device tokens.
// Keep it in memory so a long-lived credential is never written to Store.
export function getAccessToken(): string {
  return accessToken;
}

export function setAccessToken(value: string): void {
  accessToken = value.trim();
}

export function hasAccessToken(): boolean {
  return Boolean(accessToken);
}
