import { useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { AuthState, getAuthState, setAuthState, clearAuthState } from "./authStorage";
import { AuthContext } from "./authContextInstance";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => getAuthState());

  useEffect(() => {
    const onStorage = () => setAuth(getAuthState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function loginStaff(email: string, password: string) {
    const res = await api.post("/auth/login/staff", { email, password });
    if (res.data.mfaRequired) {
      return { mfaRequired: true as const, mfaChallengeToken: res.data.mfaChallengeToken as string };
    }
    const state: AuthState = {
      accessToken: res.data.accessToken,
      sessionId: decodeSessionId(res.data.accessToken),
      actorType: "USER",
      role: res.data.user.role,
      name: res.data.user.name,
      id: res.data.user.id,
      mfaSetupRequired: res.data.mfaSetupRequired,
    };
    setAuthState(state);
    setAuth(state);
    return undefined;
  }

  /** Milestone 4 (SRD Section 28 — MFA) — second step after `loginStaff` returned
   * `mfaRequired`; verifies the TOTP/backup code and completes the session the same
   * way a non-MFA login would. */
  async function completeMfaLogin(mfaChallengeToken: string, code: string) {
    const res = await api.post("/auth/login/mfa", { mfaChallengeToken, code });
    const state: AuthState = {
      accessToken: res.data.accessToken,
      sessionId: decodeSessionId(res.data.accessToken),
      actorType: "USER",
      role: res.data.user.role,
      name: res.data.user.name,
      id: res.data.user.id,
      mfaSetupRequired: res.data.mfaSetupRequired,
    };
    setAuthState(state);
    setAuth(state);
  }

  async function loginClient(clientId: string, password: string) {
    const res = await api.post("/auth/login/client", { clientId, password });
    const state: AuthState = {
      accessToken: res.data.accessToken,
      sessionId: decodeSessionId(res.data.accessToken),
      actorType: "CLIENT",
      role: "CLIENT",
      name: res.data.client.name,
      id: res.data.client.id,
    };
    setAuthState(state);
    setAuth(state);
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      clearAuthState();
      setAuth(null);
    }
  }

  return (
    <AuthContext.Provider value={{ auth, loginStaff, completeMfaLogin, loginClient, logout }}>{children}</AuthContext.Provider>
  );
}

function decodeSessionId(accessToken: string): string {
  const payload = JSON.parse(atob(accessToken.split(".")[1]));
  return payload.sessionId;
}
