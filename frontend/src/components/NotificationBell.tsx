import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
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

  function refreshCount() {
    api.get<{ count: number }>("/notifications/unread-count").then((res) => setUnreadCount(res.data.count));
  }

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30000);
    return () => clearInterval(interval);
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
