import { AppLoader } from "../../components/AppLoader";
import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useState, useRef } from "react";
import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useAuth } from "../../context/useAuth";
import { SearchableSelect } from "../../components/SearchableSelect";
import { Billing } from "./CaseBilling";
import { useAccountsPermissions, AccountsPermissions } from "../../hooks/useAccountsPermissions";
import { useCaseSectionPermissions, CaseSectionPermissions } from "../../hooks/useCaseSectionPermissions";
import { CaseAccountsPanel } from "../Accounts/CaseAccountsPanel";
import { CaseContentSection } from "./CaseContentSection";


interface CaseDetailData {
  id: string;
  matterNumber: string;
  bundleNumber: string | null;
  courtCaseNumber: string | null;
  /** New Case form simplification (2026-08-11) — title/practiceArea are now optional. */
  title: string | null;
  caseTitle: string | null;
  practiceArea: string | null;
  status: string;
  nextHearingDate?: string | null;
  courtName: string | null;
  courtNumber: string | null;
  jurisdiction: string | null;
  stage: string | null;
  description: string | null;
  caseType: string | null;
  oppositeCounsel: string | null;
  oppositeParty: string | null;
  department: string | null;
  partner: { id: string; name: string };
  advocates: { user: { id: string; name: string; role: string } }[];
  clients: { client: { id: string; clientId: string; name: string }; partyRole: string }[];
  documents: {
    id: string;
    title: string;
    category: string;
    confidentiality: string;
    versions: {
      id: string;
      versionNumber: number;
      fileName: string;
    }[];
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assignedToId: string;
    assignedTo: { id: string; name: string; role: string };
  }[];
  notes: {
    id: string;
    content: string;
    visibility: string;
    createdAt: string;
    author: { id: string; name: string };
  }[];
  hearings: {
    id: string;
    hearingDate: string;
    courtName: string | null;
    courtHall: string | null;
    judgeName: string | null;
    purpose: string | null;
    outcomeNotes: string | null;
    status: string;
  }[];
  /** Milestone 1 (Version 1.0 completion, SRD Section 10.3 — Tagging System). */
  tags: { tag: string }[];
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

/** SRD Section 3.2 — Associates may schedule/record hearing outcomes; Junior Associates may not. */
const HEARING_MANAGER_ROLES = ["MANAGING_PARTNER", "ASSOCIATE"];
/** Matches the backend's PATCH /cases/:id role restriction (cases.routes.ts). */
const CASE_EDITOR_ROLES = ["MANAGING_PARTNER", "ASSOCIATE"];
/** SRD Section 3.2/3.3 — Advocates (any level) keep the case diary; Office Staff/Accounts do not. */
const NOTE_AUTHOR_ROLES = ["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE"];
type Tab =
  | "overview"
  | "facts"
  | "arguments"
  | "documents"
  | "tasks"
  | "notes"
  | "hearings"
  | "timeline"
  | "billing"
  | "accounts";

/** Case Section Access (2026-08-17; extended 2026-08-18 with Facts/Arguments) —
 * which sectionPermissions flag gates each tab, used both to decide which tab
 * buttons render and to pick a fallback initial tab if "overview" itself is
 * ever denied. Every tab needs its own CASE_*.VIEW flag; "accounts"
 * additionally needs the pre-existing accountsPermissions.view (ACCOUNTS.VIEW)
 * — spec §8's "CASE_ACCOUNTS.VIEW AND the existing relevant Accounts
 * authorization," never either alone. */
const TAB_ORDER: { tab: Tab; flag: keyof CaseSectionPermissions }[] = [
  { tab: "overview", flag: "overview" },
  { tab: "facts", flag: "facts" },
  { tab: "arguments", flag: "arguments" },
  { tab: "documents", flag: "documents" },
  { tab: "tasks", flag: "tasks" },
  { tab: "hearings", flag: "hearings" },
  { tab: "timeline", flag: "timeline" },
  { tab: "notes", flag: "notes" },
  { tab: "billing", flag: "billingExpenses" },
  { tab: "accounts", flag: "accounts" },
];

function sectionFlagGranted(
  flag: keyof CaseSectionPermissions,
  sectionPermissions: CaseSectionPermissions,
  accountsPermissions: AccountsPermissions
): boolean {
  if (flag === "accounts") return sectionPermissions.accounts && accountsPermissions.view;
  return sectionPermissions[flag];
}

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { permissions: accountsPermissions } = useAccountsPermissions();
  const { permissions: sectionPermissions } = useCaseSectionPermissions();
  const [data, setData] = useState<CaseDetailData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [staff, setStaff] = useState<StaffMember[]>([]);

  /** If the current tab becomes hidden (denied, or the user never had it), fall
   * back to the first tab the actor actually has access to, rather than showing
   * an empty panel with no active tab button highlighted. */
  useEffect(() => {
    const visible = TAB_ORDER.filter((t) => sectionFlagGranted(t.flag, sectionPermissions, accountsPermissions));
    if (visible.length === 0) return;
    if (!visible.some((t) => t.tab === tab)) {
      setTab(visible[0].tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionPermissions, accountsPermissions]);

  const reload = useCallback(async () => {
    try {
      const res = await api.get(`/cases/${id}`);
      setData(res.data);
    } catch (error) {
      console.error("Failed to reload case:", error);
      throw error;
    }
  }, [id]);

  useEffect(() => {
    reload();
    api.get("/auth/staff-directory").then((res) => setStaff(res.data));
  }, [reload]);

  if (!data) return <AppLoader />;

  /** Step 2 — Soft Delete & Recycle Bin (SRD Section 27): never a real delete — the case
   * moves to the Recycle Bin, restorable/permanently-deletable by the Managing Partner only. */
  async function handleDeleteCase() {
    if (!window.confirm(`Move case ${data!.matterNumber} to the Recycle Bin?`)) return;
    await api.delete(`/cases/${data!.id}`);
    navigate("/cases");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{data.title ? `${data.matterNumber} — ${data.title}` : data.matterNumber}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {data.courtCaseNumber ? `Court Case No. ${data.courtCaseNumber} · ` : ""}
            {data.practiceArea || "—"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className={`badge status-${data.status}`}>{data.status}</span>
          {auth && CASE_EDITOR_ROLES.includes(auth.role) && (
            <button className="secondary" onClick={handleDeleteCase}>
              Delete Case
            </button>
          )}
        </div>
      </div>

      {/* Case Section Access (2026-08-17) — every tab button is gated by its own
          CASE_*.VIEW flag (Accounts additionally by ACCOUNTS.VIEW, per §8). Hiding
          the tab here is a UX courtesy, never the real gate — every one of these
          sections is independently enforced server-side too (the case-scoped
          sub-resource routes, and the GET /cases/:id response's own section
          redaction), so a denied user can't reach the data by guessing a URL or
          calling the API directly either. */}
      <div className="tab-row" style={{ maxWidth: 640, flexWrap: "wrap" }}>
        {sectionPermissions.overview && (
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
            Overview
          </button>
        )}
        {sectionPermissions.facts && (
          <button className={tab === "facts" ? "active" : ""} onClick={() => setTab("facts")}>
            Facts
          </button>
        )}
        {sectionPermissions.arguments && (
          <button className={tab === "arguments" ? "active" : ""} onClick={() => setTab("arguments")}>
            Arguments
          </button>
        )}
        {sectionPermissions.documents && (
          <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>
            Documents
          </button>
        )}
        {/* {sectionPermissions.tasks && (
          <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
            Tasks
          </button>
        )} */}
        <button
          className={tab === "tasks" ? "active" : ""}
          onClick={() => setTab("tasks")}
        >
          Tasks
        </button>
        {sectionPermissions.hearings && (
          <button className={tab === "hearings" ? "active" : ""} onClick={() => setTab("hearings")}>
            Hearings
          </button>
        )}
        {sectionPermissions.timeline && (
          <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>
            Timeline
          </button>
        )}
        {sectionPermissions.notes && (
          <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>
            Notes
          </button>
        )}
        {sectionPermissions.billingExpenses && (
          <button className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")}>
            Billing / Expenses
          </button>
        )}
        {/* ACCOUNTS module (2026-08-14, §21); Case Section Access (2026-08-17) layers
            CASE_ACCOUNTS.VIEW on top — both are required, matching §8. A Client actor
            structurally cannot reach this page at all (StaffOnlyRoute), so "never
            visible to Client" needs no extra code here. The backend enforces the same
            restriction independently (GET /cases/:id/accounts, CASE_ACCOUNTS.VIEW +
            ACCOUNTS.VIEW). */}
        {sectionPermissions.accounts && accountsPermissions.view && (
          <button className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}>
            Accounts
          </button>
        )}
      </div>

      {tab === "overview" && sectionPermissions.overview && <Overview data={data} staff={staff} onChanged={reload} />}
      {tab === "facts" && sectionPermissions.facts && (
        <CaseContentSection
          caseId={data.id}
          section="facts"
          title="Facts"
          emptyMessage="No facts have been added yet."
          addLabel="Add Facts"
        />
      )}
      {tab === "arguments" && sectionPermissions.arguments && (
        <CaseContentSection
          caseId={data.id}
          section="arguments"
          title="Arguments"
          emptyMessage="No arguments have been added yet."
          addLabel="Add Arguments"
        />
      )}
      {tab === "documents" && sectionPermissions.documents && (
        <Documents caseId={data.id} documents={data.documents} onChanged={reload} />
      )}
      {/* {tab === "tasks" && sectionPermissions.tasks && (
        <Tasks caseId={data.id} tasks={data.tasks} staff={staff} onChanged={reload} />
      )} */}
      {tab === "tasks" && (
        <Tasks
          caseId={data.id}
          tasks={data.tasks}
          staff={staff}
          onChanged={reload}
        />
      )}
      {tab === "hearings" && sectionPermissions.hearings && (
        <Hearings caseId={data.id} bundleNumber={data.bundleNumber} hearings={data.hearings} onChanged={reload} />
      )}
      {tab === "timeline" && sectionPermissions.timeline && <HearingTimeline hearings={data.hearings} bundleNumber={data.bundleNumber} />}
      {tab === "notes" && sectionPermissions.notes && <Notes caseId={data.id} notes={data.notes} onChanged={reload} />}
      {tab === "billing" && sectionPermissions.billingExpenses && <Billing caseId={data.id} clients={data.clients} />}
      {tab === "accounts" && sectionPermissions.accounts && accountsPermissions.view && (
        <CaseAccountsPanel caseId={data.id} permissions={accountsPermissions} />
      )}
    </div>
  );
}

/** A label/value row for the Overview's definition-list-style display — Step 1 second
 * revision (item 2): a consistent, scannable layout as this screen grows over time. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="muted" style={{ fontSize: "0.85em" }}>
        {label}
      </div>
      <div>{value || "—"}</div>
    </>
  );
}

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  rowGap: 10,
  columnGap: 16,
  alignItems: "start",
};

/**
 * Step 1 revision (Managing Partner review, item 5), restructured in the Step 1 second
 * revision (item 2) into a clean, professional single-screen layout — Case
 * Identification, Litigation Team & Parties, and Description, each its own card so
 * future fields (per the Managing Partner's request) have an obvious place to land
 * without needing another tab. Hearing info originally lived in its own embedded
 * Hearing Timeline card here; Case Section Access (2026-08-17) promoted that card
 * to its own top-level "Timeline" tab (see HearingTimeline below), independently
 * permission-gated from Overview, so it no longer renders inside this component.
 */

function Overview({
  data,
  staff,
  onChanged,
}: {
  data: CaseDetailData;
  staff: StaffMember[];
  onChanged: () => void;
}) {
  const { auth } = useAuth();
  const canEdit = !!auth && CASE_EDITOR_ROLES.includes(auth.role);

  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState(data.stage ?? "");
  const [description, setDescription] = useState(data.description ?? "");
  const [practiceArea, setPracticeArea] = useState(data.practiceArea ?? "");
  const [caseType, setCaseType] = useState(data.caseType ?? "");
  const [courtNumber, setCourtNumber] = useState(data.courtNumber ?? "");
  const [courtName, setCourtName] = useState(data.courtName ?? "");
  const [oppositeCounsel, setOppositeCounsel] = useState(data.oppositeCounsel ?? "");
  const [oppositeParty, setOppositeParty] = useState(data.oppositeParty ?? "");
  const [department, setDepartment] = useState(data.department ?? "");
  const [courtCaseNumber, setcourtCaseNumber] = useState(data.courtCaseNumber ?? "");
  const [bundleNumber, setBundleNumber] = useState(data.bundleNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [title, settitle] = useState(data.title ?? "");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await api.patch(`/cases/${data.id}`, {
        stage: stage || undefined,
        description: description || undefined,
        practiceArea,
        caseType: caseType || undefined,
        courtNumber: courtNumber || undefined,
        courtName: courtName || undefined,
        oppositeCounsel: oppositeCounsel || undefined,
        oppositeParty: oppositeParty || undefined,
        department: department || undefined,
        title: title || undefined,
        courtCaseNumber: courtCaseNumber || undefined,
        bundleNumber: bundleNumber.trim() || null,
      });

      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update case details"));
    }
  }

  return (
    <div>
      <div className="card">
        <h3>Case Identification</h3>
        <div style={overviewGridStyle}>
          {/* <Field label="Case Number" value={data.matterNumber} /> */}
          <Field label="Bundle Number" value={data.bundleNumber} />
          <Field label="Court Case Number" value={data.courtCaseNumber} />
          <Field label="Cause Title" value={data.title} />
          <Field label="Court Name" value={data.courtName} />
          <Field label="Court No." value={data.courtNumber} />
          <Field label="Case Stage" value={data.stage} />
          <Field label="Practice Area" value={data.practiceArea} />
          <Field label="Case Type" value={data.caseType} />
          
          <Field label="Jurisdiction" value={data.jurisdiction} />
          <Field
            label="Next Hearing"
            value={data.nextHearingDate
              ? new Date(data.nextHearingDate).toLocaleDateString("en-IN")
              : null}
          />
        </div>
      </div>

      <div className="card">
        <h3>Litigation Team &amp; Parties</h3>
        <div style={overviewGridStyle}>
          <Field label="Managing Partner" value={data.partner.name} />
          <Field label="Advocates" value={data.advocates.map((a) => a.user.name).join(", ")} />
          <Field
            label="Client(s)"
            value={data.clients.map((c) => `${c.client.name} (${c.partyRole})`).join(", ")}
          />
          <Field label="Opposite Counsel" value={data.oppositeCounsel} />
          <Field label="Opposite Party" value={data.oppositeParty} />
          <Field label="Department" value={data.department} />
        </div>

        {auth?.role === "MANAGING_PARTNER" && (
          <ReassignPartnerControl
            caseId={data.id}
            currentPartnerId={data.partner.id}
            staff={staff}
            onChanged={onChanged}
          />
        )}
      </div>

      <TagsCard caseId={data.id} tags={data.tags} canEdit={canEdit} onChanged={onChanged} />

      <CustomFieldsCard caseId={data.id} canEdit={canEdit} />

      <div className="card">
        <h3>Description</h3>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {data.description || "—"}
        </p>

        {canEdit && !editing && (
          <button onClick={() => setEditing(true)}>
            Edit Case Details
          </button>
        )}
      </div>

      {canEdit && editing && (
        <div className="card">
          <h3>Edit Case Details</h3>

          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div>
                <label htmlFor="caseStage">Case Stage</label>
                <SearchableSelect
                  id="caseStage"
                  category="CASE_STAGE"
                  value={stage}
                  onChange={setStage}
                />
              </div>

              <div>
                <label htmlFor="courtNameEdit">Court Name</label>
                <SearchableSelect
                  id="courtNameEdit"
                  category="COURT"
                  value={courtName}
                  onChange={setCourtName}
                />
              </div>

              <div>
                <label htmlFor="courtNumberEdit">Court Number</label>
                <input
                  id="courtNumberEdit"
                  type="text"
                  value={courtNumber}
                  onChange={(e) => setCourtNumber(e.target.value)}
                  placeholder="Enter Court Number"
                />
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="bundleNumberEdit">Bundle Number</label>
                <input
                  id="bundleNumberEdit"
                  type="text"
                  value={bundleNumber}
                  onChange={(e) => setBundleNumber(e.target.value)}
                  placeholder="Enter Bundle Number"
                />
              </div>
              <div>
                <label htmlFor="CaseTitle">Case Title</label>
                <input
                  id="CaseTitle"
                  type="text"
                  value={title}
                  onChange={(e) => settitle(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="practiceAreaEdit">Practice Area</label>
                <SearchableSelect
                  id="practiceAreaEdit"
                  category="PRACTICE_AREA"
                  value={practiceArea}
                  onChange={setPracticeArea}
                  required
                />
              </div>

              <div>
                <label htmlFor="caseTypeEdit">Case Type</label>
                <SearchableSelect
                  id="caseTypeEdit"
                  category="CASE_TYPE"
                  value={caseType}
                  onChange={setCaseType}
                />
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="oppositeCounselEdit">Opposite Counsel</label>
                <SearchableSelect
                  id="oppositeCounselEdit"
                  category="OPPOSITE_COUNSEL"
                  value={oppositeCounsel}
                  onChange={setOppositeCounsel}
                />
              </div>

              <div>
                <label htmlFor="oppositePartyEdit">Opposite Party</label>
                <SearchableSelect
                  id="oppositePartyEdit"
                  category="OPPOSITE_PARTY"
                  value={oppositeParty}
                  onChange={setOppositeParty}
                />
              </div>
            </div>

            <label htmlFor="departmentEdit">Department</label>
            <SearchableSelect
              id="departmentEdit"
              category="DEPARTMENT"
              value={department}
              onChange={setDepartment}
            />

            <label htmlFor="descriptionEdit">Description</label>
            <textarea
              id="descriptionEdit"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {error && <p className="error-text">{error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="primary" type="submit">
                Save
              </button>

              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}


/** Milestone 1 (Version 1.0 completion, SRD Section 10.1 — "Case reassignment
 * workflow (Partner-only) with audit trail"). Managing-Partner-only, matching the
 * backend's CASES.REASSIGN default. */
function ReassignPartnerControl({
  caseId,
  currentPartnerId,
  staff,
  onChanged,
}: {
  caseId: string;
  currentPartnerId: string;
  staff: StaffMember[];
  onChanged: () => void;
}) {
  const [reassigning, setReassigning] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const partners = staff.filter((s) => s.role === "MANAGING_PARTNER" && s.id !== currentPartnerId);

  async function handleReassign() {
    setError(null);
    try {
      await api.patch(`/cases/${caseId}/reassign`, { partnerId });
      setReassigning(false);
      setPartnerId("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to reassign case"));
    }
  }

  if (!reassigning) {
    return (
      <button style={{ marginTop: 12 }} onClick={() => setReassigning(true)}>
        Reassign Partner
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <label htmlFor="reassignPartner">New Managing Partner</label>
        <select id="reassignPartner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Select…</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <button className="primary" onClick={handleReassign} disabled={!partnerId}>
        Confirm
      </button>
      <button
        className="secondary"
        onClick={() => {
          setReassigning(false);
          setError(null);
        }}
      >
        Cancel
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** Milestone 1 (Version 1.0 completion, SRD Section 10.3 — Tagging System). Tag values
 * are curated via the TAG Picklist category (Section 24's standing convention). */
function TagsCard({
  caseId,
  tags,
  canEdit,
  onChanged,
}: {
  caseId: string;
  tags: { tag: string }[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newTag) return;
    try {
      await api.post(`/cases/${caseId}/tags`, { tag: newTag });
      setNewTag("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add tag"));
    }
  }

  async function handleRemove(tag: string) {
    await api.delete(`/cases/${caseId}/tags/${encodeURIComponent(tag)}`);
    onChanged();
  }

  return (
    <div className="card">
      <h3>Tags</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: canEdit ? 12 : 0 }}>
        {tags.length === 0 && <p className="muted">No tags yet.</p>}
        {tags.map((t) => (
          <span key={t.tag} className="badge">
            {t.tag}
            {canEdit && (
              <button
                type="button"
                onClick={() => handleRemove(t.tag)}
                style={{ marginLeft: 6, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                aria-label={`Remove tag ${t.tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end", maxWidth: 320 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="newTag">Add tag</label>
            <SearchableSelect id="newTag" category="TAG" value={newTag} onChange={setNewTag} />
          </div>
          <button className="primary" type="submit" disabled={!newTag}>
            Add
          </button>
        </form>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

interface CustomFieldValueRow {
  definitionId: string;
  label: string;
  fieldType: string;
  value: string | null;
}

/** Milestone 4 (Version 1.0 completion, SRD Section 24 — Custom Fields). Renders
 * whatever fields the Managing Partner has defined for Case (Admin > Custom Fields);
 * an empty list means none have been defined yet, so the card stays hidden entirely
 * rather than showing an empty box. */
function CustomFieldsCard({ caseId, canEdit }: { caseId: string; canEdit: boolean }) {
  const [values, setValues] = useState<CustomFieldValueRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get(`/custom-fields/cases/${caseId}`).then((res) => setValues(res.data));
  }, [caseId]);
  useEffect(() => load(), [load]);

  function startEdit() {
    setDraft(Object.fromEntries((values ?? []).map((v) => [v.definitionId, v.value ?? ""])));
    setEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.put(`/custom-fields/cases/${caseId}`, {
        values: Object.entries(draft).map(([definitionId, value]) => ({ definitionId, value })),
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save custom fields"));
    }
  }

  if (!values || values.length === 0) return null;

  return (
    <div className="card">
      <h3>Additional Details</h3>
      {!editing && (
        <div style={overviewGridStyle}>
          {values.map((v) => (
            <Field key={v.definitionId} label={v.label} value={v.value} />
          ))}
        </div>
      )}
      {editing && (
        <form onSubmit={handleSave}>
          {values.map((v) => (
            <div key={v.definitionId} style={{ marginBottom: 8 }}>
              <label htmlFor={`customField-${v.definitionId}`}>{v.label}</label>
              {v.fieldType === "BOOLEAN" ? (
                <select
                  id={`customField-${v.definitionId}`}
                  value={draft[v.definitionId] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [v.definitionId]: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  id={`customField-${v.definitionId}`}
                  type={v.fieldType === "DATE" ? "date" : v.fieldType === "NUMBER" ? "number" : "text"}
                  value={draft[v.definitionId] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [v.definitionId]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {canEdit && !editing && <button onClick={startEdit}>Edit Additional Details</button>}
    </div>
  );
}

/**
 * Step 1 second revision (Managing Partner review, item 3) — a compact litigation
 * snapshot on the Overview screen: Previous Hearing and the current Next Hearing up
 * front, with the full Hearing History available on demand rather than cluttering the
 * default view. Reuses the same `hearings` data the Hearings tab already has — no
 * extra fetch.
 */
function HearingTimeline({
  hearings,
  bundleNumber,
}: {
  hearings: CaseDetailData["hearings"];
  bundleNumber: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const sortedDesc = hearings
    .slice()
    .sort((a, b) => new Date(b.hearingDate).getTime() - new Date(a.hearingDate).getTime());
  const previousHearing = sortedDesc.find((h) => h.status === "COMPLETED");
  const nextHearing = hearings.find((h) => h.status === "SCHEDULED");

  return (
    <div className="card">
      <h3>Hearing Timeline</h3>
      <div style={overviewGridStyle}>
        <Field
          label="Previous Hearing"
          value={previousHearing ? new Date(previousHearing.hearingDate).toLocaleDateString("en-IN") : null}
        />
        <Field
          label="Next Hearing"
          value={nextHearing ? new Date(nextHearing.hearingDate).toLocaleDateString("en-IN") : null}
        />
      </div>
      {hearings.length > 0 && (
        <button style={{ marginTop: 12 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide Hearing History" : `Show Hearing History (${hearings.length})`}
        </button>
      )}
      {expanded && (
        <div className="table-scroll">
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bundle Number</th>
                <th>Court</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {sortedDesc.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.hearingDate).toLocaleDateString("en-IN")}</td>
                  <td>{bundleNumber || "—"}</td>
                  <td>{h.courtName ?? "—"}</td>
                  <td>{h.purpose ?? "—"}</td>
                  <td>
                    <span className="badge">{h.status}</span>
                  </td>
                  <td>{h.outcomeNotes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}







function Documents({
  caseId,
  documents,
  onChanged,
}: {
  caseId: string;
  documents: CaseDetailData["documents"];
  onChanged: () => void | Promise<void>;
}) {
  const { auth } = useAuth();

  const canDelete = !!auth && CASE_EDITOR_ROLES.includes(auth.role);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Pleadings");
  const [confidentiality, setConfidentiality] = useState("INTERNAL");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileActionId, setFileActionId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    blob: Blob;
    fileName: string;
    kind: "pdf" | "docx" | "image" | "text" | "xlsx" | "unsupported";
    text?: string;
    rows?: string[][];
    sheetNames?: string[];
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Hide deleted documents immediately while the parent refreshes.
  const [hiddenDocumentIds, setHiddenDocumentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`hiddenDocuments:${caseId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const visibleDocuments = documents.filter(
    (doc) => !hiddenDocumentIds.includes(doc.id)
  );

  // View and Download
  async function handleFileAction(
    versionId: string,
    fileName: string,
    action: "view" | "download"
  ) {
    setError(null);
    setSuccess(null);
    setFileActionId(`${versionId}-${action}`);

    try {
      const endpoint =
        `/documents/versions/${versionId}/download` +
        (action === "view" ? "?inline=true" : "");

      const response = await api.get<Blob>(endpoint, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: response.data.type || "application/octet-stream",
      });

      if (action === "download") {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName || "document";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        return;
      }

      const extension = fileName.split(".").pop()?.toLowerCase() || "";
      let kind: "pdf" | "docx" | "image" | "text" | "xlsx" | "unsupported" = "unsupported";
      let text: string | undefined;
      let rows: string[][] | undefined;
      let sheetNames: string[] | undefined;

      if (extension === "pdf") {
        kind = "pdf";
      } else if (extension === "docx") {
        kind = "docx";
      } else if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(extension)) {
        kind = "image";
      } else if (["txt", "csv", "log"].includes(extension)) {
        kind = "text";
        text = await blob.text();
      } else if (["xlsx", "xls"].includes(extension)) {
        kind = "xlsx";
        const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array" });
        sheetNames = workbook.SheetNames;
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = firstSheet
          ? (XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as unknown[][]).map((row) =>
            row.map((cell) => String(cell ?? ""))
          )
          : [];
      }

      setPreviewFile({ blob, fileName, kind, text, rows, sheetNames });
    } catch (err) {
      setError(getErrorMessage(err, `Unable to ${action} document`));
    } finally {
      setFileActionId(null);
    }
  }

  // Create and release temporary URLs for PDF and image previews.
  useEffect(() => {
    if (!previewFile || !["pdf", "image"].includes(previewFile.kind)) {
      setPreviewUrl(null);
      return;
    }
    const url = window.URL.createObjectURL(previewFile.blob);
    setPreviewUrl(url);
    return () => window.URL.revokeObjectURL(url);
  }, [previewFile]);

  // Render DOCX files in the preview panel.
  useEffect(() => {
    if (previewFile?.kind !== "docx" || !previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = "";
    renderAsync(previewFile.blob, container).catch((err) => {
      console.error("DOCX preview failed:", err);
      setError("Unable to preview this Word document. Please download it instead.");
    });
  }, [previewFile]);

  // Delete document

  async function handleDelete(documentId: string, docTitle: string) {
    const confirmed = window.confirm(
      `Hide document "${docTitle}" from the list?`
    );

    if (!confirmed) return;

    try {
      setError(null);
      setSuccess(null);
      setDeletingId(documentId);

      const updatedIds = [
        ...new Set([...hiddenDocumentIds, documentId]),
      ];

      localStorage.setItem(
        `hiddenDocuments:${caseId}`,
        JSON.stringify(updatedIds)
      );

      setHiddenDocumentIds(updatedIds);

      setSuccess("Document hidden successfully.");
    } catch (err) {
      setError("Unable to hide document.");
    } finally {
      setDeletingId(null);
    }
  }


  // Upload document
  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const form = new FormData();

      form.append("file", file);
      form.append("title", title);
      form.append("category", category);
      form.append("confidentiality", confidentiality);

      await api.post(`/cases/${caseId}/documents`, form);

      setFile(null);
      setTitle("");

      const fileInput = document.getElementById(
        "file"
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await onChanged();

      setSuccess("Document uploaded successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Upload Document */}
      <div className="card">
        <h3>Upload Document</h3>

        <form onSubmit={handleUpload}>
          <div className="form-grid">
            <div>
              <label htmlFor="docTitle">Title</label>
              <input
                id="docTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="docCategory">Category / Tag</label>
              <SearchableSelect
                id="docCategory"
                category="DOCUMENT_CATEGORY"
                value={category}
                onChange={setCategory}
                required
              />
            </div>
          </div>

          <label htmlFor="confidentiality">Confidentiality</label>
          <select
            id="confidentiality"
            value={confidentiality}
            onChange={(e) => setConfidentiality(e.target.value)}
          >
            <option value="INTERNAL">Internal only</option>
            <option value="CLIENT_VISIBLE">Client visible</option>
          </select>

          <label htmlFor="file">File</label>
          <input
            id="file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />

          {error && <p className="error-text">{error}</p>}

          {success && <p className="success-text">{success}</p>}

          <button
            className="primary"
            type="submit"
            disabled={uploading}
          >
            {uploading ? <AppLoader size="sm" inline /> : "Upload"}
          </button>
        </form>
      </div>

      {/* Documents List */}
      <div className="card">
        <h3>Documents</h3>

        {error && <p className="error-text">{error}</p>}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Confidentiality</th>
                <th>Latest Version</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {visibleDocuments.map((d) => {
                const latestVersion = d.versions[0];
                const fileName = latestVersion?.fileName || d.title;

                const viewId = latestVersion
                  ? `${latestVersion.id}-view`
                  : "";

                const downloadId = latestVersion
                  ? `${latestVersion.id}-download`
                  : "";

                return (
                  <tr key={d.id}>
                    <td>{d.title}</td>

                    <td>{d.category}</td>

                    <td>
                      {d.confidentiality === "CLIENT_VISIBLE"
                        ? "Client visible"
                        : "Internal"}
                    </td>

                    <td>
                      {latestVersion
                        ? `v${latestVersion.versionNumber} — ${fileName}`
                        : "No version available"}
                    </td>

                    <td>
                      <div className="document-actions">
                        {/* View */}
                        <button
                          type="button"
                          disabled={
                            !latestVersion ||
                            fileActionId === viewId ||
                            fileActionId === downloadId ||
                            deletingId === d.id
                          }
                          onClick={() => {
                            if (latestVersion) {
                              handleFileAction(
                                latestVersion.id,
                                fileName,
                                "view"
                              );
                            }
                          }}
                        >
                          {fileActionId === viewId ? "Opening..." : "View"}
                        </button>

                        {/* Download */}
                        <button
                          type="button"
                          disabled={
                            !latestVersion ||
                            fileActionId === viewId ||
                            fileActionId === downloadId ||
                            deletingId === d.id
                          }
                          onClick={() => {
                            if (latestVersion) {
                              handleFileAction(
                                latestVersion.id,
                                fileName,
                                "download"
                              );
                            }
                          }}
                        >
                          {fileActionId === downloadId
                            ? "Downloading..."
                            : "Download"}
                        </button>

                        {/* Delete */}
                        {canDelete && (
                          <button
                            type="button"
                            disabled={
                              deletingId === d.id || !!fileActionId
                            }
                            onClick={() => handleDelete(d.id, d.title)}
                          >
                            {deletingId === d.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {visibleDocuments.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No documents uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewFile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewFile.fileName}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(1100px, 98vw)",
              height: "min(900px, 94vh)",
              background: "#fff",
              color: "#222",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                borderBottom: "1px solid #ddd",
              }}
            >
              <strong style={{ overflowWrap: "anywhere" }}>{previewFile.fileName}</strong>
              <button type="button" onClick={() => setPreviewFile(null)}>Close</button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
              {previewFile.kind === "pdf" && previewUrl && (
                <iframe
                  title={previewFile.fileName}
                  src={previewUrl}
                  style={{ width: "100%", height: "100%", minHeight: 500, border: 0 }}
                />
              )}

              {previewFile.kind === "image" && previewUrl && (
                <div style={{ height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img
                    src={previewUrl}
                    alt={previewFile.fileName}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>
              )}

              {previewFile.kind === "docx" && (
                <div ref={previewRef} style={{ background: "#fff", color: "#222", minHeight: "100%" }} />
              )}

              {previewFile.kind === "text" && (
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "monospace" }}>
                  {previewFile.text}
                </pre>
              )}

              {previewFile.kind === "xlsx" && (
                <div>
                  <p style={{ marginTop: 0 }}>Sheet: {previewFile.sheetNames?.[0] || "Empty workbook"}</p>
                  <div style={{ overflow: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <tbody>
                        {(previewFile.rows || []).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) =>
                              rowIndex === 0 ? (
                                <th key={cellIndex} style={{ border: "1px solid #ccc", padding: 8, textAlign: "left", background: "#f3f3f3" }}>{cell}</th>
                              ) : (
                                <td key={cellIndex} style={{ border: "1px solid #ccc", padding: 8 }}>{cell}</td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {previewFile.kind === "unsupported" && (
                <p>This file type cannot be previewed here. Please use Download to open it in a compatible application.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





interface WorkingOnCaseEmployee {
  id: string;
  name: string;
  role: string;
  assigned: number;
  pending: number;
}

/** Step 1 second revision (item 5) — Smart Task Assignment detail table: never blocks
 * assignment, just gives the Managing Partner enough context to decide whether to add
 * another person or lean on someone already covering the matter. */
function WorkingOnCaseTable({ employees }: { employees: WorkingOnCaseEmployee[] }) {
  if (employees.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="muted" style={{ marginBottom: 6 }}>
        Already working on this case:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Role</th>
              <th>Current Assigned Tasks</th>
              <th>Pending Tasks</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.role.replaceAll("_", " ")}</td>
                <td>{e.assigned}</td>
                <td>{e.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



function Tasks({
  caseId,
  tasks,
  staff,
  onChanged,
}: {
  caseId: string;
  tasks: CaseDetailData["tasks"];
  staff: StaffMember[];
  onChanged: () => void;
}) {
  const { auth } = useAuth();

  const canDelete =
    !!auth && CASE_EDITOR_ROLES.includes(auth.role);

  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /*
   * Employees already working on this case.
   * This is informational only.
   */
  const currentlyWorking = Array.from(
    tasks.reduce(
      (byEmployee, t) => {
        const existing = byEmployee.get(t.assignedTo.id) ?? {
          name: t.assignedTo.name,
          role: t.assignedTo.role,
          assigned: 0,
          pending: 0,
        };

        existing.assigned += 1;

        if (
          t.status === "PENDING" ||
          t.status === "IN_PROGRESS"
        ) {
          existing.pending += 1;
        }

        byEmployee.set(t.assignedTo.id, existing);

        return byEmployee;
      },
      new Map<
        string,
        {
          name: string;
          role: string;
          assigned: number;
          pending: number;
        }
      >()
    )
  ).map(([id, info]) => ({
    id,
    ...info,
  }));

  /*
   * Create a new task for this case.
   *
   * Backend endpoint:
   * POST /api/cases/:caseId/tasks
   */
  async function handleCreate(e: FormEvent) {
    e.preventDefault();

    setError(null);

    if (!title.trim()) {
      setError("Enter a task title");
      return;
    }

    if (!assignedToId) {
      setError("Select an assignee");
      return;
    }

    setCreating(true);

    try {
      await api.post(`/cases/${caseId}/tasks`, {
        title: title.trim(),
        assignedToId,
        priority,
        dueDate: dueDate
          ? new Date(dueDate).toISOString()
          : undefined,
      });

      setTitle("");
      setAssignedToId("");
      setPriority("MEDIUM");
      setDueDate("");

      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to create task")
      );
    } finally {
      setCreating(false);
    }
  }

  /*
   * Update task status.
   */
  async function updateStatus(
    taskId: string,
    status: string
  ) {
    try {
      await api.patch(`/tasks/${taskId}`, {
        status,
      });

      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to update task status")
      );
    }
  }

  /*
   * Reassign an existing task.
   */
  async function reassign(
    taskId: string,
    newAssigneeId: string
  ) {
    try {
      await api.patch(`/tasks/${taskId}`, {
        assignedToId: newAssigneeId,
      });

      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to reassign task")
      );
    }
  }

  /*
   * Soft-delete task.
   */
  async function handleDelete(
    taskId: string,
    taskTitle: string
  ) {
    if (
      !window.confirm(
        `Move task "${taskTitle}" to the Recycle Bin?`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/tasks/${taskId}`);

      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to delete task")
      );
    }
  }

  return (
    <div>
      {/* =========================
          CREATE TASK
      ========================== */}
      <div className="card">
        <h3>Assign Task</h3>

        <WorkingOnCaseTable
          employees={currentlyWorking}
        />

        <form onSubmit={handleCreate}>
          <div className="form-grid">
            <div>
              <label htmlFor="taskTitle">
                Title
              </label>

              <input
                id="taskTitle"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                placeholder="Enter task title"
                required
              />
            </div>

            <div>
              <label htmlFor="assignee">
                Assign To
              </label>

              <select
                id="assignee"
                value={assignedToId}
                onChange={(e) =>
                  setAssignedToId(e.target.value)
                }
                required
              >
                <option value="">
                  Select…
                </option>

                {staff.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                  >
                    {s.name} —{" "}
                    {s.role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label htmlFor="priority">
                Priority
              </label>

              <select
                id="priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value)
                }
              >
                <option value="LOW">
                  Low
                </option>

                <option value="MEDIUM">
                  Medium
                </option>

                <option value="HIGH">
                  High
                </option>

                <option value="URGENT">
                  Urgent
                </option>
              </select>
            </div>

            <div>
              <label htmlFor="dueDate">
                Due Date
              </label>

              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) =>
                  setDueDate(e.target.value)
                }
              />
            </div>
          </div>

          {error && (
            <p className="error-text">
              {error}
            </p>
          )}

          <button
            className="primary"
            type="submit"
            disabled={creating}
          >
            {creating
              ? "Creating…"
              : "Create Task"}
          </button>
        </form>
      </div>

      {/* =========================
          TASK LIST
      ========================== */}
      <div className="card">
        <h3>Tasks</h3>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
                <th>Update Status</th>

                {canDelete && (
                  <th>Delete</th>
                )}
              </tr>
            </thead>

            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link
                      to={`/tasks/${t.id}`}
                    >
                      {t.title}
                    </Link>
                  </td>

                  <td>
                    <select
                      value={t.assignedToId}
                      onChange={(e) =>
                        reassign(
                          t.id,
                          e.target.value
                        )
                      }
                    >
                      {staff.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                        >
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    {t.priority}
                  </td>

                  <td>
                    <span className="badge">
                      {t.status.replaceAll(
                        "_",
                        " "
                      )}
                    </span>
                  </td>

                  <td>
                    {t.dueDate
                      ? new Date(
                        t.dueDate
                      ).toLocaleDateString()
                      : "—"}
                  </td>

                  <td>
                    <select
                      value={t.status}
                      onChange={(e) =>
                        updateStatus(
                          t.id,
                          e.target.value
                        )
                      }
                    >
                      <option value="PENDING">
                        Pending
                      </option>

                      <option value="IN_PROGRESS">
                        In Progress
                      </option>

                      <option value="COMPLETED">
                        Completed
                      </option>
                    </select>
                  </td>

                  {canDelete && (
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(
                            t.id,
                            t.title
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={
                      canDelete ? 7 : 6
                    }
                    className="muted"
                  >
                    No tasks yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function Hearings({
  caseId,
  bundleNumber,
  hearings,
  onChanged,
}: {
  caseId: string;
  bundleNumber: string | null;
  hearings: CaseDetailData["hearings"];
  onChanged: () => void;
}) {
  const { auth } = useAuth();
  const canManage = !!auth && HEARING_MANAGER_ROLES.includes(auth.role);

  // Only one scheduled hearing is allowed per case.
  const upcoming = hearings.find((h) => h.status === "SCHEDULED");

  const [hearingDate, setHearingDate] = useState("");
  const [courtName, setCourtName] = useState("");
  const [courtHall, setCourtHall] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [nextHearingDate, setNextHearingDate] = useState("");

  // Load the existing scheduled hearing details.
  useEffect(() => {
    if (upcoming) {
      setHearingDate(upcoming.hearingDate.slice(0, 10));
      setCourtName(upcoming.courtName ?? "");
      setCourtHall(upcoming.courtHall ?? "");
      setJudgeName(upcoming.judgeName ?? "");
      setPurpose(upcoming.purpose ?? "");
    } else {
      setHearingDate("");
      setCourtName("");
      setCourtHall("");
      setJudgeName("");
      setPurpose("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming?.id]);

  // Schedule or reschedule hearing.
  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        hearingDate: hearingDate
          ? new Date(`${hearingDate}T00:00:00`).toISOString()
          : undefined,
        courtName: courtName || undefined,
        courtHall: courtHall || undefined,
        judgeName: judgeName || undefined,
        purpose: purpose || undefined,
      };

      if (upcoming) {
        await api.patch(`/hearings/${upcoming.id}`, payload);
      } else {
        await api.post(`/cases/${caseId}/hearings`, payload);
      }

      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          upcoming
            ? "Failed to reschedule hearing"
            : "Failed to schedule hearing"
        )
      );
    } finally {
      setSaving(false);
    }
  }

  // Record hearing outcome.
  async function handleRecordOutcome(e: FormEvent) {
    e.preventDefault();
    if (!outcomeFor) return;

    setError(null);
    setSaving(true);

    try {
      await api.patch(`/hearings/${outcomeFor}/outcome`, {
        outcomeNotes: outcomeNotes || undefined,
        nextHearingDate: nextHearingDate
          ? new Date(`${nextHearingDate}T00:00:00`).toISOString()
          : undefined,
      });

      setOutcomeFor(null);
      setOutcomeNotes("");
      setNextHearingDate("");
      onChanged();
    } catch (err) {
      setError(
        getErrorMessage(err, "Failed to record hearing outcome")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {canManage && (
        <div className="card">
          <h3>
            {upcoming
              ? "Reschedule Upcoming Hearing"
              : "Schedule Hearing"}
          </h3>

          <form onSubmit={handleSchedule}>
            <div className="form-grid">
              <div>
                <label htmlFor="hearingDate">Hearing Date</label>
                <input
                  id="hearingDate"
                  type="date"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="hearingCourt">Court</label>
                <SearchableSelect
                  id="hearingCourt"
                  category="COURT"
                  value={courtName}
                  onChange={setCourtName}
                />
              </div>

              <div>
                <label htmlFor="hearingCourtHall">
                  Court Hall / Room No.
                </label>
                <input
                  id="hearingCourtHall"
                  value={courtHall}
                  onChange={(e) => setCourtHall(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="hearingJudge">Judge</label>
                <SearchableSelect
                  id="hearingJudge"
                  category="JUDGE"
                  value={judgeName}
                  onChange={setJudgeName}
                />
              </div>

              <div>
                <label htmlFor="hearingPurpose">Purpose</label>
                <SearchableSelect
                  id="hearingPurpose"
                  category="HEARING_PURPOSE"
                  value={purpose}
                  onChange={setPurpose}
                />
              </div>
            </div>

            {error && <p className="error-text">{error}</p>}

            <button
              className="primary"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : upcoming
                  ? "Save Reschedule"
                  : "Schedule Hearing"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Hearings</h3>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bundle Number</th>
                <th>Court</th>
                <th>Hall/No.</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Outcome</th>
                {canManage && <th></th>}
              </tr>
            </thead>

            <tbody>
              {hearings.map((h) => (
                <tr key={h.id}>
                  <td>
                    {new Date(h.hearingDate).toLocaleDateString("en-IN")}
                  </td>
                  <td>{bundleNumber || "—"}</td>

                  <td>{h.courtName ?? "—"}</td>
                  <td>{h.courtHall ?? "—"}</td>
                  <td>{h.purpose ?? "—"}</td>

                  <td>
                    <span className="badge">{h.status}</span>
                  </td>

                  <td>{h.outcomeNotes ?? "—"}</td>

                  {canManage && (
                    <td>
                      {h.status === "SCHEDULED" &&
                        (outcomeFor === h.id ? null : (
                          <button
                            type="button"
                            onClick={() => {
                              setOutcomeFor(h.id);
                              setError(null);
                            }}
                          >
                            Record Outcome
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              ))}

              {hearings.length === 0 && (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="muted"
                  >
                    No hearings scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {canManage && outcomeFor && (
        <div className="card">
          <h3>Record Hearing Outcome</h3>

          <form onSubmit={handleRecordOutcome}>
            <label htmlFor="outcomeNotes">Outcome Notes</label>
            <input
              id="outcomeNotes"
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
            />

            <label htmlFor="nextHearingDate">
              Next Hearing Date (optional)
            </label>
            <input
              id="nextHearingDate"
              type="date"
              value={nextHearingDate}
              onChange={(e) => setNextHearingDate(e.target.value)}
            />

            {error && (
              <p className="error-text">{error}</p>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                className="primary"
                type="submit"
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {saving && (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid currentColor",
                      borderRightColor: "transparent",
                      borderRadius: "50%",
                      animation: "outcomeSpin 0.7s linear infinite",
                    }}
                  />
                )}

                {saving ? "Saving..." : "Save Outcome"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setOutcomeFor(null);
                  setError(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>

          <style>
            {`
        @keyframes outcomeSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}
          </style>
        </div>
      )}
    </div>
  );
}


function Notes({
  caseId,
  notes,
  onChanged,
}: {
  caseId: string;
  notes: CaseDetailData["notes"];
  onChanged: () => void;
}) {
  const { auth } = useAuth();
  const canWrite = !!auth && NOTE_AUTHOR_ROLES.includes(auth.role);

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("INTERNAL");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/cases/${caseId}/notes`, { content, visibility });
      setContent("");
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add note"));
    }
  }

  return (
    <div>
      {canWrite && (
        <div className="card">
          <h3>Add Diary Entry</h3>
          <form onSubmit={handleAdd}>
            <label htmlFor="noteContent">Note</label>
            <textarea
              id="noteContent"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              required
            />
            <label htmlFor="noteVisibility">Visibility</label>
            <select id="noteVisibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="INTERNAL">Internal only</option>
              <option value="CLIENT_VISIBLE">Client visible</option>
            </select>
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit">
              Add Entry
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Case Timeline / Notes</h3>
        {notes.length === 0 && <p className="muted">No diary entries yet.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {notes.map((n) => (
            <li key={n.id} style={{ borderBottom: "1px solid var(--color-border)", padding: "10px 0" }}>
              <p style={{ margin: 0 }}>{n.content}</p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85em" }}>
                {n.author.name} · {new Date(n.createdAt).toLocaleString()}
                {n.visibility === "CLIENT_VISIBLE" ? " · Client visible" : ""}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
