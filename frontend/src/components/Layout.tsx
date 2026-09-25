import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  ListChecks,
  CalendarDays,
  ScrollText,
  UserCog,
  ClipboardList,
  Settings,
  Trash2,
  ShieldCheck,
  Calendar as CalendarIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Contact as ContactIcon,
  Wallet,
  Search,
  BarChart3,
  Wrench,
  Building2,
  ListPlus,
  History,
  Monitor,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { NotificationBell } from "./NotificationBell";
import { useAccountsPermissions } from "../hooks/useAccountsPermissions";

const MIN_WIDTH = 70;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 240;
const COLLAPSED_WIDTH = MIN_WIDTH;
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
const PREFS_KEY = "saa_sidebar_prefs";

interface SidebarPrefs {
  width: number;
  collapsed: boolean;
}

function loadPrefs(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(parsed.width) || DEFAULT_WIDTH)),
        collapsed: !!parsed.collapsed,
      };
    }
  } catch {
    // corrupt/unavailable storage — fall through to defaults
  }
  return { width: DEFAULT_WIDTH, collapsed: false };
}

/** Renders the white-on-transparent logo variant (for the blue sidebar) if
 * `frontend/public/logo-white.png` exists; falls back to a plain white square
 * (never a broken-image icon) until it's supplied. */
function BrandMark({ size }: { size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="brand-mark" style={{ width: size, height: size }} />;
  return <img src="/logo-white.png" alt="S&A LEGAL" width={size} height={size} onError={() => setFailed(true)} />;
}

interface NavItemDef {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  managingPartnerOnly?: boolean;
  /** Milestone 2 (Version 1.0 completion) — for nav items visible to more than just the
   * Managing Partner but still not everyone (e.g. BILLING.VIEW's MP+Accounts default). */
  roles?: string[];
}

/** Sidebar order (2026-08-13, direct Managing Partner instruction) — fixed to this
 * exact sequence throughout the app. `Contacts` and `Utilities` aren't named in the
 * Managing Partner's ordering list (which only covers the other 18 modules); kept
 * and placed next to their closest logical neighbor (Contacts after Clients,
 * Utilities after Admin Settings) rather than dropped, per "do not remove any of
 * these modules." Visibility gating (`roles`/`managingPartnerOnly`) is unchanged —
 * only the array order changed. */
const NAV_ITEMS: NavItemDef[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/contacts", label: "Contacts", icon: ContactIcon },
  { to: "/cases", label: "Cases", icon: Briefcase },
  { to: "/tasks", label: "My Tasks", icon: ListChecks },
  { to: "/calendar", label: "Hearing Calendar", icon: CalendarDays },
  { to: "/cause-list", label: "Cause List", icon: ScrollText },
  // ACCOUNTS module (2026-08-14) — replaces the old top-level "Invoices" entry
  // (Invoices is now one of Accounts' own sections, §18). Gated by the actor's live
  // ACCOUNTS.VIEW flag (see the `accounts` special-case below), not a static role
  // array — the Managing Partner can grant/revoke Accounts access per individual
  // user, which a fixed `roles` list can't express.
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/users", label: "Firm Users", icon: UserCog, managingPartnerOnly: true },
  { to: "/admin/permissions", label: "Role & Permissions", icon: ShieldCheck, managingPartnerOnly: true },
  { to: "/admin/employee-audit", label: "Employee Task Audit", icon: ClipboardList, managingPartnerOnly: true },
  { to: "/admin/custom-fields", label: "Custom Fields", icon: ListPlus, managingPartnerOnly: true },
  { to: "/firm-profile", label: "Firm Profile", icon: Building2 },
  { to: "/admin/audit-log", label: "Audit Log", icon: History, roles: ["MANAGING_PARTNER", "ACCOUNTS_TEAM"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["MANAGING_PARTNER", "ACCOUNTS_TEAM"] },
  { to: "/account/sessions", label: "Sessions", icon: Monitor },
  { to: "/admin/dropdowns", label: "Admin Settings", icon: Settings, managingPartnerOnly: true },
  { to: "/admin/utilities", label: "Utilities", icon: Wrench, roles: ["MANAGING_PARTNER", "OFFICE_STAFF"] },
  { to: "/admin/recycle-bin", label: "Recycle Bin", icon: Trash2, managingPartnerOnly: true },
  { to: "/account/mfa", label: "Security", icon: KeyRound },
];

export function Layout() {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<SidebarPrefs>(loadPrefs);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [navScrolling, setNavScrolling] = useState(false);
  const dragStateRef = useRef<{ onMove: (e: MouseEvent) => void; onUp: () => void } | null>(null);
  const navScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Sidebar scrollbar redesign — the thumb is otherwise transparent (CSS), and only
   * shown on `:hover` or while this `.scrolling` class is present, so a scroll driven
   * by the mouse wheel (cursor not necessarily still "hovering" in a way CSS can key
   * off) still flashes the thumb briefly, matching VS Code/Notion's behavior. */
  function handleNavScroll() {
    setNavScrolling(true);
    if (navScrollTimeoutRef.current) clearTimeout(navScrollTimeoutRef.current);
    navScrollTimeoutRef.current = setTimeout(() => setNavScrolling(false), 700);
  }
  useEffect(() => {
    return () => {
      if (navScrollTimeoutRef.current) clearTimeout(navScrollTimeoutRef.current);
    };
  }, []);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`);
  }

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Closing the mobile drawer on navigation matches standard off-canvas-menu behavior.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Tablet (viewportWidth between MOBILE_BREAKPOINT and TABLET_BREAKPOINT) gets the
  // same docked sidebar as desktop but without the drag-resize handle (collapse-only),
  // which falls out naturally from the isDesktop checks below — no separate flag needed.
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const isDesktop = viewportWidth >= TABLET_BREAKPOINT;

  const effectiveWidth = prefs.collapsed ? COLLAPSED_WIDTH : prefs.width;

  function startResize(e: React.MouseEvent) {
    if (prefs.collapsed || !isDesktop) return;
    e.preventDefault();
    setIsDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMove(ev: MouseEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setPrefs((p) => ({ ...p, width: next }));
    }
    function onUp() {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (dragStateRef.current) {
        document.removeEventListener("mousemove", dragStateRef.current.onMove);
        document.removeEventListener("mouseup", dragStateRef.current.onUp);
        dragStateRef.current = null;
      }
    }
    dragStateRef.current = { onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function toggleCollapsed() {
    setPrefs((p) => ({ ...p, collapsed: !p.collapsed }));
  }

  const { permissions: accountsPermissions } = useAccountsPermissions();
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.to === "/accounts") return accountsPermissions.view;
    if (item.managingPartnerOnly && auth?.role !== "MANAGING_PARTNER") return false;
    if (item.roles && !item.roles.includes(auth?.role ?? "")) return false;
    return true;
  });
  const showCollapsedStyle = prefs.collapsed && !isMobile;

  const sidebarContent = (
    <>
      <div className="sidebar-brand">
        <BrandMark size={28} />
        {!showCollapsedStyle && <h2>S&amp;A LEGAL</h2>}
        {!isMobile && (
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            title={prefs.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {prefs.collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
        {isMobile && (
          <button type="button" className="sidebar-collapse-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={18} />
          </button>
        )}
      </div>
      <nav className={navScrolling ? "scrolling" : undefined} onScroll={handleNavScroll}>
        {visibleNavItems.map((item) => (
          <NavLink key={item.to} to={item.to} title={showCollapsedStyle ? item.label : undefined}>
            <item.icon size={16} />
            {!showCollapsedStyle && <span className="nav-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      {!showCollapsedStyle && (
        <div className="sidebar-profile">
          <span className="name">{auth?.name}</span>
          <span className="role">{auth?.role?.replaceAll("_", " ")}</span>
        </div>
      )}
      <button className="logout-btn" onClick={() => logout()} title={showCollapsedStyle ? "Log out" : undefined}>
        {showCollapsedStyle ? "⏻" : "Log out"}
      </button>
    </>
  );

  return (
    <div className="app-shell">
      {isMobile ? (
        <>
          {mobileMenuOpen && (
            <>
              <div className="sidebar-backdrop no-print" onClick={() => setMobileMenuOpen(false)} />
              <aside className="sidebar sidebar-mobile-drawer" style={{ width: DEFAULT_WIDTH }}>
                {sidebarContent}
              </aside>
            </>
          )}
        </>
      ) : (
        <aside
          className={`sidebar${prefs.collapsed ? " collapsed" : ""}${isDragging ? " resizing" : ""}`}
          style={{ width: effectiveWidth }}
        >
          {sidebarContent}
          {isDesktop && !prefs.collapsed && (
            <div className="sidebar-resize-handle" onMouseDown={startResize} />
          )}
        </aside>
      )}
      <div className="content-shell">
        <header className="topbar no-print">
          {isMobile && (
            <button type="button" className="topbar-icon-link topbar-menu-btn" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
          )}
          {!isMobile && (
            <form className="topbar-search" onSubmit={onSearchSubmit}>
              <Search size={15} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search…"
                aria-label="Global search"
              />
            </form>
          )}
          <span style={{ flex: 1 }} />
          <NavLink to="/calendar" className="topbar-icon-link" title="Hearing Calendar">
            <CalendarIcon size={18} />
          </NavLink>
          <NotificationBell />
          <span className="topbar-user">
            <strong>{auth?.name}</strong>
          </span>
        </header>
        <main className="main-content">
          {auth?.mfaSetupRequired && location.pathname !== "/account/mfa" && (
            <div className="card no-print" style={{ borderColor: "var(--color-warning)", marginBottom: 16 }}>
              Your role requires two-factor authentication.{" "}
              <NavLink to="/account/mfa">Set it up now</NavLink>.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
