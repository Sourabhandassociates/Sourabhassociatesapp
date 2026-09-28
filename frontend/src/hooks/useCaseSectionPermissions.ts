import { useEffect, useState } from "react";
import { api } from "../api/client";

/** Case Section Access (2026-08-17; extended 2026-08-18 with Facts/Arguments).
 * The ten-flag boolean map from GET /cases/section-permissions — drives which
 * Case Detail tabs render for the current staff actor. Fetched fresh on every
 * mount, matching useAccountsPermissions' exact pattern. Never used for
 * enforcement, only display — every backend route (the case-scoped sub-resource
 * GETs, and the redaction inside GET /cases/:id itself) re-checks the real
 * permission independently. */
export interface CaseSectionPermissions {
  overview: boolean;
  facts: boolean;
  arguments: boolean;
  documents: boolean;
  tasks: boolean;
  hearings: boolean;
  timeline: boolean;
  notes: boolean;
  billingExpenses: boolean;
  accounts: boolean;
}

const EMPTY: CaseSectionPermissions = {
  overview: false,
  facts: false,
  arguments: false,
  documents: false,
  tasks: false,
  hearings: false,
  timeline: false,
  notes: false,
  billingExpenses: false,
  accounts: false,
};

export function useCaseSectionPermissions() {
  const [permissions, setPermissions] = useState<CaseSectionPermissions>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<CaseSectionPermissions>("/cases/section-permissions")
      .then((res) => {
        if (!cancelled) setPermissions(res.data);
      })
      .catch(() => {
        if (!cancelled) setPermissions(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { permissions, loading };
}
