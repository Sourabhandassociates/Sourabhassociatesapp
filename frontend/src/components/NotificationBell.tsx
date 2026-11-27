import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../api/client";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** SRD Section 17 — Notifications & Reminders (in-app channel). A notification center
 * with read/unread status and history, polling every 30s rather than a websocket —
 * this app has no realtime infrastructure elsewhere either, and a 30s lag on a
 * notification bell is a reasonable, dependency-free tradeoff. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const seenNotificationIds = useRef<Set<string> | null>(null);

  // Announcements are delivered through the existing notifications API. The first
  // fetch establishes a baseline; later polls show only newly arrived announcements.
  async function pollAnnouncementNotifications() {
    try {
      const res = await api.get<NotificationItem[]>("/notifications");
      const latest = Array.isArray(res.data) ? res.data : [];

      if (seenNotificationIds.current === null) {
        // On first successful fetch (including after being offline), leave unread
        // announcement notifications unseen so they are displayed as toasts below.
        seenNotificationIds.current = new Set(
          latest
            .filter(
              (item) =>
                !(item.entityType === "Announcement" && Boolean(item.entityId) && !item.isRead)
            )
            .map((item) => item.id)
        );
      }

      const seen = seenNotificationIds.current;
      const newAnnouncements = latest.filter(
        (item) =>
          !seen.has(item.id) &&
          item.entityType === "Announcement" &&
          Boolean(item.entityId)
      );

      latest.forEach((item) => seen.add(item.id));

      newAnnouncements.reverse().forEach((item) => {
        toast.custom(
          (t) => (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                width: "min(420px, calc(100vw - 32px))",
                padding: "14px 16px",
                background: "#ffffff",
                color: "#202938",
                border: "1px solid #dce3f5",
                borderLeft: "4px solid #315efb",
                borderRadius: 10,
                boxShadow: "0 8px 28px rgba(15, 23, 42, 0.18)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  New announcement
                </strong>
                <span style={{ display: "block", fontSize: 13, lineHeight: 1.45 }}>
                  {item.message}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toast.dismiss(t.id);
                    navigate(`/announcements/${item.entityId}`);
                  }}
                  style={{
                    marginTop: 9,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    color: "#315efb",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  View announcement
                </button>
              </div>
              <button
                type="button"
                aria-label="Close announcement notification"
                title="Close"
                onClick={async () => {
                  // Dismissing the announcement toast must persist as read, not just
                  // hide it for this browser session. Mark both notification and
                  // announcement read state so it stays dismissed after refresh/login.
                  try {
                    await api.patch(`/notifications/${item.id}/read`);
                  } catch (err) {
                    console.error("Failed to mark announcement notification as read:", err);
                  }
                  try {
                    await api.patch(`/announcements/${item.entityId}/read`);
                  } catch (err) {
                    console.error("Failed to mark announcement as read:", err);
                  }
                  seenNotificationIds.current?.add(item.id);
                  refreshCount();
                  toast.dismiss(t.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  flex: "0 0 26px",
                  padding: 0,
                  border: 0,
                  borderRadius: 6,
                  background: "#f1f5f9",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>
          ),
          { duration: Infinity, position: "top-right" }
        );
      });
    } catch {
      // Keep the existing notification bell usable if background polling fails.
    }
  }

  function refreshCount() {
    api.get<{ count: number }>("/notifications/unread-count").then((res) => setUnreadCount(res.data.count));
  }

  useEffect(() => {
    refreshCount();
    pollAnnouncementNotifications();

    const interval = setInterval(() => {
      refreshCount();
      pollAnnouncementNotifications();
    }, 10000);

    // When the staff member reconnects, check immediately instead of waiting
    // for the next polling interval.
    const onOnline = () => {
      refreshCount();
      pollAnnouncementNotifications();
    };
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      api.get<NotificationItem[]>("/notifications").then((res) => setItems(res.data));
    }
  }

  async function onItemClick(item: NotificationItem) {
    if (!item.isRead) {
      await api.patch(`/notifications/${item.id}/read`);
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      refreshCount();
    }
    // Office Announcements communication-system pass (2026-08-12) — an announcement
    // notification opens the full announcement (which also marks it read there, so
    // this is never the only read-marking path). Every other notification type keeps
    // its existing mark-read-in-place behavior, unchanged.
    if (item.entityType === "Announcement" && item.entityId) {
      setOpen(false);
      navigate(`/announcements/${item.entityId}`);
    }
  }

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button type="button" className="topbar-icon-link" title="Notifications" onClick={toggleOpen}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-button" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-dropdown-body">
            {items.length === 0 && <p className="muted" style={{ padding: "12px 16px" }}>No notifications yet.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item${item.isRead ? "" : " unread"}`}
                onClick={() => onItemClick(item)}
              >
                <span>{item.message}</span>
                <span className="muted">{new Date(item.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
