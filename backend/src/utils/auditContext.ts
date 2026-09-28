import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Firm-wide audit trail expansion (2026-08-13) — lets `recordAuditLog` (utils/auditLog.ts)
 * automatically capture the current request's IP address and session id without every
 * one of the ~65 call sites across ~20 service files needing to thread `req` through
 * their own function signatures. One middleware in app.ts establishes the store for
 * every request (including pre-auth routes like /login, where the IP still matters);
 * requireAuth then fills in sessionId once the token is verified, by mutating the same
 * store object already on the chain — no second `als.run()`, no router-file changes.
 */
interface AuditContextStore {
  ip?: string;
  sessionId?: string;
}

const als = new AsyncLocalStorage<AuditContextStore>();

export function runWithAuditContext(store: AuditContextStore, fn: () => void): void {
  als.run(store, fn);
}

export function setAuditSessionId(sessionId: string): void {
  const store = als.getStore();
  if (store) store.sessionId = sessionId;
}

export function getAuditContext(): AuditContextStore | undefined {
  return als.getStore();
}
