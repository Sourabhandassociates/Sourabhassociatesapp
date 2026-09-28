import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export function ProtectedRoute() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function StaffOnlyRoute() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.actorType !== "USER") return <Navigate to="/client-portal" replace />;
  return <Outlet />;
}

/** Client Portal Permissions (2026-08-14) — mirrors StaffOnlyRoute exactly, gating
 * the opposite way. A staff actor landing here (e.g. a stale bookmark) is sent to
 * the staff Dashboard rather than the login page, matching StaffOnlyRoute's own
 * "redirect to the other side" behavior rather than logging them out. */
export function ClientOnlyRoute() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.actorType !== "CLIENT") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
