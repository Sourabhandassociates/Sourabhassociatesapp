import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

interface Case {
  id: string;
  status: string;
}
/** New Case form simplification (2026-08-11) — case title is now optional. */
interface TaskItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  case: { id: string; matterNumber: string; title: string | null };
}
interface FirmTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  assignedTo: { id: string; name: string };
  case: { id: string; matterNumber: string; title: string | null };
}
interface Hearing {
  id: string;
  hearingDate: string;
  courtHall: string | null;
  case: { id: string; matterNumber: string; title: string | null };
}
type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: PaymentStatus;
  total: number;
  payments: { amount: number }[];
  case: { matterNumber: string } | null;
  client: { name: string };
}
/** Announcements simplification pass (2026-08-13) — priority/audience/start-expiry
 * date fields are no longer collected or selected anywhere in this component, but the
 * API response still carries them (historical announcements retain their real
 * values; new ones default to NORMAL/EVERYONE/null server-side) — kept in the type so
 * it accurately reflects the API shape, even though nothing here renders them. */
interface Announcement {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  isEffectivelyActive: boolean;
  isReadByMe: boolean | null;
  createdAt: string;
  createdBy: { name: string };
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export default function Dashboard() {
  const { auth } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [firmTasks, setFirmTasks] = useState<FirmTask[] | null>(null);
  const [todaysHearings, setTodaysHearings] = useState<Hearing[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);

  useEffect(() => {
    api.get("/cases").then((res) => setCases(res.data));
    api.get("/clients").then((res) => setClientCount(res.data.length));
    api.get("/tasks/my").then((res) => setTasks(res.data));
    if (auth?.role === "MANAGING_PARTNER") {
      api.get("/tasks/all").then((res) => setFirmTasks(res.data));
    }
    if (auth?.role === "ASSOCIATE" || auth?.role === "JUNIOR_ASSOCIATE" || auth?.role === "OFFICE_STAFF") {
      const { startDate, endDate } = todayRange();
      api.get("/hearings", { params: { startDate, endDate } }).then((res) => setTodaysHearings(res.data));
    }
    if (auth?.role === "ACCOUNTS_TEAM") {
      api.get("/invoices").then((res) => setInvoices(res.data));
    }
  }, [auth?.role]);

  const activeCases = cases.filter((c) => c.status === "ACTIVE").length;
  const pendingTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {auth?.name}</h1>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        {auth?.role.replaceAll("_", " ")}
      </p>

      <div className="dashboard-grid">
        <Link to="/cases" className="stat-tile" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="value">{cases.length}</div>
          <div className="label">Total Cases</div>
        </Link>
        <div className="stat-tile">
          <div className="value">{activeCases}</div>
          <div className="label">Active Cases</div>
        </div>
        <Link to="/clients" className="stat-tile" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="value">{clientCount}</div>
          <div className="label">Client Registrations</div>
        </Link>
        <Link to="/tasks" className="stat-tile" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="value">{pendingTasks}</div>
          <div className="label">My Pending Tasks</div>
        </Link>
      </div>

      {firmTasks && <FirmTaskBreakdown tasks={firmTasks} />}
      {todaysHearings && <TodaysHearings hearings={todaysHearings} />}
      {auth?.role === "OFFICE_STAFF" && <MyTaskQueue tasks={tasks} />}
      {invoices && <OutstandingInvoices invoices={invoices} />}

      <AnnouncementsWidget />
    </div>
  );
}

/**
 * SRD Section 18.1 — Managing Partner Dashboard: firm-wide task breakdown.
 * Step 1 revision (item 2) — the table lists Pending tasks only (Overdue/Completed
 * are still counted above, just not listed here), first 5 with a "View More" toggle
 * expanding to the full pending list, so the dashboard stays scannable as task volume
 * grows firm-wide.
 */
function FirmTaskBreakdown({ tasks }: { tasks: FirmTask[] }) {
  const [expanded, setExpanded] = useState(false);

  const pending = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const overdue = tasks.filter((t) => t.isOverdue);
  const completed = tasks.filter((t) => t.status === "COMPLETED");
  const visiblePending = expanded ? pending : pending.slice(0, 5);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Firm-wide Task Breakdown</h3>
      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <div className="value">{pending.length}</div>
          <div className="label">Pending Tasks</div>
        </div>
        <div className="stat-tile">
          <div className="value">{overdue.length}</div>
          <div className="label">Overdue Tasks</div>
        </div>
        <div className="stat-tile">
          <div className="value">{completed.length}</div>
          <div className="label">Completed Tasks</div>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Matter</th>
              <th>Assignee</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visiblePending.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>
                  <Link to={`/cases/${t.case.id}`}>{t.case.matterNumber}</Link>
                </td>
                <td>{t.assignedTo.name}</td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td>
                  <span className="badge">{t.isOverdue ? "OVERDUE" : t.status.replaceAll("_", " ")}</span>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No pending tasks firm-wide.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pending.length > 5 && (
        <button style={{ marginTop: 12 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "View Less" : `View More (${pending.length - 5} more)`}
        </button>
      )}
    </div>
  );
}

/** Milestone 4 — Advocate/Office Staff Dashboard section (SRD Section 6.6/18):
 * today's hearings across every case the viewer can see (own cases for an Advocate,
 * firm-wide metadata for Office Staff via CASES.VIEW_ALL). */
function TodaysHearings({ hearings }: { hearings: Hearing[] }) {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Today's Hearings</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Matter</th>
              <th>Court Hall</th>
            </tr>
          </thead>
          <tbody>
            {hearings.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.hearingDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td>
                  <Link to={`/cases/${h.case.id}`}>
                    {h.case.title ? `${h.case.matterNumber} — ${h.case.title}` : h.case.matterNumber}
                  </Link>
                </td>
                <td>{h.courtHall ?? "—"}</td>
              </tr>
            ))}
            {hearings.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No hearings scheduled for today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Milestone 4 — Office Staff Dashboard section: their own admin task queue, in full
 * (not just the count tile above), matching the SRD's "admin task queue" wording. */
function MyTaskQueue({ tasks }: { tasks: TaskItem[] }) {
  const open = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>My Admin Task Queue</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Matter</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {open.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                </td>
                <td>
                  <Link to={`/cases/${t.case.id}`}>{t.case.matterNumber}</Link>
                </td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td>
                  <span className="badge">{t.status.replaceAll("_", " ")}</span>
                </td>
              </tr>
            ))}
            {open.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Nothing pending — queue is clear.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Milestone 4 — Accounts Team Dashboard section: outstanding (unpaid/partially-paid)
 * invoices summary. "Outstanding" = SENT, PARTIALLY_PAID, or OVERDUE (not DRAFT/
 * APPROVED, which aren't billed yet; not PAID, which owes nothing). */
/** Billing bug-fix pass (2026-08-06) — "outstanding" is a already-sent (or later),
 * not-yet-fully-paid invoice (DRAFT/APPROVED are excluded — they haven't been billed
 * to the client yet, so they're not "outstanding" from a collections standpoint).
 * Uses the backend-derived `paymentStatus` (Pending/Partially Paid/Overdue) rather
 * than re-deriving overdue-ness client-side, so this stays in sync with the Invoice
 * List page's filters/badges by construction. */
function OutstandingInvoices({ invoices }: { invoices: InvoiceRow[] }) {
  const outstanding = invoices.filter(
    (inv) => inv.status !== "DRAFT" && inv.status !== "APPROVED" && inv.paymentStatus !== "PAID"
  );
  const overdueCount = outstanding.filter((inv) => inv.paymentStatus === "OVERDUE").length;
  const totalOutstanding = outstanding.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    return sum + (inv.total - paid);
  }, 0);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Outstanding Invoices</h3>
      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <div className="value">{outstanding.length}</div>
          <div className="label">Outstanding Invoices</div>
        </div>
        <div className="stat-tile">
          <div className="value">{overdueCount}</div>
          <div className="label">Overdue Invoices</div>
        </div>
        <div className="stat-tile">
          <div className="value">
            {totalOutstanding.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
          </div>
          <div className="label">Amount Outstanding</div>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Matter</th>
              <th>Client</th>
              <th>Payment Status</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {outstanding.slice(0, 10).map((inv) => {
              const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <tr key={inv.id}>
                  <td>
                    <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                  </td>
                  <td>{inv.case?.matterNumber ?? <span className="muted">General</span>}</td>
                  <td>{inv.client.name}</td>
                  <td>
                    <span className={`badge payment-status-${inv.paymentStatus}`}>
                      {PAYMENT_STATUS_LABEL[inv.paymentStatus]}
                    </span>
                  </td>
                  <td>{(inv.total - paid).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
            {outstanding.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nothing outstanding — all invoices are settled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {outstanding.length > 10 && (
        <Link to="/invoices" style={{ display: "inline-block", marginTop: 12 }}>
          View all {outstanding.length} outstanding invoices →
        </Link>
      )}
    </div>
  );
}

/** Milestone 4 — Office Announcements Composer + dashboard widget (SRD Section 8/24).
 * Simplified 2026-08-13 (direct Managing Partner instruction): the composer is now
 * Title/Message only — no priority, audience, start date, or expiry date selection.
 * Every announcement is unconditionally visible to every firm user (enforced
 * server-side in announcements.service.ts, not merely "the form doesn't ask") and
 * automatically stops appearing on this Dashboard 24 hours after `createdAt`
 * (Section 24/29's existing hard-ceiling `isWithinDateWindow`, untouched by this
 * pass — it never depended on an explicit Expiry Date to function). Visible to every
 * role (ANNOUNCEMENTS.VIEW is granted firm-wide, and never to a Client actor — there
 * is no client-portal route that reads this data at all); the compose form only
 * renders for Managing Partner/Office Staff (ANNOUNCEMENTS.CREATE's role defaults) —
 * the service layer enforces the actual draft-vs-live rule regardless. */
function AnnouncementsWidget() {
  const { auth } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompose = auth?.role === "MANAGING_PARTNER" || auth?.role === "OFFICE_STAFF";
  const isManagingPartner = auth?.role === "MANAGING_PARTNER";

  function load() {
    api.get("/announcements").then((res) => setAnnouncements(res.data));
  }
  useEffect(() => load(), []);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await api.post("/announcements", { title, body });
      setTitle("");
      setBody("");
      load();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message ?? "Failed to post announcement");
    } finally {
      setPosting(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    await api.patch(`/announcements/${id}/active`, { isActive });
    load();
  }

  async function markRead(id: string) {
    await api.patch(`/announcements/${id}/read`);
    load();
  }

  const drafts = isManagingPartner ? announcements.filter((a) => !a.isActive) : [];
  // "Continue to appear on the Dashboard until it expires or is archived" — the
  // backend already excludes drafts and out-of-window announcements from a non-MP
  // actor's list; for the Managing Partner (who sees everything, for moderation),
  // `isEffectivelyActive` keeps the same visible feed rather than surfacing every
  // expired/not-yet-started announcement inline here too.
  const active = announcements.filter((a) => a.isEffectivelyActive);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Office Announcements</h3>

      {canCompose && (
        <div style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <div>
              <label htmlFor="announcementTitle">Title</label>
              <input id="announcementTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="announcementBody">Message</label>
              <textarea id="announcementBody" value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button style={{ marginTop: 12 }} onClick={submit} disabled={posting || !title.trim() || !body.trim()}>
            {isManagingPartner ? "Post Announcement" : "Submit for Approval"}
          </button>
        </div>
      )}

      {isManagingPartner && drafts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 8 }}>Pending Approval</h4>
          {drafts.map((a) => (
            <div key={a.id} className="card" style={{ marginBottom: 8 }}>
              <strong>{a.title}</strong>
              <p style={{ margin: "4px 0" }}>{a.body}</p>
              <p className="muted" style={{ margin: "0 0 8px" }}>
                By {a.createdBy.name} on {new Date(a.createdAt).toLocaleDateString()}
              </p>
              <button onClick={() => setActive(a.id, true)}>Publish</button>
            </div>
          ))}
        </div>
      )}

      {active.map((a) => (
        <div key={a.id} className="card announcement-card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link to={`/announcements/${a.id}`} style={{ fontWeight: 600 }}>
              {a.title}
            </Link>
            {a.isReadByMe === false && <span className="badge">Unread</span>}
          </div>
          <p style={{ margin: "4px 0" }}>{a.body}</p>
          <p className="muted" style={{ margin: 0 }}>
            By {a.createdBy.name} on {new Date(a.createdAt).toLocaleDateString()}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {a.isReadByMe === false && (
              <button className="secondary" onClick={() => markRead(a.id)}>
                Mark as Read
              </button>
            )}
            {isManagingPartner && (
              <button className="secondary" onClick={() => setActive(a.id, false)}>
                Archive
              </button>
            )}
          </div>
        </div>
      ))}
      {active.length === 0 && <p className="muted">No announcements right now.</p>}
    </div>
  );
}
