import { useEffect, useState } from "react";
import { api } from "../api/client";

interface CauseListPermission {
  view: boolean;
}

export function useCauseListPermission() {
  const [permission, setPermission] = useState<CauseListPermission>({ view: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CauseListPermission>("/hearings/cause-list/access")
      .then((res) => {
        if (!cancelled) setPermission(res.data);
      })
      .catch(() => {
        if (!cancelled) setPermission({ view: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { permission, loading };
}
