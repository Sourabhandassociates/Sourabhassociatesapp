import { createContext } from "react";
import { AuthState } from "./authStorage";

export interface AuthContextValue {
  auth: AuthState | null;
  /** Milestone 4 (SRD Section 28 — MFA) — resolves with `{mfaRequired: true,
   * mfaChallengeToken}` instead of setting auth state when the account has MFA
   * enabled; the caller must then call `completeMfaLogin` with a valid code. */
  loginStaff: (email: string, password: string) => Promise<{ mfaRequired: true; mfaChallengeToken: string } | undefined>;
  completeMfaLogin: (mfaChallengeToken: string, code: string) => Promise<void>;
  loginClient: (clientId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// In its own file (not AuthContext.tsx) so that file can export only the AuthProvider
// component — Vite's Fast Refresh requires a component-only file to hot-reload
// correctly instead of forcing a full page reload on every edit.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
