export type ActorType = "USER" | "CLIENT";

export interface AuthState {
  accessToken: string;
  sessionId: string;
  actorType: ActorType;
  role: string;
  name: string;
  id: string;
  /** Milestone 4 (SRD Section 28 — MFA mandatory for Partner/Accounts) — true when
   * this role requires MFA but the account hasn't enrolled yet; a login-flow nudge,
   * not an enforced block (see backend auth.service.ts's module-level comment). */
  mfaSetupRequired?: boolean;
}

const STORAGE_KEY = "saa_auth";

/**
 * SRD Section 9.2 — persistent login: re-opening the app (or a page reload) restores
 * the session without re-prompting for credentials, until an explicit logout/
 * revocation clears it (Section 9.3). The refresh token itself is NOT stored here —
 * it lives only in an httpOnly cookie the browser manages (backend/src/utils/cookies.ts),
 * invisible to this (or any) JavaScript. Only the short-lived access token and
 * non-sensitive session metadata are kept in localStorage.
 */
export function getAuthState(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function setAuthState(state: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuthState() {
  localStorage.removeItem(STORAGE_KEY);
}
