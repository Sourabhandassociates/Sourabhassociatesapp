/**
 * Step 3 — Enterprise Role & Permission Management (SRD Section 8a). The full
 * permission catalogue and its seeded role defaults, exactly as tabulated in
 * STEP3_ROLE_PERMISSION_DESIGN.md Section 3 — every default here was reverse-
 * engineered from and verified against this application's actual current route
 * and service-layer behavior, not assumed from the SRD's narrative. This module
 * is the single source of truth the seed script (M1) reads from; the evaluator
 * and admin API (M2/M3) will read the resulting database rows, not this file
 * directly, so a future catalogue change only ever needs a re-seed, never a
 * code change anywhere else.
 */
import { UserRole } from "@prisma/client";

export interface RoleDefaults {
  MANAGING_PARTNER: boolean;
  ASSOCIATE: boolean;
  JUNIOR_ASSOCIATE: boolean;
  OFFICE_STAFF: boolean;
  ACCOUNTS_TEAM: boolean;
}

export interface PermissionDefinition {
  key: string;
  module: string;
  action: string;
  label: string;
  isViewScope?: boolean;
  isCoreAdmin?: boolean;
  defaults: RoleDefaults;
}

export const ALL_ROLES: UserRole[] = [
  "MANAGING_PARTNER",
  "ASSOCIATE",
  "JUNIOR_ASSOCIATE",
  "OFFICE_STAFF",
  "ACCOUNTS_TEAM",
];

/** Design doc Section 3.3 */
const dashboard: PermissionDefinition[] = [
  {
    key: "DASHBOARD.VIEW",
    module: "DASHBOARD",
    action: "VIEW",
    label: "View Dashboard",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
];

/** Design doc Section 3.4 */
const cases: PermissionDefinition[] = [
  {
    key: "CASES.VIEW_ALL",
    module: "CASES",
    action: "VIEW_ALL",
    label: "View All Cases",
    isViewScope: true,
    // Accounts Team granted true (Milestone 2, SRD Section 3.5 — "read-only access to
    // case metadata needed for invoicing... across all cases/clients"): without some
    // case view scope, Expense/TimeLog/Invoice routes being case-scoped (assertCaseAccess)
    // would 404 for Accounts Team regardless of their EXPENSES.*/BILLING.* grants. Still
    // read-only in effect — CASES.EDIT/CHANGE_STATUS/etc. stay false for this role below.
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASES.VIEW_ASSIGNED",
    module: "CASES",
    action: "VIEW_ASSIGNED",
    label: "View Assigned Cases",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: false, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASES.CREATE",
    module: "CASES",
    action: "CREATE",
    label: "Create Case",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.EDIT",
    module: "CASES",
    action: "EDIT",
    label: "Edit Case Details",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.CHANGE_STATUS",
    module: "CASES",
    action: "CHANGE_STATUS",
    label: "Change Case Status/Stage",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.MANAGE_ADVOCATES",
    module: "CASES",
    action: "MANAGE_ADVOCATES",
    label: "Add/Remove Advocates",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.DELETE",
    module: "CASES",
    action: "DELETE",
    label: "Delete Case (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    // Milestone 1 (Version 1.0 completion, SRD Section 10.1 — "Case reassignment
    // workflow (Partner-only) with audit trail"). Distinct from MANAGE_ADVOCATES,
    // which only adds/removes Advocates — this changes the single owning Partner.
    key: "CASES.REASSIGN",
    module: "CASES",
    action: "REASSIGN",
    label: "Reassign Case to a Different Partner",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.RESTORE",
    module: "CASES",
    action: "RESTORE",
    label: "Restore Case",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASES.PERMANENT_DELETE",
    module: "CASES",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Case",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.5 */
const clients: PermissionDefinition[] = [
  {
    key: "CLIENTS.VIEW_ALL",
    module: "CLIENTS",
    action: "VIEW_ALL",
    label: "View All Clients",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CLIENTS.VIEW_ASSIGNED",
    module: "CLIENTS",
    action: "VIEW_ASSIGNED",
    label: "View Case-Linked Clients",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: false, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.CREATE",
    module: "CLIENTS",
    action: "CREATE",
    label: "Create Client",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.EDIT",
    module: "CLIENTS",
    action: "EDIT",
    label: "Edit Client Profile",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.CHANGE_STATUS",
    module: "CLIENTS",
    action: "CHANGE_STATUS",
    label: "Change Client Status",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.DELETE",
    module: "CLIENTS",
    action: "DELETE",
    label: "Delete Client (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.RESTORE",
    module: "CLIENTS",
    action: "RESTORE",
    label: "Restore Client",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.PERMANENT_DELETE",
    module: "CLIENTS",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Client",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CLIENTS.MANAGE_PORTAL_ACCESS",
    module: "CLIENTS",
    action: "MANAGE_PORTAL_ACCESS",
    label: "Manage Client Portal Permissions",
    // Deliberately not isCoreAdmin — unlike RESTORE/PERMANENT_DELETE, this isn't part
    // of the Managing Partner Safety guarantee's fixed set; the Managing Partner may
    // delegate it to another role later via Role Defaults if they choose to.
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.6 */
const tasks: PermissionDefinition[] = [
  {
    key: "TASKS.VIEW_ALL",
    module: "TASKS",
    action: "VIEW_ALL",
    label: "View All Tasks (firm-wide)",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.VIEW_ASSIGNED",
    module: "TASKS",
    action: "VIEW_ASSIGNED",
    label: "View Tasks on Accessible Cases",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.VIEW_OWN",
    module: "TASKS",
    action: "VIEW_OWN",
    label: "View My Tasks",
    isViewScope: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "TASKS.CREATE",
    module: "TASKS",
    action: "CREATE",
    label: "Create Task",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.EDIT",
    module: "TASKS",
    action: "EDIT",
    label: "Edit Task Details",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  /**
   * Added post-M2, completing PATCH /api/tasks/:id's migration to the permission
   * framework (STEP3_ROLE_PERMISSION_DESIGN.md Section 3.6) — status changes had no
   * distinct key before; they shared the same "no gate at all" behavior as edit and
   * reassignment, so this key's defaults mirror TASKS.EDIT/TASKS.ASSIGN exactly
   * (preserving current behavior, not a policy change).
   */
  {
    key: "TASKS.CHANGE_STATUS",
    module: "TASKS",
    action: "CHANGE_STATUS",
    label: "Update Task Status",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.ASSIGN",
    module: "TASKS",
    action: "ASSIGN",
    label: "Reassign Task",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.DELETE",
    module: "TASKS",
    action: "DELETE",
    label: "Delete Task (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.RESTORE",
    module: "TASKS",
    action: "RESTORE",
    label: "Restore Task",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TASKS.PERMANENT_DELETE",
    module: "TASKS",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Task",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.7 */
const hearings: PermissionDefinition[] = [
  {
    key: "HEARINGS.VIEW",
    module: "HEARINGS",
    action: "VIEW",
    label: "View Hearings",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "HEARINGS.CREATE",
    module: "HEARINGS",
    action: "CREATE",
    label: "Schedule Hearing",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "HEARINGS.EDIT",
    module: "HEARINGS",
    action: "EDIT",
    label: "Reschedule / Record Outcome",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.8. `isCoreAdmin: true` added by the Case Section Access
 * feature (2026-08-17, see the `caseSectionAccess` array below) — this key is
 * reused as-is for that feature's "Notes" section gate rather than duplicated,
 * per the feature's own explicit "reuse if an equivalent permission already
 * exists" instruction. It previously gated nothing at runtime (defined but never
 * checked by any route); it's now enforced by `GET /cases/:caseId/notes`. */
const caseNotes: PermissionDefinition[] = [
  {
    key: "CASE_NOTES.VIEW",
    module: "CASE_NOTES",
    action: "VIEW",
    label: "View Case Notes / Diary",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CASE_NOTES.CREATE",
    module: "CASE_NOTES",
    action: "CREATE",
    label: "Add Case Note",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.9 */
const documents: PermissionDefinition[] = [
  {
    key: "DOCUMENTS.VIEW",
    module: "DOCUMENTS",
    action: "VIEW",
    label: "View Documents",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "DOCUMENTS.UPLOAD",
    module: "DOCUMENTS",
    action: "UPLOAD",
    label: "Upload / Add Version",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "DOCUMENTS.DELETE",
    module: "DOCUMENTS",
    action: "DELETE",
    label: "Delete Document (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "DOCUMENTS.RESTORE",
    module: "DOCUMENTS",
    action: "RESTORE",
    label: "Restore Document",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "DOCUMENTS.PERMANENT_DELETE",
    module: "DOCUMENTS",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Document",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    // Reserved — no Document Approval Workflow exists yet to approve anything
    // through (design doc Section 3.9/3.1). Seeded false for every role; the
    // first real default will be set when that workflow is built.
    key: "DOCUMENTS.APPROVE",
    module: "DOCUMENTS",
    action: "APPROVE",
    label: "Approve Document (reserved)",
    defaults: { MANAGING_PARTNER: false, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.10 */
const calendar: PermissionDefinition[] = [
  {
    key: "CALENDAR.VIEW",
    module: "CALENDAR",
    action: "VIEW",
    label: "View Hearing Calendar",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.11 */
const employeeAudit: PermissionDefinition[] = [
  {
    key: "EMPLOYEE_AUDIT.VIEW",
    module: "EMPLOYEE_AUDIT",
    action: "VIEW",
    label: "View Employee Task Audit",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.12 */
const recycleBin: PermissionDefinition[] = [
  {
    key: "RECYCLE_BIN.VIEW",
    module: "RECYCLE_BIN",
    action: "VIEW",
    label: "View Recycle Bin",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.13 */
const users: PermissionDefinition[] = [
  {
    key: "USERS.VIEW",
    module: "USERS",
    action: "VIEW",
    label: "View User Accounts (admin list)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "USERS.VIEW_DIRECTORY",
    module: "USERS",
    action: "VIEW_DIRECTORY",
    label: "Staff Directory (name/role lookup)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "USERS.CREATE",
    module: "USERS",
    action: "CREATE",
    label: "Create User Account",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "USERS.EDIT_STATUS",
    module: "USERS",
    action: "EDIT_STATUS",
    label: "Activate/Deactivate User",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "USERS.FORCE_LOGOUT",
    module: "USERS",
    action: "FORCE_LOGOUT",
    label: "Force Logout (all devices)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "USERS.MANAGE_PERMISSIONS",
    module: "USERS",
    action: "MANAGE_PERMISSIONS",
    label: "Manage Roles & Permissions",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.14 */
const settings: PermissionDefinition[] = [
  {
    key: "SETTINGS.VIEW",
    module: "SETTINGS",
    action: "VIEW",
    label: "View Dropdown Values",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "SETTINGS.MANAGE",
    module: "SETTINGS",
    action: "MANAGE",
    label: "Manage Dropdown Values",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/** Design doc Section 3.15 — reserved, no dedicated viewer screen exists yet. */
const auditLog: PermissionDefinition[] = [
  {
    key: "AUDIT_LOG.VIEW_ALL",
    module: "AUDIT_LOG",
    action: "VIEW_ALL",
    label: "View Full Audit Log",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "AUDIT_LOG.VIEW_OWN",
    module: "AUDIT_LOG",
    action: "VIEW_OWN",
    label: "View Own Action History",
    defaults: { MANAGING_PARTNER: false, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
];

/** Design doc Section 3.16 — reserved, no Reports module exists yet. */
const reports: PermissionDefinition[] = [
  {
    key: "REPORTS.VIEW",
    module: "REPORTS",
    action: "VIEW",
    label: "View Reports",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "REPORTS.EXPORT",
    module: "REPORTS",
    action: "EXPORT",
    label: "Export Reports",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
];

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 12 — Contact Directory). Matrix row
 * "Contact Directory — view/manage": MP/Associate/Junior/Office Staff full, Accounts
 * view-only, Client no access (Section 8's table). Contact is also the fifth Recycle
 * Bin entity (Section 27), hence RESTORE/PERMANENT_DELETE here, matching how CASES/
 * CLIENTS/DOCUMENTS/TASKS carry their own RESTORE/PERMANENT_DELETE keys above.
 */
const contacts: PermissionDefinition[] = [
  {
    key: "CONTACTS.VIEW",
    module: "CONTACTS",
    action: "VIEW",
    label: "View Contact Directory",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CONTACTS.CREATE",
    module: "CONTACTS",
    action: "CREATE",
    label: "Create Contact",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CONTACTS.EDIT",
    module: "CONTACTS",
    action: "EDIT",
    label: "Edit Contact",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CONTACTS.DELETE",
    module: "CONTACTS",
    action: "DELETE",
    label: "Delete Contact (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CONTACTS.RESTORE",
    module: "CONTACTS",
    action: "RESTORE",
    label: "Restore Contact",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "CONTACTS.PERMANENT_DELETE",
    module: "CONTACTS",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Contact",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/**
 * Milestone 2 (Version 1.0 completion, SRD Section 16.1 — Time Tracking). Matrix row
 * "Log billable hours / expenses": MP/Associate/Junior full, Office Staff/Accounts no
 * (Accounts logs Expenses, not billable time — see the `expenses` array below).
 */
const timeLogs: PermissionDefinition[] = [
  {
    key: "TIMELOGS.VIEW",
    module: "TIMELOGS",
    action: "VIEW",
    label: "View Time Logs",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "TIMELOGS.CREATE",
    module: "TIMELOGS",
    action: "CREATE",
    label: "Log Billable Hours",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TIMELOGS.EDIT",
    module: "TIMELOGS",
    action: "EDIT",
    label: "Edit Time Log",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "TIMELOGS.DELETE",
    module: "TIMELOGS",
    action: "DELETE",
    label: "Delete Time Log",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/**
 * Milestone 2 (SRD Section 16.2 — Expense Management). Expense is also the sixth
 * Recycle Bin entity (SRD Section 27 names Expenses as a candidate), hence RESTORE/
 * PERMANENT_DELETE here, matching CONTACTS' shape above.
 */
const expenses: PermissionDefinition[] = [
  {
    key: "EXPENSES.VIEW",
    module: "EXPENSES",
    action: "VIEW",
    label: "View Expenses",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "EXPENSES.CREATE",
    module: "EXPENSES",
    action: "CREATE",
    label: "Log Expense",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "EXPENSES.EDIT",
    module: "EXPENSES",
    action: "EDIT",
    label: "Edit Expense",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "EXPENSES.DELETE",
    module: "EXPENSES",
    action: "DELETE",
    label: "Delete Expense (soft)",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "EXPENSES.RESTORE",
    module: "EXPENSES",
    action: "RESTORE",
    label: "Restore Expense",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "EXPENSES.PERMANENT_DELETE",
    module: "EXPENSES",
    action: "PERMANENT_DELETE",
    label: "Permanently Delete Expense",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/**
 * Milestone 2 (SRD Section 16.1 — Billing & Invoicing). Matrix rows "Create/edit/
 * approve invoices" (MP approves, Associate drafts only, Accounts full) and "View/pay
 * invoices" (MP/Accounts only — Associate can draft one without being able to browse
 * the firm's invoice list, matching the SRD's own distinction between the two rows).
 */
const billing: PermissionDefinition[] = [
  {
    key: "BILLING.VIEW",
    module: "BILLING",
    action: "VIEW",
    label: "View Invoices",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "BILLING.CREATE_DRAFT",
    module: "BILLING",
    action: "CREATE_DRAFT",
    label: "Draft Invoice",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "BILLING.APPROVE",
    module: "BILLING",
    action: "APPROVE",
    label: "Approve/Send Invoice",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "BILLING.RECORD_PAYMENT",
    module: "BILLING",
    action: "RECORD_PAYMENT",
    label: "Record Payment",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
];

/**
 * Milestone 3 (Version 1.0 completion, SRD Section 25 — Data Import & Export). Export
 * itself needs no new key ("export limited to what a role can already see" — the SRD's
 * own words, i.e. it's gated by each entity's existing VIEW permission, not a new one).
 * Bulk import is a distinct, higher-risk write path (creates many records at once,
 * bypassing the normal one-at-a-time create screens), so it gets its own key,
 * restricted per the SRD to Managing Partner and Office Staff.
 */
const dataImport: PermissionDefinition[] = [
  {
    key: "DATA_IMPORT.RUN",
    module: "DATA_IMPORT",
    action: "RUN",
    label: "Bulk Import Clients/Matters/Contacts",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
];

/**
 * Milestone 4 (Version 1.0 completion, SRD Section 24 — Admin, Settings & Customization).
 * Firm Profile and Custom Fields match SRD Section 8's "Custom Fields/Dropdowns/Practice
 * Areas — Managing Partner only" row exactly. Announcements match the same section's
 * "Post office announcements — MP full, Office Staff draft-only" row: `CREATE` is
 * granted to both, but the service layer (announcements.service.ts) forces
 * `isActive: false` on an Office-Staff-authored announcement regardless of what it's
 * asked to create with, the same "role default doesn't distinguish action from actor
 * type — the service enforces the narrower rule" pattern Milestone 2's Associate-drafts-
 * only invoice rule already established.
 */
const adminCustomization: PermissionDefinition[] = [
  {
    key: "FIRM_PROFILE.VIEW",
    module: "FIRM_PROFILE",
    action: "VIEW",
    label: "View Firm Profile",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "FIRM_PROFILE.MANAGE",
    module: "FIRM_PROFILE",
    action: "MANAGE",
    label: "Edit Firm Profile",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "ANNOUNCEMENTS.VIEW",
    module: "ANNOUNCEMENTS",
    action: "VIEW",
    label: "View Office Announcements",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "ANNOUNCEMENTS.CREATE",
    module: "ANNOUNCEMENTS",
    action: "CREATE",
    label: "Post Office Announcement",
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: true, ACCOUNTS_TEAM: false },
  },
  {
    key: "CUSTOM_FIELDS.MANAGE",
    module: "CUSTOM_FIELDS",
    action: "MANAGE",
    label: "Manage Custom Fields",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
  {
    key: "SESSIONS.VIEW_ANY",
    module: "SESSIONS",
    action: "VIEW_ANY",
    label: "View Any User's Sessions",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: false },
  },
];

/**
 * ACCOUNTS module (2026-08-14). The Managing Partner's spec gave this exact 14-key
 * list (accounts.view, accounts.create_payment, ...) to be "integrated into the
 * existing permission catalogue" — kept as its own module rather than folded into
 * BILLING/EXPENSES because it gates a new, separate ledger (ProfessionalFee/
 * AccountsPayment) and a new top-level "ACCOUNTS" sidebar section, distinct from
 * the pre-existing Invoices/Expenses/TimeLogs modules those legacy keys still gate
 * unchanged. Every key is isCoreAdmin: true — a deliberate, stronger-than-the-
 * BILLING.VIEW-precedent choice, confirmed with the Managing Partner directly,
 * matching the spec's repeated "must never lose Accounts access / unrestricted
 * access" language (Sections 2/29/30). ACCOUNTS_TEAM gets every key by default,
 * matching the spec's stated initial state ("Accounts User: ACCESS ENABLED");
 * every other non-MP role starts with none, matching "All other users: NO ACCESS".
 * ACCOUNTS.VIEW is the master gate (dashboard, search, client/case summaries, and
 * payment viewing/listing — there is no separate view_payment key, matching the
 * spec's own list exactly). VIEW_EXPENSES/VIEW_INVOICE/VIEW_REPORTS are narrower
 * sub-gates the Managing Partner can use to restrict a user to part of Accounts.
 */
const accounts: PermissionDefinition[] = [
  {
    key: "ACCOUNTS.VIEW",
    module: "ACCOUNTS",
    action: "VIEW",
    label: "View Accounts",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.CREATE_PAYMENT",
    module: "ACCOUNTS",
    action: "CREATE_PAYMENT",
    label: "Record Payment",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.EDIT_PAYMENT",
    module: "ACCOUNTS",
    action: "EDIT_PAYMENT",
    label: "Edit Payment",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.DELETE_PAYMENT",
    module: "ACCOUNTS",
    action: "DELETE_PAYMENT",
    label: "Delete Payment",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.VIEW_EXPENSES",
    module: "ACCOUNTS",
    action: "VIEW_EXPENSES",
    label: "View Expenses (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.CREATE_EXPENSE",
    module: "ACCOUNTS",
    action: "CREATE_EXPENSE",
    label: "Log Expense (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.EDIT_EXPENSE",
    module: "ACCOUNTS",
    action: "EDIT_EXPENSE",
    label: "Edit Expense (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.DELETE_EXPENSE",
    module: "ACCOUNTS",
    action: "DELETE_EXPENSE",
    label: "Delete Expense (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.VIEW_INVOICE",
    module: "ACCOUNTS",
    action: "VIEW_INVOICE",
    label: "View Invoices (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.CREATE_INVOICE",
    module: "ACCOUNTS",
    action: "CREATE_INVOICE",
    label: "Create Invoice (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.EDIT_INVOICE",
    module: "ACCOUNTS",
    action: "EDIT_INVOICE",
    label: "Edit Invoice (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.DELETE_INVOICE",
    module: "ACCOUNTS",
    action: "DELETE_INVOICE",
    label: "Delete Invoice (Accounts)",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.VIEW_REPORTS",
    module: "ACCOUNTS",
    action: "VIEW_REPORTS",
    label: "View Accounts Reports",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "ACCOUNTS.MANAGE_FEE",
    module: "ACCOUNTS",
    action: "MANAGE_FEE",
    label: "Manage Professional Fees",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
];

/**
 * Case Section Access (2026-08-17). The Case Detail page's eight tabs/sections
 * (Overview, Documents, Tasks, Hearings, Timeline, Notes, Billing/Expenses,
 * Accounts) were previously visible to every staff role unconditionally (or, for
 * Billing/Expenses and Accounts, gated by a hardcoded frontend role array /
 * ACCOUNTS.VIEW respectively — never a dedicated, per-section, Managing-Partner-
 * configurable permission). This is a NEW, additional authorization layer on top
 * of — never a replacement for — existing case-level access (`assertCaseAccess`)
 * and, for Billing/Expenses and Accounts specifically, the existing EXPENSES.x /
 * ACCOUNTS.x permissions that remain independently authoritative for the
 * financial actions themselves (spec §8/§9: "Existing Accounts RBAC remains
 * authoritative for financial actions").
 *
 * `CASE_NOTES.VIEW` (defined above, in the `caseNotes` array — Design doc Section
 * 3.8) is reused unchanged for the "Notes" section, per the feature's own "reuse
 * if an equivalent permission already exists" instruction, rather than duplicated
 * here.
 *
 * Every key is `isCoreAdmin: true` (spec §2/§13 — "Managing Partner must always
 * have unrestricted access to all Case sections... must not be able to
 * accidentally remove their own access"), so `coreAdminSafety.ts`'s existing,
 * fully generic Rule A/Rule B automatically protect all eight keys (this one plus
 * CASE_NOTES.VIEW) from ever being stripped from the Managing Partner role
 * default or overridden away from a Managing-Partner-role user — zero new
 * protection code needed, exactly like the ACCOUNTS module precedent.
 *
 * Defaults are chosen to exactly preserve today's actual pre-feature behavior for
 * every role (a pure "add the ability to restrict further," never a day-one
 * access reduction):
 *  - Overview/Documents/Tasks/Hearings/Timeline had no gate at all before (every
 *    staff role with case access saw them) — default true for every role.
 *  - Billing/Expenses mirrors the frontend's pre-existing hardcoded
 *    `BILLING_VISIBLE_ROLES` array (CaseDetail.tsx): MP/Associate/Junior
 *    Associate/Accounts Team true, Office Staff false.
 *  - Accounts mirrors ACCOUNTS.VIEW's own defaults exactly (MP/Accounts Team
 *    true, everyone else false), since the Accounts tab was already gated by
 *    `accountsPermissions.view` before this feature existed.
 */
const caseSectionAccess: PermissionDefinition[] = [
  {
    key: "CASE_OVERVIEW.VIEW",
    module: "CASE_OVERVIEW",
    action: "VIEW",
    label: "View Case Overview",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_DOCUMENTS.VIEW",
    module: "CASE_DOCUMENTS",
    action: "VIEW",
    label: "View Case Documents Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_TASKS.VIEW",
    module: "CASE_TASKS",
    action: "VIEW",
    label: "View Case Tasks Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_HEARINGS.VIEW",
    module: "CASE_HEARINGS",
    action: "VIEW",
    label: "View Case Hearings Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_TIMELINE.VIEW",
    module: "CASE_TIMELINE",
    action: "VIEW",
    label: "View Case Hearing Timeline",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    // Facts & Arguments case sections (2026-08-18). No equivalent permission
    // already existed for either — the catalogue was searched for "FACTS"/
    // "ARGUMENTS" before adding these, per that feature's explicit "do not
    // create duplicates" instruction. Defaults mirror the other case-content
    // tabs (Overview/Documents/Tasks/Hearings/Timeline) rather than the
    // financial cluster (Billing/Expenses/Accounts) — Facts/Arguments are
    // litigation content, not financial data, so every staff role that can
    // already see a case's documents/notes sees these by default too.
    key: "CASE_FACTS.VIEW",
    module: "CASE_FACTS",
    action: "VIEW",
    label: "View Case Facts Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_ARGUMENTS.VIEW",
    module: "CASE_ARGUMENTS",
    action: "VIEW",
    label: "View Case Arguments Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: true, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_BILLING_EXPENSES.VIEW",
    module: "CASE_BILLING_EXPENSES",
    action: "VIEW",
    label: "View Case Billing / Expenses Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: true, JUNIOR_ASSOCIATE: true, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
  {
    key: "CASE_ACCOUNTS.VIEW",
    module: "CASE_ACCOUNTS",
    action: "VIEW",
    label: "View Case Accounts Tab",
    isCoreAdmin: true,
    defaults: { MANAGING_PARTNER: true, ASSOCIATE: false, JUNIOR_ASSOCIATE: false, OFFICE_STAFF: false, ACCOUNTS_TEAM: true },
  },
];

/**
 * The complete catalogue. Order matches the design doc's module order, with Milestone-1,
 * Milestone-2, Milestone-3, Milestone-4 (Version 1.0 completion), the ACCOUNTS module,
 * and the Case Section Access feature additions appended after the Step 3 baseline.
 */
export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  ...dashboard,
  ...cases,
  ...clients,
  ...tasks,
  ...hearings,
  ...caseNotes,
  ...documents,
  ...calendar,
  ...employeeAudit,
  ...recycleBin,
  ...users,
  ...settings,
  ...auditLog,
  ...reports,
  ...contacts,
  ...timeLogs,
  ...expenses,
  ...billing,
  ...dataImport,
  ...adminCustomization,
  ...accounts,
  ...caseSectionAccess,
];

export const CORE_ADMIN_PERMISSION_KEYS = PERMISSION_CATALOGUE.filter((p) => p.isCoreAdmin).map((p) => p.key);
