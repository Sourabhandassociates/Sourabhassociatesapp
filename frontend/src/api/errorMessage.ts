import axios from "axios";

/** Safely extracts the backend's `{ error: string }` message from a caught request
 * failure, without resorting to `catch (err: any)` at every call site. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return fallback;
}

/** Milestone 1 (SRD Section 10.2 — Advanced Conflict Check) — extracts the structured
 * `details` payload a ConflictCheckError carries (the possible-match list), if present. */
export function getErrorDetails<T>(err: unknown): T | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { details?: T } | undefined;
    return data?.details;
  }
  return undefined;
}
