# Software Requirements Document & Project Blueprint
## Sourabh And Associates — Law Firm Management App

**Status: APPROVED — FROZEN AS VERSION 1.16**
**This document is the master reference for the project. Do not modify without an explicit new-version request from the Managing Partner.**

**Version History:**
- **v1.0** — approved and frozen 2026-08-02. Full text preserved at [SRD_v1.0.md](SRD_v1.0.md) for historical reference; superseded by this document.
- **v1.1** — approved 2026-08-03. Adds **Section 8a (Configurable Permissions)** and the supporting `Permission`/`RolePermission`/`UserPermissionOverride` entities in Section 7, extending Section 8's fixed role matrix into a database-driven default-plus-override model. Full text preserved at [SRD_v1.1.md](SRD_v1.1.md); superseded by this document.
- **v1.2** — approved 2026-08-03. Managing Partner review feedback on Step 1 (Case Operations): adds a configurable **Case Stage** field (Section 10.1, distinct from the fixed lifecycle Status in Section 8), a firm-wide **admin-managed dropdown system** (`PicklistValue`/`PicklistCategory`, Section 7 and Section 24) replacing free text for Court/Judge/Case Stage/Practice Area/Case Type/Opposite Counsel/Opposite Party/Department/Hearing Purpose, new Case attributes (Case Type, Opposite Counsel, Opposite Party, Department, Description — Section 10.1), a clarified **single-active-hearing-per-case rule** with in-place rescheduling (Section 15.1), and an **Employee Task Audit** capability (Section 18.1/19). Task reassignment and the Managing Partner Dashboard's pending-task pagination are UI/workflow refinements requiring no SRD change. Full text preserved at [SRD_v1.2.md](SRD_v1.2.md); superseded by this document.
- **v1.3** — approved 2026-08-03. Second round of Managing Partner review feedback on Step 1, all confirmed as refinements requiring no significant architectural change: a full **Task History** trail (Section 14), an expanded **Employee Task Audit** with workload metrics (Section 18.1/19), a **Hearing Timeline** on the Case Overview (Section 10.1/15.1), a richer **Smart Task Assignment** view (Section 14), and — the most consequential change — three patterns are formalized as **standing architectural conventions, not one-off implementation choices**: (1) every future dropdown must use the `PicklistValue` system rather than a hardcoded list (Section 24), (2) every future "who did what, when" requirement is read from the existing `AuditLog` rather than a bespoke history table (Section 29), (3) a resource's primary detail screen is one professionally laid-out page, not a set of tabs the user must hunt across (Section 10.1, 14). Full text preserved at [SRD_v1.3.md](SRD_v1.3.md); superseded by this document.
- **v1.4** — approved 2026-08-03. Implements **Step 2 (Soft Delete & Recycle Bin)** exactly as specified in Section 27: soft-delete fields (implemented as `deletedAt`/`deletedById`, a nullable-timestamp equivalent of the `is_deleted`/`deleted_at`/`deleted_by` triad named in Section 27) added to Case, Client, Document, and Task; a Managing-Partner-only Recycle Bin (Section 27) to list/restore/permanently-delete across all four; every soft-delete/restore/permanent-delete action audit-logged (Section 29); deleted records excluded from every existing list, search, dashboard, and authorization check firm-wide. Section 27 is amended below to record the concrete field names and the **generic, switch-based-per-entity architecture** chosen so a fifth soft-deletable entity (Hearings, Notes, Expenses, Contacts, Knowledge Base, etc.) can be added by extending one module rather than building a new one. Full text preserved at [SRD_v1.4.md](SRD_v1.4.md); superseded by this document.
- **v1.5** — approved 2026-08-04. Implements **Step 3 (Enterprise Role & Permission Management)** in full, delivered as four milestones (a full engineering blueprint frozen and approved before any code — see [STEP3_ROLE_PERMISSION_DESIGN.md](../STEP3_ROLE_PERMISSION_DESIGN.md) — then built and browser-verified incrementally, each milestone gated on the Managing Partner's approval before the next): the `Permission`/`RolePermission`/`UserPermissionOverride` schema and a 54-key permission catalogue exactly reproducing Section 8's role matrix (no behavior change on adoption, per Section 8a.4's guarantee); every protected endpoint migrated from hardcoded role checks to the permission system, with no exceptions — including the one route whose authorization depends on request-body content, resolved via body-aware service-layer logic rather than left as a gap; the Managing-Partner-only Role & Permission Management admin API and UI; and the Managing Partner Safety guarantee (Section 8a.4) extended to cover account deactivation, not just permission edits, so no configuration or action can ever leave the firm without an active, fully-privileged Managing Partner. **Section 8a.3 is amended below** to add the **Permission Summary tab** — a third screen, requested during implementation, distinct from Employee Overrides in being read-only and dedicated to the "what can this person do and why" question — plus Search Employee/Search Permission and a bulk Reset-to-Role-Defaults action, none of which were in the original v1.1 text. See [CHANGELOG.md](../CHANGELOG.md) for the full milestone-by-milestone record and [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md) for the post-Step-3 production-readiness assessment.
- **v1.6** — approved 2026-08-04. Implements **Step 4 (Litigation Operations Enhancement)**: a new **Cause List** screen (Section 15.1a, added below) — date-range presets, Court/Court Hall/Advocate/Client/Case Stage/Hearing Status/Search filters, Court-wise/Date-wise grouping, a Firm/My/Employee scope toggle, and Print/Export PDF/Export Excel — built entirely on the existing `Hearing` table (no separate data source, no schema duplication) plus one additive field, `Hearing.courtHall` (Section 15.1, amended below). Nine of the ten smaller enhancements requested alongside the Cause List (task reassignment, dashboard pagination, Employee Task Audit, "already working on this case" visibility, Case Stage picklist, Case Overview fields, Previous/Next Hearing logic, Hearing Calendar day-list) were verified against the live codebase to already exist from Step 1 and were not re-implemented; the tenth — converting the last hardcoded, purely-descriptive dropdown (Client Type) to the Picklist system — is complete (Section 24, no SRD text change needed, already generically specified). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.7** — approved 2026-08-05. Implements **Milestone 1 of the Version 1.0 completion plan** (Managing Partner's four-milestone grouping of all remaining in-scope SRD requirements, explicitly excluding Client Portal, Internal/Client Chat, Knowledge Base, OCR, Digital File System, Document Approval Workflow, Calendar Sync, Office Management, and native mobile apps, all of which remain deferred): **Contact Directory** (Section 12, new `Contact`/`ContactMatter` entities, `/contacts`), **Tagging System** (Section 10.3, `CaseTag` join table over a new `TAG` Picklist category, filterable on the Case List), **Advanced Conflict Check** (Section 10.2, amended below — fuzzy/partial name matching against Client names, Contact names, and used Opposite Party/Opposite Counsel values, run at Client and Contact creation; blocks silent creation, requires Managing-Partner acknowledgment with a mandatory reason, logged to `ConflictCheckLog`), and **Case Reassignment** (Section 10.1, amended below — a Managing-Partner-only `CASES.REASSIGN` permission changing a case's owning Partner, audit-logged). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.8** — approved 2026-08-05. Implements **Milestone 2 of the Version 1.0 completion plan**: **Time Tracking** (Section 16.1, amended below — `TimeLog` model, logged by fee-earners against a case and optionally a task), **Expense Management** (Section 16.2, amended below — `Expense` model with a new `EXPENSE_CATEGORY` Picklist category, the sixth Recycle Bin entity per Section 27), and **Billing & Invoicing** (Section 16.1, amended below — `Invoice`/`InvoiceLineItem`/`Payment` models, `SA-INV-2026-0001` sequential numbering, Draft → Approve → Send lifecycle, payment tracking with derived PARTIALLY_PAID/PAID status). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.9** — approved 2026-08-05. Implements **Milestone 3 of the Version 1.0 completion plan**: **Notifications & Reminders** (Section 17, amended below — in-app channel only; Email/SMS/native-push explicitly deferred, no third-party provider credentials available and native mobile itself remains deferred), **Global Search** (Section 23, amended below — unified search across Clients, Cases, Documents, Contacts, and Advocates, RBAC-scoped per category, reusing Advanced Conflict Check's fuzzy-matching logic, plus per-user recent-search history), **Reports & Analytics** (Section 19, amended below — Case Summary, Financial, Matter Profitability, Staff Performance, Hearing Outcome, and Tag-Based reports, PDF/Excel export), and **Data Import & Export** (Section 25, amended below — Excel template download → upload → validation preview → confirm → commit bulk import for Clients/Matters/Contacts, restricted to Managing Partner/Office Staff; export via the Reports screen's existing pipeline plus a Client List report type). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.10** — approved 2026-08-05. Implements **Milestone 4 of the Version 1.0 completion plan — the final milestone, completing Version 1.0**: **Admin/Customization** (Section 24, amended below — Firm Profile, Office Announcements Composer with Managing-Partner-immediate-publish vs. Office-Staff-drafts-for-approval, and a Case-scoped Custom Fields builder), **Audit Log Viewer** (Section 24/29, amended below — a screen over the existing `AuditLog` table rather than a new data source, per the Section 29 standing convention, scoped firm-wide for the Managing Partner or to the actor's own actions for Accounts Team), **role-specific Dashboard sections** (Section 18, amended below — Advocate's today's-hearings, Office Staff's hearing overview plus admin task queue, Accounts Team's outstanding-invoices summary, all previously unbuilt despite being specified), **Session Management** completed (Section 9.4, amended below — self-revoke-one-of-my-other-sessions, previously missing alongside the already-existing view/force-logout-all), and **MFA** (Section 28, amended below — TOTP via an authenticator app, mandatory in the sense of a post-login setup nudge for Managing Partner/Accounts Team, not a hard route block, since blocking pre-enrollment would leave no way to reach the enrollment screen). Also delivered as part of this milestone's security-hardening scope: **pagination** on the four highest-traffic list endpoints (Cases, Clients, Case Documents, Case Tasks — response body stays a plain array for backward compatibility, with `X-Total-Count`/`X-Page`/`X-Page-Size` response headers carrying the metadata) and a **malware-scan engine upgrade** from a no-op stub to real EICAR-signature and executable-magic-byte detection (Section 28). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.11** — approved 2026-08-06. **Pre-deployment billing bug fix and payment-status completion** (Section 16.1, amended below), not a new milestone: fixes a real defect where a case with no unbilled time logs or expenses showed no way at all to create an invoice (the "Create Draft Invoice" card returned nothing rather than exposing the already-backend-supported manual/fixed-fee line-item path — root cause traced end-to-end from the UI down to the API, no backend defect involved), and completes the SRD's originally-specified "payment tracking (partial payments, due dates, **overdue alerts**)" line: a derived (not stored, matching the existing Task `OVERDUE` precedent) payment-status axis — Pending/Partially Paid/Paid/Overdue — surfaced as filter tabs and a badge on the Invoice List, Invoice Detail, Case Billing tab, and Dashboard's Outstanding Invoices widget, plus a due-date field on invoice creation (previously not exposed in the UI at all, so "overdue" could never have triggered for any invoice created through it). A genuine second bug — the invoice-creation API response omitting the new `paymentStatus` field, caught by a test written for this fix before commit — was corrected in the same pass. See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.12** — approved 2026-08-06. **Invoice module completed to production standard** (Section 16.1, amended below), plus an unrelated **Client Management optional-fields relaxation** (Section 11.2, amended below), both pre-deployment requests handled in the same pass: a dedicated `/invoices/new` Create Invoice screen supporting a case-less "general" invoice, tax/discount, notes/terms, and a live preview, alongside the existing Case Billing tab (left byte-for-byte unchanged — `Invoice.caseId` became nullable, additive only); a branded PDF invoice generator (firm logo/details, GST breakup, discount, a Payment Details section with bank details and a UPI "Scan to Pay" QR code sourced from a new Firm Billing Settings admin screen) with Download/Print/Share actions on the Invoice Detail screen; and, separately, `Client.type` (like email/phone/address before it) is now nullable — only Client Name is mandatory to create a client, with Type/Email/Phone/Address addable or clearable later via a new Edit Profile control on the Client Detail screen (previously edit-only-by-API, no UI existed). See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.13** — approved 2026-08-06. **Invoice PDF refinements** (Section 16.1, amended below), a client-readiness pass on the invoice PDF introduced in v1.12: the header now aligns the firm logo (left) with the firm name/address vertically centered against it; the heading reads **"INVOICE"** rather than "TAX INVOICE" (the firm is not GST-registered for output supplies in the sense the earlier heading implied — GST-inapplicability doesn't remove the GST/CGST/SGST breakup lines themselves, which stay conditional on a tax rate actually being entered per invoice); the invoice's internal payment-status (Pending/Paid/Overdue, etc.) is no longer printed on the client-facing PDF — that's an internal software concept, not something to hand a client; and the "Scan to Pay" QR code is now the firm's own uploaded payment QR image (JPG or PNG, managed alongside the existing bank details in Firm Billing Settings) rather than one dynamically generated from the UPI ID — the section is simply omitted from the PDF when no QR code has been uploaded. See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.14** — approved 2026-08-07. **Contacts integrated into the Client module, plus an independent sidebar scrollbar** (Section 12, amended below; Section 6.3/6.4, amended below), a UI/navigation-consolidation pass requested pre-deployment: the standalone Contacts item is removed from the top-level sidebar; the underlying `Contact` model, its API, the Recycle Bin entry, and Advanced Conflict Check integration are all unchanged. `Contact.clientId` (new, nullable) lets a contact optionally belong to one Client — a firm-wide directory of non-client people (Judges, Opposing Counsel, CAs, vendors — the original intent of Section 12) never had a Client relation before this pass, so most contacts still have none. Every Client now has a **Contacts tab** on the Client Detail screen (view/add/edit/delete, link/unlink matters — the first UI anywhere for editing a contact, previously API-only) scoped to that client's own `clientId`-linked contacts, with no duplication against the firm-wide list. The firm-wide directory (contacts with no client) relocates from top-level nav to **Admin Settings → Contact Directory** (`/admin/contacts`) — reachable by every role `CONTACTS.VIEW` already covered (Section 8's matrix is unchanged), just regrouped alongside the other admin-area screens rather than promoted to its own nav slot. Global Search's Contact results now route to the owning Client's Contacts tab when `clientId` is set, or the relocated firm-wide directory otherwise. Separately, and purely cosmetic: the sidebar now scrolls independently of the main content area (a CSS flexbox `min-height: 0` fix plus a fixed-height, non-scrolling `.app-shell` root) — previously, on any page taller than the viewport, the whole page including the sidebar scrolled together as one unit. See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.
- **v1.15** — approved 2026-08-07. **Contacts redesigned as an auto-synced Client-contact directory** (Section 12, amended below; Section 11.2/6.3/6.4/7, amended below) — direct Managing Partner correction of v1.14's design, delivered the same day: the standalone **Contacts** item returns to the top-level sidebar, but it no longer has any independent workflow for creating a client's own contact. Client is now the single source of truth for that information — creating or editing a Client automatically creates/updates a mirrored `Contact` row (`Contact.clientId` is now `@unique`, a true 1:1, populated *only* by that sync logic, never by hand), and the Contacts screen's default **Client Contacts** tab is a read-only directory (Contact Name/Client Name/Client Type/Mobile/Email/Address/Status) whose rows link straight to the owning Client's profile — there is no more per-client Contacts tab on Client Detail, since it only duplicated data already on the Profile tab. A soft-deleted Client's row disappears from the directory and reappears on restore automatically, via a live join to `Client.deletedAt` rather than a separately-maintained flag (nothing to fall out of sync); permanently deleting a Client cascades to remove its mirrored Contact row (`onDelete: Cascade`). Per a direct Managing Partner decision (two paths were possible — drop non-client contact tracking entirely, or keep it separate — the Managing Partner chose to keep it), a second **Other Contacts** tab preserves the original Section 12 firm-wide directory of non-client professional contacts (Judges, Opposing Counsel, CAs, vendors) with its full manual create/edit/delete/matter-link workflow, completely unchanged and still gated by `CONTACTS.CREATE/EDIT/DELETE` — a manually-created contact can never carry a `clientId`. Global Search's CONTACT category now only ever returns Other Contacts (a client's own name is already found via the CLIENT category, so returning it twice would be noise); Advanced Conflict Check's Contact-name matching is scoped the same way. Full text preserved at [SRD_v1.15.md](SRD_v1.15.md); superseded by this document.
- **v1.16** — approved 2026-08-11. **New Case creation form simplified to five optional fields** (Section 10.1, amended below), a direct Managing Partner correction of the Case-creation workflow: the New Case screen no longer asks for Practice Area, Jurisdiction, Case Stage, Opposite Party, Opposite Counsel, Filing Date, Description, Managing Partner, or Assigned Advocates — only **Case Title, Case No. (`courtCaseNumber`), Case Type, Court No. (new `Case.courtNumber` field, distinct from `Hearing.courtHall`), and Court Complex (`courtName`)**, all five genuinely optional (a case can be created with all five blank), plus the pre-existing Client and Client's Role selection, unchanged and still mandatory (the one business rule this pass explicitly carries forward, per direct instruction, rather than relaxing further). None of the removed fields' underlying data or database columns are deleted — they remain fully readable and, for Practice Area/Jurisdiction/Case Stage/Opposite Party/Opposite Counsel/Department/Description, still editable via the existing Case Detail "Edit Case Details"/"Edit Additional Details" panels, which this pass does not touch. `Case.partnerId` — a required, Managing-Partner-only field with its own business rule (Section 10.1) that has no place in a five-field whitelist and no natural default a blank form could imply — is no longer asked on this screen at all: it now auto-resolves server-side (self-assign if the creator is a Managing Partner, otherwise the firm's longest-active Managing Partner), remains reassignable afterward via the existing Case Reassignment control (Section 10.1), and this resolution logic itself is a Managing Partner decision (two paths were possible — surface the field regardless, or resolve it silently — the Managing Partner chose silent resolution) rather than an unreviewed implementation guess. `Case.title` and `Case.practiceArea` are now nullable at the schema level, matching the field's new optional status; every display site firm-wide (Case List, Case Detail, Dashboard, Hearing Calendar, Cause List, Task Detail, Invoice Detail, Global Search, Reports, Recycle Bin, invoice PDF) falls back gracefully — to the Matter Number where a title-like label is needed, to an em dash for a plain display field — rather than showing a blank or broken value. See [CHANGELOG.md](../CHANGELOG.md) for the full write-up.

---

## 1. Project Overview

Sourabh And Associates requires a centralized, enterprise-grade Law Firm Management Application to digitize and streamline the firm's core operations — case tracking, client relationships, document handling, task delegation, court hearing schedules, billing, internal/client communication, and reporting.

The application will serve as the single source of truth for the firm, replacing fragmented tracking via spreadsheets, physical case files, and manual reminders.

**Deployment model:** Built **API-first**, with one secure backend and shared cloud database serving three client applications:
- **Web Admin Portal** — primary interface for Managing Partner, Advocates (Associates/Junior Associates), Office Staff, and Accounts Team; optimized for document-heavy, desk-based work.
- **Android Mobile Application** — for Advocates on the move (hearings, tasks, chat, notifications) and Clients.
- **iPhone Mobile Application** — functional parity with the Android app, for the same user groups.

All three clients talk to the same backend and database, so a case updated on the Web Admin Portal is instantly reflected on mobile, and vice versa (full detail in Section 31 — Deployment Architecture).

**Primary users:** Managing Partner(s), Advocates (Associates and Junior Associates), Office Staff, Accounts Team, and Clients.

---

## 2. Business Objectives

1. **Centralize case data** — one authoritative digital record per matter, accessible from desktop or mobile.
2. **Improve accountability** — every task, document, message, and hearing update is attributed to a user and timestamped.
3. **Reduce missed deadlines** — automated reminders for hearing dates, filing deadlines, and client follow-ups, reaching users on mobile as well as web.
4. **Speed up billing cycles** — link billable hours/tasks directly to invoices.
5. **Enhance client trust and transparency** — give clients visibility into case status and a direct, secure line of communication with their advocate.
6. **Enable data-driven decisions** — role-specific live dashboards for Partners, Advocates, and Clients.
7. **Ensure compliance and confidentiality** — strict access control matching the hierarchical, privilege-sensitive nature of legal practice, including for chat and document approvals.
8. **Build a scalable foundation** — architecture supporting future growth: more users, more practice areas, a firm-wide knowledge base, office administration, and AI-assisted legal features.
9. **Enable mobility** — Advocates and Clients should be able to check status, chat, and receive alerts from a phone, not only from the office.

---

## 3. User Roles

### 3.1 Managing Partner
**Responsibilities:** Overall firm oversight, case allocation, final review of client communications and billing, strategic decision-making, access to firm-wide financial/performance data, final approver in the document approval workflow, posts office-wide announcements, sole holder of Recycle Bin permanent-delete/restore rights, sole owner of Custom Fields/Dropdowns/Practice Area configuration, sole owner of role defaults and individual permission overrides (Section 8a).
**Permissions:** Full read/write access to all cases, clients, documents, billing, reports, chat threads (oversight visibility), and audit logs. Can create/deactivate user accounts, assign roles, override task assignments, approve invoices, approve documents at the final internal stage, view any user's active sessions and **force logout across all devices**, permanently delete/restore records from the Recycle Bin, and grant/revoke any individual employee's permissions (Section 8a).

### 3.2 Advocate — Associate
**Responsibilities:** Manages assigned cases end-to-end, drafts documents, appears in hearings, delegates sub-tasks to Junior Advocates, communicates with clients via Client Chat, logs billable hours, acts as **Senior Advocate reviewer** in the document approval workflow for drafts prepared by Junior Advocates.
**Permissions:** Full read/write access to assigned cases and clients. Can upload/edit documents, review and approve/reject drafts submitted by Junior Advocates, create/assign tasks, update hearing outcomes, raise invoice drafts, and use both Internal Chat and Client Chat for their cases.

### 3.3 Advocate — Junior Associate
**Responsibilities:** Supports Associates with research, drafting, document preparation, case file updates; attends hearings under supervision; executes assigned tasks; submits drafted documents for Senior Advocate review as the first step of the document approval workflow.
**Permissions:** Read access to assigned cases only; write access limited to tasks, drafts, and documents explicitly assigned. Cannot approve or release documents, cannot manage billing, cannot assign tasks to others. Can use Internal Chat; no direct Client Chat access unless explicitly permitted by the supervising Associate.

### 3.4 Office Staff
**Responsibilities:** Administrative support — scheduling, data entry, filing, client intake coordination, hearing calendar maintenance; in future phases, manages attendance/leave records and posts holiday calendar updates.
**Permissions:** Can create client/case intake records (pending approval), update non-legal case metadata, manage the hearing calendar, upload scanned documents (triggering OCR), and use Internal Chat. No access to case strategy notes, billing details, document approval actions, or Client Chat.

### 3.5 Accounts Team
**Responsibilities:** Manages invoicing, payment tracking, expense recording, reconciliation, and financial reporting.
**Permissions:** Full read/write access to Billing & Invoicing and Expense Management across all cases/clients. Read-only access to case metadata needed for invoicing. Can use Internal Chat (billing-related threads). No access to case documents, document approval workflow, or Client Chat.

### 3.6 Client
**Responsibilities:** Views own case status via a unique **Client ID**, uploads requested documents, communicates with the assigned advocate via **Client Chat**, views and pays invoices, reviews/acknowledges documents routed to them as the final step of the approval workflow.
**Permissions:** Read-only access restricted to their own case(s): status/timeline, shared documents, upcoming hearing dates, invoices, and chat with assigned advocate. Logs in using their **Client ID** rather than an internally assigned staff account. No access to internal notes, strategy documents, other clients' data, Internal Chat, or the Contact Directory. Clients are not part of the Section 8a permission-override system — their access model stays as defined in this section.

---

## 4. Complete Feature List

- User authentication & role-based access control (RBAC), including Client ID–based login
- Persistent login/session management with secure token refresh (Section 9)
- Case creation, categorization, lifecycle tracking, and auto-generated internal Matter Number
- Client profile management with auto-generated unique Client ID
- Case-to-client linking (many-to-many)
- Contact Directory (opposite advocates, judges, experts, professionals)
- Document upload, versioning, tagging, secure storage, OCR-based text extraction, and automatic per-matter Digital File System folder structure
- Document Approval Workflow (Junior Advocate → Senior Advocate → Partner → Client)
- Task assignment and tracking
- Hearing calendar with conflict detection and external calendar sync (Google/Apple/Outlook)
- Automated reminders/notifications (email/SMS/in-app/push)
- Time tracking / billable hours logging
- Invoice generation, payment tracking, outstanding-dues reports
- Expense Management and per-matter profitability reports
- Advanced Conflict Check (clients, opposite parties, directors, partners, shareholders, companies)
- Internal notes & case history/timeline
- Matter tagging system
- Global Search across clients, matters, documents, OCR text, Knowledge Base, contacts, advocates
- Role-specific live Dashboards (Partner, Advocate, Client)
- Reports & analytics
- Internal Chat (Partner ↔ Advocates ↔ Staff ↔ Accounts, optionally case-linked)
- Client Chat (Client ↔ assigned Advocate, always case-linked)
- Client portal
- Knowledge Base (judgments, templates, agreements, notices, SOPs, checklists)
- Custom Fields, Custom Dropdowns, Custom Practice Areas (Managing Partner configurable, no-code)
- Data Import (Clients/Matters/Contacts from Excel) & Export (PDF/Excel/Word)
- Recycle Bin / soft-delete with Partner-only restore or permanent delete
- Audit logs for all sensitive actions
- Data backup & recovery
- Multi-branch/office support (future)
- **Database-driven Role & Permission Management console (Partner-only): role defaults + individual employee permission overrides (Section 8a)**
- Office Management (future): attendance, leave, employee records, announcements, holiday calendar
- Web Admin Portal + Android app + iOS app, all on one shared cloud backend

---

## 5. Module List

1. Authentication & User Management Module (incl. Client ID login)
2. Login & Session Management Module
3. Case Management Module (incl. Matter Number generation, Advanced Conflict Check, Tagging)
4. Client Management Module (incl. Client ID generation)
5. Contact Directory Module
6. Document Management Module (incl. OCR, Digital File System, Approval Workflow)
7. Task Management Module
8. Hearing Calendar Module (incl. external calendar sync)
9. Billing & Invoicing Module (incl. Expense Management)
10. Notifications & Reminders Module
11. Dashboard Module (role-specific)
12. Reports & Analytics Module
13. Communication & Messaging Module (Internal Chat + Client Chat)
14. Client Portal Module
15. Knowledge Base Module
16. Global Search Module
17. **Role & Permission Management Module (database-driven RBAC, role defaults + individual overrides — Section 8a)**
18. Admin, Settings & Customization Module
19. Data Import & Export Module
20. Audit Log & Security Module
21. Recycle Bin / Soft-Delete Module
22. Office Management Module (future — attendance, leave, employee records, holiday calendar)

---

## 6. Screen-by-Screen Flow

### 6.1 Common
- Login Screen — staff login (email/password) and Client login (Client ID); skipped entirely if a valid session/refresh token already exists on the device (Section 9)
- Dashboard (role-specific home — Section 18)
- Global Search Bar (Section 23) — spans clients, matters, documents, OCR text, Knowledge Base, contacts, advocates
- Notification Center
- Chat icon/badge (unread count) in the global header

### 6.2 Case Management Flow
1. Case List Screen (filterable by status, practice area, tag, assigned advocate)
2. Case Detail Screen — tabs: Overview | Documents (folder tree) | Tasks | Hearings | Billing/Expenses | Timeline/Notes | Chat
3. New Case Creation Wizard — client selection/creation → conflict check → case type/tags → auto-generated Matter Number → assign advocate → initial details → auto-created document folder structure
4. Case Closure/Archival Screen

### 6.3 Client Management Flow
1. Client List Screen (shows Client ID column)
2. Client Detail Screen — single Profile view (client info, linked cases, documents, invoices, chat) *(v1.15: the brief v1.14 Contacts tab is gone — creating/editing a client here automatically keeps its entry on the Contacts module's Client Contacts tab in sync, Section 6.4, with no action on this screen)*
3. New Client Intake Form (conflict-check prompt; Client ID auto-generated and displayed on save, with option to send login credentials)

### 6.4 Contact Directory Flow
*(v1.15: back on the top-level sidebar as "Contacts," tabbed — Client Contacts (default) and Other Contacts.)*
1. **Client Contacts tab** — read-only directory auto-synced from the Client module (Contact Name/Client Name/Client Type/Mobile/Email/Address/Status); a row links straight to that Client's profile, which is the only place to change it
2. **Other Contacts tab** — the original Section 12 firm-wide directory of non-client professional contacts (Opposite Advocate/Judge/CA/CS/Expert/Govt Dept/Other), with its own List/Detail screens (create/edit/delete, linked matters, notes) unchanged from v1.7

### 6.5 Document Management Flow
1. Document Repository (per matter) — auto-generated folder tree (Pleadings/Orders/Evidence/Client Documents/Agreements/Billing/Notes), OCR status indicator
2. Upload Screen — metadata tagging, folder placement; OCR runs automatically post-upload
3. Document Preview/Version History Screen — includes extracted-text view for OCR'd files
4. Document Approval Screen — shows current stage (Draft → Senior Review → Partner Approval → Client Review), approver comments, role-scoped action buttons

### 6.6 Task Management Flow
1. My Tasks Screen
2. Task Creation/Assignment Screen
3. Task Detail/Status Update Screen
4. Team Task Board (Kanban)

### 6.7 Hearing Calendar Flow
1. Calendar View (month/week/day)
2. Hearing Detail Screen
3. Add/Reschedule Hearing Screen
4. Calendar Sync Settings (enable/disable Google/Apple/Outlook sync per user)

### 6.8 Billing & Expense Flow
1. Time Log Entry Screen
2. Expense Entry Screen (category, amount, receipt, billable-to-client flag)
3. Invoice Draft Screen
4. Invoice Approval Screen (Partner)
5. Invoice List & Payment Status Screen
6. Matter Profitability Report Screen
7. Client-facing Invoice View

### 6.9 Communication Flow
1. Internal Chat — Threads List (direct + case-linked group threads) → Thread View → optional "Attach to Case" tag
2. Client Chat — Client-side: single thread per case with assigned advocate → Thread View with attachments
3. Advocate-side unified inbox (Internal + Client Chat), filterable by case

### 6.10 Dashboard Flow
- Managing Partner Dashboard (Section 18.1)
- Advocate Dashboard (Section 18.2)
- Client Dashboard (Section 18.3)
- Office Staff / Accounts Team Dashboards (Section 18.4)

### 6.11 Reports & Analytics Flow
1. Report Selection Screen
2. Report Viewer (filters, export to PDF/Excel/Word)

### 6.12 Client Portal Flow
1. Client Login via Client ID → Client Dashboard
2. Case Status / Timeline View
3. Document Exchange Screen (incl. documents awaiting client approval-stage review)
4. Invoice & Payment View
5. Chat with Assigned Advocate

### 6.13 Knowledge Base Flow
1. Knowledge Base Home — categories: Judgments, Templates, Agreements, Notices, SOPs, Checklists
2. Search/Filter Screen
3. Item Detail/Preview Screen with version history
4. Upload/Contribute Screen (role-restricted)

### 6.14 Global Search Flow
1. Search results screen grouped by entity type (clients, matters, documents, contacts, Knowledge Base, advocates), role-aware filtering

### 6.15 Admin/Settings Flow
1. User Management Screen
2. **Role & Permission Management Screen** — role-default matrix (editable) + per-employee override panel (Section 8a)
3. Firm Profile & Practice Area Configuration
4. Custom Field / Dropdown Builder
5. Office Announcements Composer (Partner/Office Staff)
6. Audit Log Viewer (incl. permission-change history — Section 8a)
7. Recycle Bin Screen (Partner-only — restore / permanently delete)
8. Data Import Screen (template download → upload → validation preview → commit) and Export controls

### 6.16 Mobile-Specific Flows (Android/iOS)
1. Simplified Dashboard (widget-based, matching web dashboard's key metrics)
2. Push-notification deep links
3. Chat (Internal + Client) as a primary bottom-nav tab
4. Camera-based document capture → direct upload → OCR pipeline
5. Biometric/PIN app-lock screen on launch

---

## 7. Database Design

*(Descriptive entity model — no SQL.)*

### Core Entities
- **User** — id, name, email, phone, role, status, date joined.
- **Permission** — id, key (e.g. `VIEW_ALL_CASES`, `CREATE_CASES`, `DELETE_CASES`), label, module. An extensible catalog — each module registers its own permission keys rather than this being a closed list (Section 8a).
- **RolePermission** — role, permission id, granted flag. The **default** permission set for each of the five roles, seeded to exactly match the Section 8 matrix. Managing-Partner-editable (Section 8a).
- **UserPermissionOverride** — id, user id, permission id, effect (grant/revoke), set-by, set-at, reason. A per-employee exception that takes precedence over their role's `RolePermission` default for that one permission (Section 8a).
- **UserSession** — id, user id, device info, refresh-token reference/hash, created-at, last-active-at, status (active/revoked), revoked-reason (user-logout/admin-forced/password-change/account-disabled).
- **Client** — id, **Client ID** (unique, `SA-CLI-000001` format, sequential), name/company, type, contact details, onboarding date, conflict-check status, login credentials linked to Client ID.
- **Case/Matter** — id, court case number, **Matter Number** (unique, `SA-MAT-2026-0001` format), title (Cause Title), practice area, case type, tags, status (fixed lifecycle, Section 8), **stage** (configurable litigation stage, Section 10.1 — distinct from status), description, opposite counsel, opposite party, department, filing date, assigned Partner, assigned Advocate(s), court/jurisdiction. *(Case type, opposite counsel, opposite party, department, description, and stage added in v1.2.)*
- **PicklistValue** — id, category (`COURT`/`JUDGE`/`CASE_STAGE`/`PRACTICE_AREA`/`CASE_TYPE`/`OPPOSITE_COUNSEL`/`OPPOSITE_PARTY`/`DEPARTMENT`/`HEARING_PURPOSE`, extensible), value, active flag. *(New in v1.2.)* The data store behind Section 24's "Custom Dropdowns" — one reusable table rather than one per category, so a new category needs no schema change. Only the Managing Partner can add/rename/deactivate a value (Section 24); every other role picks from the existing list, keeping spelling/terminology consistent firm-wide (Global Search, Reports, and Tagging all benefit from this consistency).
- **CaseClient (mapping)** — Case ↔ Client, with party role (plaintiff/defendant/etc.).
- **Contact** — id, name, category (Opposite Advocate/Judge/CA/CS/Expert/Govt Dept/Other), organization, designation, contact details, notes, linked matter ids (many-to-many), **client id** *(v1.15, unique/nullable)* — a true one-to-one with Client, populated only by the Client-sync logic (never manually): set means this row is an auto-synced mirror of that Client's own contact info (Contacts module's Client Contacts tab); null means this is a manually-managed, non-client contact (Contacts module's Other Contacts tab).
- **FileNode** — id, matter id, parent folder id (self-referencing), name, type (folder/file), linked Document id, system-default flag.
- **Document** — id, case id, folder (FileNode) id, uploaded-by, storage path, type/category, version, confidentiality flag, upload timestamp, OCR status, OCR extracted text (indexed), current approval stage.
- **DocumentApproval** — id, document id, stage (Draft/Senior Review/Partner Approval/Client Review/Finalized), current approver, decision, comments, timestamp.
- **Task** — id, case id, assigned-to, assigned-by, title, description, priority, due date, status, completed-at (set/cleared with the status transition — new in v1.2, backs Employee Task Audit's on-time stats, Section 18.1/19). Reassigning `assigned-to` is a normal update, not a separate workflow — the assignee can change at any time, and every reassignment (who, from whom, to whom, when) is captured in the Audit Log (Section 29).
- **Hearing** — id, case id, date/time, court, judge, purpose, outcome/notes, status (Scheduled/Completed). **Clarified in v1.2:** a case has **at most one Scheduled hearing at a time** — scheduling is rejected while one is already upcoming; instead that hearing is *rescheduled* (its date/details updated in place, same row, no duplicate created). Recording an outcome marks the row Completed and, if a next date is given, creates the new Scheduled row for it. "Previous Hearing" = the case's most recent Completed hearing; "Next Hearing" = its current Scheduled hearing (guaranteed unique by the rule above) — both derived, not separately stored, so they can never drift out of sync with the underlying rows.
- **CalendarSyncSetting** — user id, provider (Google/Apple/Outlook), connection/OAuth token reference, enabled flag, last-synced timestamp.
- **TimeLog** — id, case id, user id, task id (optional), date, hours, billable flag, description.
- **Expense** — id, matter id, category, amount, date, incurred-by, billable-to-client flag, receipt reference.
- **Invoice** / **Payment** — as billing entities linked to Client/Case and TimeLogs/Expenses.
- **ConflictCheckLog** — id, triggering matter/client id, matched entity type & id, match confidence, resolution, overridden-by, reason, timestamp.
- **Tag** / **MatterTag (mapping)** — many-to-many.
- **Notification** — id, user id, type, message, read status, timestamp, related-entity reference.
- **CaseTimeline/Note** — id, case id, author, note text, timestamp, visibility.
- **ChatThread** — id, type (internal/client), linked case id (optional/mandatory), participants, created timestamp, archived flag.
- **ChatMessage** — id, thread id, sender, message text, attachment reference, timestamp, read receipts.
- **KnowledgeBaseItem** — id, category, title, storage path, OCR text, tags, version, uploaded-by, visibility scope.
- **Announcement** — id, title, body, posted-by, audience scope, publish/expiry dates.
- **CustomFieldDefinition** — id, target entity, field name, type, options, required flag, active flag.
- **ImportExportLog** — id, user id, operation, entity type, file reference, row counts, timestamp.
- **AuditLog** — id, user id, action type, affected entity type & id, timestamp, IP/device metadata.
- **FirmSettings** — firm profile, practice areas, office/branch details, ID/numbering format configuration.
- **Soft-delete fields** (`is_deleted`, `deleted_at`, `deleted_by`) applied across all major entities for the Recycle Bin (Section 27), rather than a separate physical table per type.

### Future/Office Management Entities (Phase 6)
- **Employee** (extends User), **AttendanceRecord**, **LeaveRequest**, **HolidayCalendarEntry**.

### Key Relationships
- Client ↔ Case: many-to-many (via CaseClient); Client carries a unique Client ID for authentication.
- Case ↔ Document/Task/Hearing/TimeLog/Expense/Note/ChatThread/FileNode: one-to-many.
- Document ↔ DocumentApproval: one-to-many (full approval history).
- ChatThread ↔ ChatMessage: one-to-many; ChatThread ↔ Case: optional (internal) / mandatory (client).
- User ↔ RolePermission: many (via shared role) ↔ many (via Permission); User ↔ UserPermissionOverride: one-to-many (Section 8a); User ↔ UserSession: one-to-many.
- Invoice ↔ TimeLog/Expense/Payment: as described.
- KnowledgeBaseItem, Announcement: firm-wide entities, not tied to a single case. Contact is firm-wide (Other Contacts) by default; a Contact with `clientId` set *(v1.15, one-to-one, Client ↔ Contact)* is instead an auto-synced mirror of that Client's own info, not an independent record.
- Every major entity ↔ AuditLog: one-to-many, including every `RolePermission`/`UserPermissionOverride` change.

---

## 8. Roles & Permission Matrix

**As of Section 8a, this table is the seeded *default* for each role, not an unconfigurable ceiling.** The Managing Partner can edit a role's defaults or override an individual employee's permissions; what follows is the baseline every role starts with and returns to if an override is later removed.

| Module / Action | Managing Partner | Advocate (Associate) | Advocate (Junior) | Office Staff | Accounts Team | Client |
|---|---|---|---|---|---|---|
| View all cases | ✅ | ❌ (assigned only) | ❌ (assigned only) | ✅ (metadata only) | ❌ (billing-linked only) | ❌ (own only) |
| Create/close case (incl. Matter Number) | ✅ | ✅ (assigned) | ❌ | ➖ (intake draft only) | ❌ | ❌ |
| Generate/view Client ID | ✅ | ➖ (view only) | ❌ | ✅ (create, on intake) | ❌ | ➖ (own ID only) |
| Upload/edit documents | ✅ | ✅ | ✅ (assigned) | ✅ (scans, triggers OCR) | ❌ | ✅ (own uploads) |
| Submit / review / approve documents | ✅ (final) | ✅ (senior review + draft) | ✅ (submit only) | ❌ | ❌ | ✅ (acknowledge only) |
| Create/assign tasks | ✅ | ✅ | ❌ (execute only) | ➖ (admin tasks) | ❌ | ❌ |
| Manage hearing calendar | ✅ | ✅ (own cases) | ➖ (view + outcome) | ✅ | ❌ | ❌ (view only) |
| Log billable hours / expenses | ✅ | ✅ | ✅ | ❌ | ✅ (expenses) | ❌ |
| Create/edit/approve invoices | ✅ (approve) | ➖ (draft only) | ❌ | ❌ | ✅ | ❌ |
| View/pay invoices | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (own only) |
| Internal Chat | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Client Chat | ✅ (oversight) | ✅ (assigned cases) | ➖ (if permitted) | ❌ | ❌ | ✅ (assigned advocate only) |
| Contact Directory — view/manage | ✅ | ✅ | ✅ | ✅ | ➖ (view only) | ❌ |
| Knowledge Base — view / publish | ✅ / ✅ | ✅ / ➖ (templates) | ✅ / ❌ | ➖ (SOPs) / ❌ | ➖ (billing SOPs) / ❌ | ❌ / ❌ |
| Custom Fields/Dropdowns/Practice Areas | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Data Import / Export | ✅ | ➖ (export own scope) | ➖ (export own scope) | ✅ (import, w/ approval) | ➖ (export own scope) | ❌ |
| Recycle Bin restore / permanent delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Force logout (all devices) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Post office announcements | ✅ | ❌ | ❌ | ➖ (draft only) | ❌ | ❌ |
| Firm-wide financial reports | ✅ | ❌ | ❌ | ❌ | ➖ (billing reports) | ❌ |
| User & role management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ | ❌ | ➖ (own actions) | ❌ |

**Legend:** ✅ Full access · ➖ Partial/conditional access · ❌ No access

---

## 8a. Configurable Permissions

*(New in v1.1.)*

### 8a.1 Model
Every permission check resolves an **effective permission** for (user, action):
1. If a `UserPermissionOverride` exists for that user and permission, its effect (grant/revoke) wins.
2. Otherwise, fall back to the user's role's `RolePermission` default (Section 8's matrix, as seeded).

This is evaluated **server-side on every request** — never inferred from what the UI happens to show, consistent with Section 28's "never trust client-side hiding alone."

### 8a.2 Permission Catalog
Extensible, not closed — a new module registers its own permission keys as it's built, rather than this list being exhaustive up front. At minimum, one key per row of the Section 8 matrix, plus the module-wise CRUD granularity the Managing Partner needs day to day:
`VIEW_ALL_CASES`, `VIEW_ASSIGNED_CASES`, `CREATE_CASES`, `EDIT_CASES`, `DELETE_CASES`, `VIEW_CLIENTS`, `CREATE_CLIENTS`, `EDIT_CLIENTS`, `DELETE_CLIENTS`, `MANAGE_DOCUMENTS`, `APPROVE_DOCUMENTS`, `MANAGE_TASKS`, `MANAGE_HEARINGS`, `MANAGE_BILLING`, `VIEW_REPORTS`, `EXPORT_REPORTS`, `VIEW_DASHBOARD`, `MANAGE_CALENDAR`, `MANAGE_USERS`, `MANAGE_SETTINGS`, `MANAGE_RECYCLE_BIN`, `VIEW_AUDIT_LOG`.

### 8a.3 Role & Permission Management Screen (Managing Partner only)
- **Role Defaults tab** — the Section 8 matrix, rendered editable: toggling a cell changes that role's default for everyone who doesn't have an individual override on that permission. A search box filters the matrix by permission key, label, or module. A core-admin permission (Section 8a.5) on the Managing Partner column renders as a visibly locked, disabled cell, not an editable one.
- **Employee Overrides tab** — a search box filters the firm's staff directory by name or role; picking an employee shows their effective permissions (role default + any overrides highlighted), with **Grant**/**Revoke** actions that open a small dialog requiring a reason before the change is saved, and a **Remove** action on any permission that already has an override (reverting it to the role default). A **Reset to Role Defaults** action bulk-removes every override for the selected employee in one confirmed step.
- **Permission Summary tab** *(added during implementation, not in the original v1.1 text)* — the same employee-search-then-view flow as Employee Overrides, but read-only: for the selected employee, every permission's role default, override (if any, with its reason/who/when), and merged effective grant, with no edit controls. Exists as its own tab because "what can this person do and why" is a distinct, at-a-glance question from "manage this person's overrides," even though both read from the same underlying data.

### 8a.4 Guarantees
- **No behavior change on adoption.** `RolePermission` is seeded to exactly reproduce the Section 8 matrix — every existing user's effective permissions are identical the moment this ships, until the Managing Partner actively changes something.
- **Every change is audited** — role-default edits and individual overrides both write to the Audit Log (Section 29): who changed what, for whom, from what, to what, when, and why (reason field on overrides).
- **Clients are out of scope** — Section 3.6's access model is fixed and does not participate in this override system.

### 8a.5 Managing Partner Safety *(added in v1.5, per the implementation)*
A designated subset of permissions — the ability to manage users, manage permissions, manage firm settings, restore or permanently delete a record from the Recycle Bin, and view the audit log — can never be fully removed from the Managing Partner role, and can never be revoked from an individual Managing Partner by override:
- The Managing Partner role's own default for any of these permissions can never be turned off, through the Role Defaults screen or any other path.
- An individual override can never revoke one of these permissions from a user whose role is Managing Partner (an override may still *grant* one of these permissions to a non-Managing-Partner employee, and that grant can later be removed normally).
- Deactivating a staff account is rejected if it would leave zero active Managing Partner accounts.
- No sequence of configuration changes or account actions can ever leave the firm without at least one Managing Partner who can manage users, manage permissions, manage settings, work the Recycle Bin, and view the audit log.

---

## 9. Login & Session Management

### 9.1 Principle
Users authenticate **once per device**. After that, opening the app goes straight to the role-specific Dashboard — no repeated login prompts — until an explicit session-ending condition occurs.

### 9.2 Session Persistence
- On login, the backend issues a short-lived **access token** plus a long-lived **refresh token**, bound to the device.
- Access tokens refresh silently in the background before expiry.
- Refresh tokens renew automatically on each use, so a regularly-used device effectively stays logged in permanently.
- Tokens stored via platform-appropriate secure storage (Keychain/Keystore/secure web storage), never plain local storage.

### 9.3 Session Termination Triggers
Only ends on: (1) explicit logout (that device only), (2) Managing Partner disables the account, (3) password change (invalidates all sessions firm-wide), (4) explicit session revocation (self, or Partner force-logout).

### 9.4 Device & Session Management
- Every login creates a Session/Device record (device type, OS, app version, login/last-active time, status).
- Users can view their own sessions and log out of the current device.
- Managing Partner can view any user's sessions and force logout from all devices — revoking every refresh token for that user immediately.

**Completed in v1.10 (Milestone 4).** The one gap against this section's text — a user revoking a *specific one* of their own other sessions (distinct from the plain logout, which only ever ends the current device's session) — is now implemented: `POST /api/auth/sessions/:sessionId/revoke`, scoped by an ownership check (`session.userId === actor.sub`, else 403) so it can never be used to end someone else's session. The Managing-Partner "view any user's sessions" and "force logout from all devices" behaviors already existed and are unchanged. A single **Sessions** screen (`/account/sessions`) surfaces both: every user's own session list with a per-session Revoke button, plus — Managing Partner only, gated by a new `SESSIONS.VIEW_ANY` permission — a staff picker to view any user's sessions and force-logout all of their devices.

### 9.5 Biometric Unlock (Future Enhancement)
Fingerprint/Face ID gates local access to an already-valid session on mobile; it never substitutes for backend authentication and does not renew or create a session. If the underlying session is revoked, biometric unlock fails and falls back to full login.

---

## 10. Case Management Module

### 10.1 Core
- Court case number **and** a distinct internal **Matter Number** (`SA-MAT-2026-0001` — prefix + year + sequence), assigned the moment a case is created, independent of and never overwritten by the court case number.
- Case categorization by practice area (configurable, Section 24) and **case type** (configurable, Section 24 — new in v1.2)
- Status lifecycle: Intake → Active → Adjourned/On-Hold → Closed → Archived
- **Case Stage** *(new in v1.2)* — a separate, Managing-Partner-configurable litigation-stage field (Section 24's Custom Dropdowns), distinct from the fixed lifecycle Status above. Seeded with: New, Pending, Under Trial, Evidence, Arguments, Reserved for Orders, Judgment Delivered, Closed — the list remains editable.
- **Opposite Counsel, Opposite Party, Department, and a free-text Description** *(new in v1.2)* — each Case attribute, with Opposite Counsel/Opposite Party/Department drawn from the same configurable-dropdown system as Court/Judge/Case Stage (Section 24) to keep spellings consistent.
- Assignment of Partner (oversight) + one or more Advocates (execution)
- Linked entities in one place: clients, opposing parties, documents (with approval status and auto-generated folder tree), tasks, hearings, billing/expenses, timeline, case-linked chat threads
- **Case Overview screen** *(new in v1.2, formalized as the canonical detail-screen pattern in v1.3)* shows Case Number, Cause Title, Court Name, Case Stage, Practice Area, Case Type, Jurisdiction, a **Hearing Timeline** sub-section (Previous Hearing and the current Next Hearing prominently, with the full Hearing History available on demand — v1.3), Litigation Team & Parties (Managing Partner, Advocates, Clients, Opposite Counsel, Opposite Party, Department), and Description — together on one professionally laid-out screen, without needing to open a separate tab for each. This is the reference pattern for any future primary detail screen the app adds (Section 24).
- Bulk filtering/search by Matter Number, court case number, client name/Client ID, status, practice area, tag, assigned advocate, court
- **Case reassignment workflow (Partner-only) with audit trail** *(implemented in v1.7 — Milestone 1)*: `PATCH /api/cases/:id/reassign`, gated by the `CASES.REASSIGN` permission (Managing-Partner-only default), changes `Case.partnerId` and writes a `CASE_REASSIGNED` Audit Log entry (old partner name → new partner name). Distinct from adding/removing Advocates, which was already supported.
- **New Case creation screen simplified to five optional fields** *(v1.16)* — a direct Managing Partner correction narrowing the creation screen (not the Case entity, and not the Case Detail/Edit screens) to exactly **Case Title, Case No. (`courtCaseNumber`), Case Type, Court No. (new `Case.courtNumber`, distinct from `Hearing.courtHall`), and Court Complex (`courtName`)**, all five genuinely optional, plus the pre-existing mandatory Client and Client's Role selection. Every other field this section lists above (Practice Area, Case Stage, Opposite Counsel, Opposite Party, Department, Description, Jurisdiction, Filing Date) is no longer asked at creation but is unchanged everywhere else — still stored, still shown on the Case Overview screen, still editable from the existing "Edit Case Details"/"Edit Additional Details" panels. `Case.title` and `Case.practiceArea` are now nullable (previously required); every reader of these fields firm-wide falls back to the Matter Number (title-like contexts) or an em dash (plain display) rather than showing blank. `Case.partnerId` keeps its existing required, Managing-Partner-only business rule but is no longer a form field: it auto-resolves server-side at creation (self-assign if the creator is a Managing Partner, otherwise the firm's longest-active Managing Partner) and remains changeable afterward only via the Case Reassignment workflow immediately above.

### 10.2 Advanced Conflict Check
At new-matter or new-client creation, cross-checks entered names against the firm's entire history of **Client Names, Opposite Parties, Directors, Partners, Shareholders, and Company Names** (via Client Management, Contact Directory, and past Case records), using fuzzy/partial matching. A possible match blocks silent creation and shows a warning listing matching records and the matter(s) they appeared in, requiring explicit Partner acknowledgment/override with a mandatory logged reason (`ConflictCheckLog`).

**Implemented in v1.7 (Milestone 1):** runs at **Client and Contact creation** — the two points where a genuinely new name enters the system (Case creation always selects an existing Client and existing Opposite Party/Opposite Counsel Picklist values, so there's no new name to check there). Checks the entered name against existing **Client names, Contact names, and already-used Opposite Party/Opposite Counsel Picklist values** — the entities this application actually tracks; Director/Partner/Shareholder/Company-Name records named in this section's narrative are not a separately tracked entity anywhere in the schema, so they're not part of the checked set. Fuzzy matching is a dependency-free normalized-Levenshtein-distance + substring-containment check (HIGH confidence ≈ exact-after-normalization, MEDIUM confidence for a partial/typo-level match) — adequate for a single firm's record volume, not a full NLP/phonetic-matching engine. A match blocks creation with a 409 and the match list; only the **Managing Partner** may acknowledge/override (matching this section's own "explicit Partner acknowledgment" wording) with a mandatory reason, logged to `ConflictCheckLog`. A non-Partner actor who hits a conflict is blocked outright and must escalate.

### 10.3 Tagging System
Every Matter supports multiple tags (GST, Income Tax, NCLT, Arbitration, Property, Civil, Consumer, Company Law, etc.), distinct from the single practice-area classification. Tags are drawn from a firm-managed list (extendable via Custom Dropdowns, Section 24) and feed Global Search (Section 23), Reports (Section 19), and Dashboards (Section 18).

**Implemented in v1.7 (Milestone 1):** the tag vocabulary is a Picklist category (`TAG`, Section 24's standing convention — reusing the existing system rather than a new Custom-Dropdown mechanism), and a new `CaseTag` join table (`caseId`, `tag`) links a case to any number of tag values. Managed from the Case Overview screen (add/remove chips) and filterable on the Case List (`GET /api/cases?tag=...`). Global Search/Reports/Dashboards feeding from tags remains future work (Milestone 3 — see TODO.md), since those modules don't exist yet.

---

## 11. Client Management Module

### 11.1 Client ID
Every client record receives a **unique, system-generated Client ID** on creation (`SA-CLI-000001`, sequential, never reused). It doubles as the client's login identifier for the Client Portal/mobile app (paired with a password and optional OTP/MFA), issued at onboarding, and is immutable and persistent across all of the client's matters.

### 11.2 Other Features
- Client types: Individual / Company / Government Entity / Trust
- Profile: Client ID, contact persons, address, phone/email, PAN/GST, onboarding date, KYC references
- Linked cases view (by Matter Number)
- Conflict-check on intake (Section 10.2)
- Client status: Active / Inactive / Blacklisted
- Document sharing history, invoice/payment history, and chat history per client

**Client Type made optional in v1.12 (2026-08-06, pre-deployment).** Client Type, Email, Phone, and Address are all now genuinely optional at creation — **Client Name is the only mandatory field** on the New Client screen and its API. Email/Phone/Address were already nullable (`Client.email`/`phone`/`address` were `String?` since Phase 1); `Client.type` was the one holdout still declared `String` (non-null) despite already being free-text-validated via the `CLIENT_TYPE` Picklist (Section 24) rather than a fixed enum, so it's relaxed to `String?` to match. A blank/whitespace-only value for any of these four fields is normalized to `NULL` (not stored as an empty string), so every consumer only ever has to check for one falsy shape. The Client Detail screen gained an **Edit Profile** control (`CLIENTS.EDIT`, previously only reachable via direct API call — no UI existed) so Type/Email/Phone/Address can be filled in, changed, or cleared back to blank at any point after creation; submitting a field blank on edit explicitly clears it, while omitting a field from the request leaves it untouched. The bulk Data Import template (Section 25) matches — a Clients row with a blank Type column is no longer flagged as invalid. Every screen displaying these fields (Client List, Client Detail, the Client List report export) already rendered `email`/`phone`/`address` gracefully as "—" when null; the one place assuming `type` was always present (the Client List report's export row, Section 19) was updated to match.

**Contacts tab added in v1.14, removed again in v1.15.** v1.14 briefly tabbed this screen (Profile/Contacts) with a per-client contact editor; the Managing Partner's same-day correction (Section 12) made Client the sole place a client's contact info is ever entered or edited, so that second tab only ever duplicated the Profile fields above and is gone — this screen is a single Profile view again. **v1.15:** every create (`POST /clients`) and edit (`PATCH /clients/:id`) automatically creates/updates a mirrored, read-only entry on the Contacts module's Client Contacts tab (`contacts.service.ts`'s `syncClientContact`) — genuinely no separate action, and nothing on this screen changed to make it happen. See Section 12 for the full Contact-side detail.

---

## 12. Contact Directory Module

Single searchable directory for everyone the firm deals with outside its own staff and clients: **Opposite Advocates, Judges, Chartered Accountants, Company Secretaries, Experts, Government Departments, and other professional contacts.** Clients are cross-referenced from Client Management, not duplicated.
- Each record: name, category, organization, designation, contact details, associated matters, notes.
- Feeds Global Search (Section 23) and Advanced Conflict Check (Section 10.2).
- Permissions: viewable by all internal roles; create/edit by Advocates and Staff; no Client access.

**Implemented in v1.7 (Milestone 1):** `Contact` model (name, category — Picklist-backed `CONTACT_CATEGORY` — organization, designation, email, phone, notes) plus a `ContactMatter` many-to-many join to `Case` (linked matters, addable/removable from the Contact Detail screen). Soft-deletable — Contact is the fifth entity added to the Recycle Bin's switch-based-per-entity architecture (Section 27), following the exact extension path that section's implementation note already predicted. Permissions match this section's matrix row exactly: `CONTACTS.VIEW` (all internal roles, including Accounts Team view-only), `CONTACTS.CREATE`/`EDIT` (Managing Partner, Associate, Junior Associate, Office Staff — not Accounts Team), `CONTACTS.DELETE` (Managing Partner, Associate, Office Staff), `CONTACTS.RESTORE`/`PERMANENT_DELETE` (Managing Partner only, core-admin). Global Search integration remains future work (Milestone 3) since that module doesn't exist yet.

**Integrated into the Client module in v1.14 (superseded by v1.15 below):** a first attempt added an optional `Contact.clientId` and a per-Client Contacts tab with its own manual add/edit workflow. The Managing Partner reviewed this the same day and corrected the design — see the v1.15 entry immediately below, which is what the application actually implements.

**Redesigned in v1.15 as an auto-synced Client-contact directory, plus a separately-managed Other Contacts list.** Client is the single source of truth for a client's own contact information — there is no independent workflow anywhere for creating or editing a *client's* contact entry. `Contact.clientId` is now `@unique` (a true one-to-one with `Client`, not the v1.14 one-to-many) and is populated **only** by `clients.service.ts`'s `syncClientContact`, called automatically inside `createClient` and `updateClient`: creating a Client creates its mirrored Contact row in the same request, no separate action required; editing a Client's name/email/phone re-syncs that same row so the two can never drift apart. A soft-deleted Client's row is excluded from the directory by a live join to `Client.deletedAt` (not a separately-maintained soft-delete flag on the Contact itself — so restoring the Client from the Recycle Bin makes it reappear with no extra code path to get right), and permanently deleting a Client cascades (`onDelete: Cascade`) to remove its Contact row, since a Client-less mirror row would be meaningless.

The standalone **Contacts** sidebar item returns to the top level (undoing v1.14's relocation under Admin Settings), now showing two tabs:
- **Client Contacts** (default) — the auto-synced directory described above, read-only, columns Contact Name / Client Name / Client Type / Mobile / Email / Address / Status (the latter three read live from the joined Client, never duplicated onto Contact), each row linking straight to that Client's profile (`GET /contacts/client-directory`).
- **Other Contacts** — this section's original scope (Judges, Opposing Counsel, CAs, vendors — everyone who is explicitly *not* a client), with the full manual create/edit/delete/matter-link workflow from v1.7, completely unchanged and still gated by `CONTACTS.CREATE`/`EDIT`/`DELETE`. `POST /contacts` never accepts a `clientId`; `PATCH`/`DELETE /contacts/:id` and matter-link/unlink reject (400) any attempt to target a client-linked row directly — those are strictly system-managed.

The Client Detail screen's brief v1.14 Contacts tab is removed; Client Detail is a single Profile view again (Section 11.2), since the tab only ever duplicated data already shown there. Global Search's CONTACT category and Advanced Conflict Check's Contact-name matching both now exclude client-linked rows — a client's own name is already covered by the CLIENT category/Client matching, so including the mirrored Contact too would just be a duplicate hit. All permissions (`CONTACTS.VIEW`/`CREATE`/`EDIT`/`DELETE`/`RESTORE`/`PERMANENT_DELETE`) and the Recycle Bin entry are unchanged — they now govern Other Contacts exclusively, since a client-linked Contact is never independently soft-deleted/restored/permanently-deleted (its lifecycle is entirely the Client's).

---

## 13. Document Management Module

### 13.1 Core Document Handling
- Per-matter folder structure with tagging (Pleadings, Orders, Evidence, Client Documents, Agreements, Billing, Notes)
- Version control — every re-upload creates a new version, prior versions retained
- Confidentiality flagging: Internal-only vs Client-visible
- Access restricted by role and case assignment
- Audit trail of views, downloads, edits, and approval actions
- Encrypted storage; common formats (PDF, DOCX, images, scans)

### 13.2 Digital File System
Every Matter automatically receives its folder structure the moment its Matter Number is created — **Pleadings, Orders, Evidence, Client Documents, Agreements, Billing, Notes** (default set configurable per practice area, Section 24). No manual setup by advocates. The Case Detail → Documents tab renders as an expandable tree (Client → Matter → sub-folders). Standard folders are protected from deletion/rename except by the Managing Partner.

### 13.3 OCR
All uploaded PDFs and scanned images — court orders, agreements, sale deeds, notices — automatically pass through an OCR pipeline on upload. Extracted text is stored and indexed, making document *contents* searchable firm-wide and within a case (feeding Global Search, Section 23). OCR status is visible (Processing/Searchable/Failed, with manual retry). Poor-quality/handwritten scans are flagged for manual verification before their text is relied on for search or AI features (Section 30).

### 13.4 Document Approval Workflow
1. **Junior Advocate** drafts, uploads, submits — *Draft Submitted*.
2. **Senior Advocate** reviews, requests changes or approves — *Senior-Approved*.
3. **Partner** final internal review/approval — *Partner-Approved*.
4. **Client** reviews/acknowledges the approved document — *Client-Reviewed* / *Finalized*.

Every transition is timestamped, attributed, and logged with comments in `DocumentApproval` history. Documents can be rejected/sent back at any stage with mandatory comments.

---

## 14. Task Management Module

Case-linked tasks with assignee, priority, due date, and status lifecycle (Pending → In Progress → Completed → Overdue). Personal task queue ("My Tasks") per user, team Kanban board for Associates/Partners, sub-task delegation (Associate → Junior Advocate), task comments/attachments, automatic overdue escalation notification. **A task's assignee can be changed at any time** (new in v1.2) — every reassignment is captured in the Audit Log with who reassigned it, when, and the previous/new assignee.

**Task History** *(new in v1.3)* — a Task Details screen shows the task's complete chronological history: created by (and initial assignee), every reassignment (from whom to whom), every status change including who completed it and, if reopened later, that transition too. This is read directly from the Audit Log (Section 29) — there is no separate task-history table — establishing the pattern any future entity needing a change trail should follow.

**Smart Task Assignment** *(new in v1.2, enhanced in v1.3)* — when assigning (or reassigning) a task on a case, the assignment screen surfaces everyone already assigned a task on that same case, now including their role and their current/pending task counts *on this case* (not just their name), so the Managing Partner has enough context to decide whether to add another person or lean on someone already covering the matter. This is informational only and never blocks the assignment — the Managing Partner or Associate can still add as many people to a case as needed.

---

## 15. Hearing Calendar

### 15.1 Core
Centralized calendar (month/week/day) across all active cases; each entry: case reference, court, judge/bench, purpose, date/time, assigned attorney; outcome recording post-hearing auto-updates next hearing date; conflict detection for double-booked attorneys; filterable by attorney/court/case type; read-only client-visible subset (next hearing date only). Hearing reminders push to mobile apps as native notifications, deep-linking to the Hearing Detail screen.

**Single-active-hearing rule** *(clarified in v1.2)* — a case has at most one upcoming (Scheduled) hearing at any time. Changing the next hearing date **reschedules** the existing upcoming hearing in place; it does not create a second one, and the old date is never left showing on the calendar. Recording an outcome is the only action that creates a new Scheduled row (for the next hearing, if one is given) while marking the just-completed one Completed. "Previous Hearing" always reflects the most recently Completed hearing; "Next Hearing" always reflects the current (and only) Scheduled one.

**Per-date hearing list** *(clarified in v1.2)* — clicking a date on the calendar shows that day's hearings ordered by **Court, then Case Number**, displaying Case Number, Cause Title, Court, and Hearing Status.

**Court Hall / Room Number** *(added in v1.6)* — each hearing carries an optional free-text `courtHall` field (distinct from Court itself — a court can sit in more than one hall/room), settable when scheduling or rescheduling, shown on the Case Detail Hearings tab and used as a filter/column on the Cause List (Section 15.1a). Not a Picklist category (halls/rooms vary too idiosyncratically per court to curate centrally, unlike Court/Judge/etc.).

### 15.1a Cause List *(added in v1.6)*

A dedicated, firm-wide filterable/groupable/exportable view of hearing records — the standard legal-practice "which matters are listed before which court, when" screen — built entirely on the same `Hearing` table Section 15.1 and the Case Detail Hearings tab already read. No separate hearing data source; no duplicated fields.

- **Date range:** Today, Tomorrow, Next 7 Days, This Week, or a Custom Range.
- **Filters:** Court, Court Hall/Room Number, Advocate, Client, Case Stage, Hearing Status, and free-text Search (case number, title, client name).
- **Grouping:** Court-wise or Date-wise (or ungrouped).
- **Scope — Firm / My / Employee Cause List:** any staff member sees their own cause list by default; an actor with unrestricted case visibility (Managing Partner, Office Staff, per Section 8a's role matrix) can additionally switch to the full Firm Cause List or pick any individual employee's Employee Cause List. This reuses the same row-level case-visibility rule as every other case-scoped screen (Section 3.2/3.3) rather than introducing a separate access model — an actor without unrestricted visibility never sees the Firm/Employee options, and a request for them is treated as their own cause list regardless.
- **Row fields:** Case Number, Cause Title, Client Name(s), Court Name, Court Hall/Number, Hearing Time, Hearing Purpose, Case Stage, Assigned Advocate(s), Hearing Status, Next Hearing Date. Clicking a row opens the Case Detail screen (Section 10.1).
- **Print Cause List:** browser print of the current filtered/grouped view.
- **Export PDF / Export Excel:** a downloadable file reflecting the same filtered/grouped view, capped at 5,000 rows per export (a narrower filter/date-range is required beyond that, to keep export generation fast and bounded).

### 15.2 Calendar Integration
Hearings, meetings, and reminders sync to **Google Calendar, Apple Calendar, and Outlook Calendar** via OAuth-based per-user connections. Per-user, per-provider enable/disable toggle; disabling stops future pushes without deleting already-synced events. Sync respects role visibility. OAuth tokens stored with the same encryption standard as other credentials (Section 28).

---

## 16. Billing & Invoicing

### 16.1 Core
Time-tracking entry against case/task (billable/non-billable); configurable billing models (hourly/fixed-fee/retainer); auto-draft invoice generation aggregating logged hours + manual line items; approval workflow (Draft → Partner Review/Approve → Sent); payment tracking (partial payments, due dates, overdue alerts); client-facing invoice view; financial reports (revenue by case/client/practice area, outstanding receivables, billable-hours summary).

**Implemented in v1.8 (Milestone 2):** `TimeLog` (case, user, optional task, date, hours, billable flag, description) logged by Managing Partner/Associate/Junior Associate (`TIMELOGS.CREATE`) — Office Staff has no billing access at all, matching Section 8's matrix. `Invoice`/`InvoiceLineItem`/`Payment` implement the Draft → Approve → Send lifecycle exactly, gated by a new `BILLING.APPROVE` permission (Managing-Partner-only, matching "approval workflow ... Partner Review/Approve"). Invoice numbers follow the existing Matter Number/Client ID generator pattern (`SA-INV-2026-0001`, resets yearly). A billing rate is supplied per time entry at invoice-creation time (not stored on the entry itself) since "configurable billing models" implies the rate can vary per engagement; once a time log or expense is referenced by an invoice line item it is marked `invoiced` and can never be edited, deleted, or billed a second time — enforced in the same database transaction as invoice creation. Payment tracking supports partial payments; `Invoice.status` (PARTIALLY_PAID/PAID) is derived from the sum of recorded payments rather than set independently, so it can never drift from the actual ledger. **Not yet implemented as of v1.8:** configurable billing models beyond a per-line rate (hourly/fixed-fee/retainer as named billing *arrangements*), overdue alerts, client-facing invoice view (depends on the deferred Client Portal), and financial reports (Milestone 3/4).

**Bug fixed and payment-status tracking completed in v1.11 (2026-08-06, pre-deployment).** Two real, distinct defects were found and fixed: (1) the Case Billing tab's "Create Draft Invoice" card returned nothing at all — not even an error — whenever a case had zero unbilled time logs and zero unbilled expenses, so a case with no logged time/expenses yet (e.g. a brand-new matter being billed a fixed retainer up front) had no way to create an invoice through the UI at all, despite the backend already accepting free-form `manualItems` for exactly this case; the UI never exposed that path. Root-caused end-to-end (frontend → API → validation → permissions → DB, per the request) and confirmed no backend defect existed — `POST /api/invoices` worked correctly the whole time when given at least one line item of any kind. Fixed by always rendering the create-invoice card (when the case has a linked client) with the existing unbilled-time/unbilled-expense pickers *plus* a new manual-line-item builder, and by adding a due-date field to invoice creation — previously absent from the UI entirely, meaning "overdue" could never have triggered for any invoice created through it, a second latent defect against this section's "due dates, overdue alerts" line. (2) `createDraftInvoice`'s own API response was missing the new `paymentStatus` field (see below) — caught by a test written for this fix, before commit, not by manual inspection.

Delivers the SRD's "payment tracking (partial payments, due dates, overdue alerts)" clause in full: a derived **payment status** — `PENDING` / `PARTIALLY_PAID` / `PAID` / `OVERDUE`, distinct from `Invoice.status`'s DRAFT→APPROVED→SENT lifecycle — computed on read (`invoices.service.ts`'s `derivePaymentStatus`), the same "computed, not a scheduled job" pattern already established for Task `OVERDUE` (Section 14), rather than adding a cron job this deployment has no infrastructure for. An invoice is `PAID` once fully paid (takes priority over everything else); otherwise `OVERDUE` once its due date has passed; otherwise `PARTIALLY_PAID` if any partial payment has been recorded; otherwise `PENDING`. Surfaced as filter tabs (All/Pending/Partially Paid/Fully Paid/Overdue, combining via AND with the existing lifecycle-status filter and a new invoice-number/matter/client search box) and a color-coded badge on the Invoice List (`/invoices`), Invoice Detail, the Case Billing tab's own invoice list, and the Dashboard's Accounts Team "Outstanding Invoices" widget (which also gained a dedicated Overdue count tile) — one shared derivation function, read everywhere, so these four surfaces can never drift out of sync with each other. `GET /api/invoices` accepts a new `paymentStatus` query parameter, applied in application code (not a raw SQL clause) since it depends on comparing `dueDate` against "now," not a stored column.

**Invoice module completed to production standard in v1.12 (2026-08-06, pre-deployment).** Delivers the remaining pieces of this section's "client-facing invoice view" and general billing-completeness requirements:

- **Dedicated Create Invoice screen (`/invoices/new`)**, reachable via a new "+ Create New Invoice" button on the Invoice List. Lets the user select a Client and, *optionally*, a Matter/Case — omitting the case creates a **"general" invoice**, a new concept (billed straight to a client, not tied to any one matter, e.g. a standalone consultation fee). `Invoice.caseId` was relaxed from required to optional (`Case? @relation`) to support this; the existing Case Billing tab's "Create Draft Invoice" card is **unchanged, byte-for-byte** — the service layer branches on `caseId` presence, and the case-scoped branch is the original, untouched validation logic. A general invoice can only carry manual line items (no time-log/expense references, since those only exist against a case); its own client-access check (`assertClientAccess`) stands in for the case-scoped path's client-link check. The screen also adds, at creation: **Tax/GST rate**, **Discount** (percentage or flat, clamped to the subtotal so it can never drive the total negative), **Notes**, and **Terms & Conditions** (all new `Invoice` columns, stored — not recomputed — at issuance, matching `subtotal`/`total`'s existing "never drifts" convention); a live preview of the computed subtotal/discount/tax/grand-total before saving; and Save as Draft / Save & Approve / Save, Approve & Send actions (the latter two simply call the existing approve/send endpoints immediately after creation — no new workflow states).
- **Invoice PDF** (`GET /api/invoices/:id/pdf`, gated by the existing `BILLING.VIEW` permission — a PDF is just an alternate representation of already-viewable data). A professional, branded PDF built with the same PDFKit pattern as the Cause List export (Section 15.1a): S&A LEGAL logo and brand color, firm name/address/phone/email/website/GSTIN (read live from Firm Profile, below), invoice number/dates, client details, matter details (or "General Invoice" when case-less), the line-item table, subtotal, discount, a GST line plus a CGST/SGST 50/50 breakup (the standard intra-state convention — this schema has no state-of-supply data to support real inter-state IGST detection), grand total, amount paid, balance due, notes, and terms. A **Payment Details** section (bank name/account holder/account number/IFSC/branch/SWIFT/UPI ID, all from Firm Profile) plus a **"Scan to Pay"** payment QR image (see the v1.13 refinement below). Invoice Detail gained **Download PDF**, **Print Invoice** (fetches the PDF and triggers the browser's native print dialog via a hidden iframe), and **Share Invoice** (uses the Web Share API when available — e.g. on mobile — falling back to a plain download) buttons.
- **Firm Billing Settings**, a new section on the existing Firm Profile admin screen (`FIRM_PROFILE.MANAGE`, Managing-Partner-only): Bank Name, Account Holder Name, Account Number, IFSC, Branch, SWIFT (optional), and UPI ID — new nullable `FirmProfile` columns, read live by the PDF generator (never copied onto individual invoices) so a later settings change is reflected on every invoice generated afterward. A logo uploader (PNG only, magic-byte-verified server-side, 2MB cap) writes to the same two canonical logo-file locations the Branding milestone established (`backend/src/assets/logo.png`, `frontend/public/logo.png`) — there remains no DB-stored logo path.

**Invoice PDF refinements in v1.13 (2026-08-06, pre-deployment).** A client-readiness pass on the PDF introduced in v1.12, driven by direct Managing Partner feedback after reviewing a sample invoice:

- **Header alignment.** The logo and firm name/address were previously two independently-positioned blocks that could drift out of vertical alignment depending on content length. Rewritten so the logo, the firm-name/address block, and the "INVOICE" heading/meta block are all vertically centered against a shared header-row height (the tallest of the three), computed from each block's actual rendered text height (`PDFKit.heightOfString`) rather than fixed offsets.
- **"INVOICE" replaces "TAX INVOICE".** The firm doesn't want the invoice implying a GST-registered supply by its own title; the GST/CGST/SGST breakup lines are unaffected and remain conditional on a tax rate actually being entered per invoice (Section 16.1 above).
- **Payment status removed from the PDF.** `Invoice.paymentStatus` (Pending/Partially Paid/Paid/Overdue) is an internal software concept for tracking receivables (Section 16.1's payment-status axis, still fully intact everywhere else in the product) — not something to print on a document handed to a client. The PDF's invoice-meta block now shows only Invoice #, Issue Date, and Due Date.
- **Real payment QR code, not a generated one.** The v1.12 QR was synthesized server-side from the UPI ID via a `upi://pay?...` deep link — functionally correct but visually different from (and less trustworthy-looking than) the firm's actual bank-issued QR code. Firm Billing Settings gained a **Payment QR Code** upload (JPG or PNG, magic-byte-verified, 2MB cap, client-side preview before saving) alongside the bank-details fields it's now grouped with; the uploaded image is embedded as-is on every invoice PDF's "Scan to Pay" section, and that section is omitted entirely when no QR code has been uploaded yet, rather than falling back to a generated one. Same canonical-two-file convention as the logo (`backend/src/assets/payment-qr.{png,jpg}` / `frontend/public/payment-qr.{png,jpg}`), except the extension varies by upload format — uploading one format deletes a stale file in the other so exactly one is ever current.

### 16.2 Expense Management
Tracks the firm's own out-of-pocket costs per matter, separate from client invoicing: **Court Fees, Stamp Duty, Travel, Courier, Printing, Typing, Miscellaneous.** Each entry: matter id, category, amount, date, incurred-by, receipt/attachment (OCR-searchable), billable-to-client flag. **Matter Profitability Report** compares billed/collected revenue against logged expenses + effective billable-hour cost — a true per-matter profitability figure. Full profitability view (revenue vs. internal cost) is Partner-only; Accounts Team logs expenses and sees standard billing reports.

**Implemented in v1.8 (Milestone 2):** `Expense` model with the exact category list above, now a `EXPENSE_CATEGORY` Picklist category (Section 24's standing convention) rather than a hardcoded list. Soft-deletable — Expense is the **sixth Recycle Bin entity** (Section 27 already named Expenses as a candidate; this follows the identical extension path used for Contact in Milestone 1, no new architecture). Receipt is currently a plain text reference field, not a real file attachment — OCR-searchable receipt attachments depend on the deferred OCR pipeline. **Matter Profitability Report is not yet implemented** — deferred to Milestone 3/4 alongside the rest of Reports & Analytics, since the underlying billing/expense data this report aggregates now exists as of this milestone.

---

## 17. Notifications & Reminders

- Channels: In-app, Email, SMS, native push (Android/iOS)
- Triggers: upcoming/overdue hearing/task, document upload, document-approval stage changes, invoice generated/paid/overdue, case reassignment/status change, new task assigned, new chat message, new office announcement
- Notification center with read/unread status and history
- Daily digest email option for Partners

**Implemented in v1.9 (Milestone 3) — in-app channel only.** A new `Notification` model (userId, type, message, entityType/entityId, isRead) backs a Notification Center (bell icon, unread badge, mark-read/mark-all-read) in the Web Admin Portal, polled every 30s. Event-driven triggers are wired at the point of action (not a scheduled/cron job — this deployment has no background-job infrastructure): **task assigned** (tasks.service.ts, skipped on self-assignment), **hearing scheduled/rescheduled** (notifies the case's Partner + Advocates), **document uploaded** (same case-team notification), **case reassigned** (direct to the new Partner) and **case status changed** (case team), and **invoice generated**/**invoice paid** (case team, Milestone 2's Billing module). Deliberately **not implemented**: Email, SMS, and native push channels (no SMTP/SendGrid/Twilio/FCM/APNs credentials provisioned for this deployment, and native push has no app to receive it since native mobile itself remains deferred — Section 4), the daily-digest email option (depends on the email channel), document-approval-stage-change and new-chat-message/new-office-announcement triggers (their source features — Document Approval Workflow, Internal/Client Chat, Office Announcements — are themselves deferred or not yet built), and true "upcoming/overdue" time-based reminders (would need a scheduled job; today's triggers fire only on the originating action, e.g. "hearing scheduled," not "hearing is tomorrow"). All of this is a documented scope narrowing, not a silent omission, and can be revisited once a provider/credentials/scheduler are available.

---

## 18. Dashboards (Role-Specific)

### 18.1 Managing Partner Dashboard
Total active cases, today's hearings, pending tasks, advocate performance, revenue dashboard, outstanding invoices, client registrations, notifications, office announcements. **Firm-wide task breakdown** (new in v1.2) — Pending/Overdue/Completed counts, with the task list itself showing the first 5 pending tasks and a "View More" control for the full list, so the dashboard stays scannable as task volume grows.

**Employee Task Audit** *(new in v1.2, delivers on this section's "advocate performance" and Section 19's "staff performance reports")* — the Managing Partner selects any employee and reviews their assigned/pending/completed/overdue tasks, with date-range filtering, search, completion percentage, and an on-time completion rate. **Extended in v1.3 with workload visibility:** total active cases and a current case list (every case the employee is Partner or Advocate on, excluding Closed/Archived), so the Managing Partner can judge whether an employee is already overloaded before assigning more work.

### 18.2 Advocate Dashboard
*(Associate and Junior Associate, scoped to own assignments.)* My cases, today's hearings, my tasks, pending drafts (documents awaiting their action in the approval workflow — deferred along with the rest of the Document Approval Workflow, Section 13.4), calendar, client messages (deferred along with Client Chat, Section 20.2).

**Implemented in v1.10 (Milestone 4).** My cases and my tasks already existed (Section 6.10); **today's hearings** is new — a table on the shared Dashboard screen, scoped to the actor's own case access the same way the Hearing Calendar and Cause List already are (`caseScopeWhere`, no new permission).

### 18.3 Client Dashboard
My cases, case timeline, next hearing, pending documents, bills & payments, chat with advocate. *(Unchanged — the Client Portal itself remains deferred; see Section 21.)*

### 18.4 Office Staff & Accounts Team Dashboards
Office Staff: hearing calendar overview, pending intake approvals, admin task queue. Accounts Team: outstanding invoices, payment collection trends, revenue by client/case.

**Implemented in v1.10 (Milestone 4).** Office Staff: a firm-wide **today's hearings** table (Office Staff holds `CASES.VIEW_ALL`, so this is the same query as the Advocate Dashboard's but unscoped) plus **My Admin Task Queue** — their own open task list in full (not just the summary count tile). "Pending intake approvals" has no corresponding backend workflow anywhere in the app (there is no intake-approval concept in the schema) and remains out of scope — inventing one would be a new feature, not a dashboard surface over existing data. Accounts Team: an **Outstanding Invoices** summary — count and total amount outstanding (SENT/PARTIALLY_PAID/OVERDUE invoices, balance = total minus recorded payments) plus the first 10 rows, linking to the full Invoices screen. "Payment collection trends" and "revenue by client/case" are already served by Section 19's Financial and Matter Profitability reports rather than duplicated as dashboard widgets.

---

## 19. Reports & Analytics

Case reports (status, practice area, advocate, duration), financial reports (revenue, receivables, billable-hours), Matter Profitability reports, staff performance reports, hearing outcome reports, tag-based reports (e.g., revenue/caseload by tag). All exportable to PDF/Excel/Word with date-range and custom filters (Section 25).

**Implemented in v1.9 (Milestone 3).** Six report types, one shared JSON/PDF/Excel pipeline (`reports.service.ts`'s generic `ReportTable` shape — a title/columns/rows structure any report can populate, rendered by one generic PDF/Excel exporter rather than one bespoke renderer per report): **Case Summary** (status/practice area/partner/days-open per case), **Financial** (revenue collected from recorded payments, outstanding receivables on approved-or-later invoices, billable hours logged), **Matter Profitability** (Total Invoiced − Total Expenses per case — the one profitability signal this schema's data actually supports; there is no per-employee hourly *cost* rate anywhere, only the *billing* rate set at invoice time, so a cost-based margin figure the SRD's narrative might imply isn't fabricated), **Staff Performance** (tasks completed/pending/overdue plus billable hours per fee-earner), **Hearing Outcome** (status and outcome notes per hearing in range), and **Tag-Based** (caseload and revenue grouped by Case Tag). Date-range filtering on all six. **Export is PDF and Excel only, not Word** — matching the precedent already set by the Cause List module (Section 15.1a), which also ships PDF/Excel only; a third export library for a format used nowhere else in the app was a deliberate scope call. `REPORTS.VIEW` gates the on-screen table; `REPORTS.EXPORT` (already seeded in Step 3's catalogue, previously unused pending this module) separately gates the PDF/Excel download, so a role can be given one without the other.

---

## 20. Communication & Messaging Module

### 20.1 Internal Chat
Messaging between Managing Partner, Partners, Advocates, Office Staff, and Accounts Team. Supports direct (1:1) and case-linked group threads; case-tagged threads appear in that case's Chat tab. Untagged (general firm) threads are still logged for compliance. Retained per audit/retention policy (Section 29).

### 20.2 Client Chat
Secure, direct communication between a Client and their assigned Advocate, always linked to a specific matter (separate thread per matter). Partners have oversight visibility for compliance review. Supports document/attachment sharing via the same OCR/confidentiality pipeline as Document Management. Encrypted in transit and at rest; retained and auditable.

---

## 21. Client Portal Module

Client Dashboard (18.3), Case Status/Timeline, Document Exchange (incl. client-review stage of the Approval Workflow), Invoice & Payment view, Client Chat — all gated by Client ID login (Section 11.1).

---

## 22. Knowledge Base Module

Firm-wide searchable repository, distinct from case-specific documents: **Judgments, Templates, Agreements, Notices, SOPs, Checklists.** Category browsing plus full-text search (shares the OCR/indexing pipeline, Section 13.3), version control per item, role-restricted publishing (e.g., only Partners/Senior Advocates publish firm-wide SOPs/templates), practice-area tagging. Foundation for future AI legal research/case-law suggestion features (Section 30).

---

## 23. Global Search Module

One unified search across **Client Name, Client ID, Matter Number, Court Case Number, Documents, OCR Text, Knowledge Base, Opposite Parties, Advocates, and Contacts.** Results grouped by entity type with RBAC applied at the search-index layer (never surfaces what the user can't already view). Supports fuzzy matching (shared logic with Advanced Conflict Check, Section 10.2) and per-user recent-search history.

**Implemented in v1.9 (Milestone 3)**, across every named target except OCR Text and Knowledge Base — both out of scope since OCR and the Knowledge Base module are themselves deferred (Section 22, Section 30-adjacent). Covers Client Name/Client ID, Matter Number/Court Case Number/Cause Title, Document titles, Contacts, and Advocates. RBAC is applied per result category rather than at a single gate: Client and Case results reuse the exact same row-level scope functions (`clientScopeWhere`/`caseScopeWhere`) every other module already goes through, Document results are scoped to cases already in that result set (matching the Documents module's own "case access implies document access" rule), and Contact results require the actor already hold `CONTACTS.VIEW` — so a search can never surface something the actor couldn't already reach through its own screen. Matching combines case-insensitive substring matching (for identifier-like fields — Client ID, Matter Number, Court Case Number, where fuzzy edit-distance wouldn't make sense) with the fuzzy `similarity` function from Advanced Conflict Check (Section 10.2), exported and reused rather than duplicated, for name-like fields. A new `RecentSearch` model backs per-user recent-search history, surfaced on the Search Results screen when the query box is empty.

---

## 24. Admin, Settings & Customization Module

User Management, **Role & Permission Management (Section 8a)**, Firm Profile & Practice Area Configuration, Office Announcements Composer, Audit Log Viewer — plus no-code customization, **Managing Partner only**:
- **Custom Fields** — add fields to existing entities via a field-builder UI (name, type, applicable entity), no code change.
- **Custom Dropdowns** — define/edit option lists firm-wide (document categories, expense categories, tags, etc.). **Implemented ahead of Phase 7 in v1.2**, as a single reusable `PicklistValue` store (Section 7) covering Court, Judge, Case Stage, Practice Area, Case Type, Opposite Counsel, Opposite Party, Department, Hearing Purpose, and (v1.3) Document Category. Every one of those fields is a searchable dropdown rather than free text app-wide; only the Managing Partner can add/rename/deactivate a value (from this screen or inline while filling the field itself), so the same spelling is reused everywhere and typo/duplicate entries don't accumulate. **Standing rule as of v1.3: every dropdown the application adds from this point forward must be a `PicklistValue` category, not a new hardcoded option list** — this is now a permanent architectural requirement, not a one-off pattern scoped to the fields above. The only exception is a value tightly coupled to actual code logic (e.g., `TaskStatus`, `CaseStatus`) rather than a plain curated label list.
- **Custom Practice Areas** — add/rename/retire practice areas, replacing any hardcoded list. *(Now one of the `PicklistValue` categories above, not a separate mechanism.)*
Changes apply immediately across Web, Android, and iOS — pure configuration, no release needed.

**Implemented in v1.10 (Milestone 4).** **Firm Profile** — a singleton record (firm name, address, phone, email, GSTIN), viewable by every staff role (`FIRM_PROFILE.VIEW`) and editable only by the Managing Partner (`FIRM_PROFILE.MANAGE`, core-admin). **Office Announcements Composer** — Managing Partner and Office Staff can both create an announcement (`ANNOUNCEMENTS.CREATE`), but the service layer, not just the permission default, forces an Office Staff announcement to `isActive: false` regardless of what's requested — it only goes live once the Managing Partner publishes it (`PATCH .../active`, role-checked inline since the route's permission gate can't itself distinguish "create my own" from "publish anyone's"), the same "same key, narrower rule for one role" pattern Milestone 2 uses for Associate-drafts-only invoices. Surfaced as a widget on the shared Dashboard (composer for Managing Partner/Office Staff, read-only list for everyone else, moderation queue for the Managing Partner) rather than a separate screen — announcements are meant to be seen at login, not hunted for in a settings menu. **Custom Fields** — scoped to the Case entity only for Version 1.0 (`CustomFieldDefinition`/`CustomFieldValue`, `entityType: "CASE"`; the schema is deliberately not a fully generic any-entity engine yet, since Case is the only entity every prior enhancement request has targeted), a Managing-Partner-only builder screen (`CUSTOM_FIELDS.MANAGE`, core-admin) defining Text/Number/Date/Boolean fields, rendered and editable on the Case Overview by anyone who can already edit the case (reuses `CASES.EDIT` and the existing case-access check rather than a new permission). **Audit Log Viewer** — see Section 29's amendment below.

---

## 25. Data Import & Export Module

- **Export:** any report, case list, client list, or document set to **PDF, Excel, or Word**.
- **Import:** bulk import of **Clients, Matters, and Contacts** from Excel, for onboarding/migration.
- Flow: template download → upload → validation preview (errors/duplicates/conflict-check integration) → confirm → commit, with a post-import summary logged for audit.
- Import restricted to Managing Partner and Office Staff (Partner approval for bulk creation); export limited to what a role can already see.

**Implemented in v1.9 (Milestone 3).** **Export** — "any report, case list, client list" is served by Section 19's Reports screen and its shared PDF/Excel export pipeline, including a dedicated Client List report type, rather than a separate Export button bolted onto every list screen individually — one export surface, not several inconsistent ones; Word is out of scope for the same reason noted in Section 19. **Import** — a full template-download → upload → validation-preview → confirm → commit flow for Clients, Matters (Cases), and Contacts, gated by a new `DATA_IMPORT.RUN` permission (Managing Partner + Office Staff by default, per this section's own restriction). Upload parses an `.xlsx` file (ExcelJS) against the exact template headers; the preview response flags, per row, missing-required-field errors and Advanced Conflict Check matches (Section 10.2) — a row with either is never auto-created on commit, since bulk-import silently rubber-stamping a possible conflict-of-interest match would undermine the Managing-Partner-only override safeguard that check exists for; a flagged row must still be created individually through the normal Client/Contact screen. A post-import summary (created count + per-row skip reasons) is written to the Audit Log (Section 29).

---

## 26. Office Management Module (Future Phase)

**Attendance** (daily check-in/out), **Leave Management** (requests, approval, balances), **Employee Records** (designation, joining date, employment type), **Office Announcements** (surfaced on Partner Dashboard and pushed as notifications), **Holiday Calendar** (feeds into hearing/task scheduling).

---

## 27. Recycle Bin & Soft-Delete Policy

No record (Cases, Clients, Documents, Contacts, Tasks, Expenses, etc.) is ever hard-deleted by a normal user action. Deletion soft-deletes the record (`is_deleted`, `deleted_at`, `deleted_by`) into a Recycle Bin view visible **only to the Managing Partner**, who can **restore** or **permanently delete** (irreversible, requires explicit confirmation). Optional auto-purge after a configurable retention period. Every soft-delete/restore/permanent-delete action is captured in the Audit Log.

**Implemented as of v1.4 (Step 2 — Case/Client/Document/Task):** the `is_deleted`/`deleted_at`/`deleted_by` triad is implemented as a nullable `deletedAt DateTime?` timestamp plus `deletedById`/`deletedBy` (a null `deletedAt` means "not deleted" — no separate boolean flag is needed). Every existing list/search/dashboard query and every row-level authorization check (`assertCaseAccess`, `assertClientAccess`, `assertDocumentAccess`, `assertTaskAccess`, and their dependents) excludes soft-deleted rows, so a soft-deleted record is invisible everywhere except the Recycle Bin — indistinguishable from a record the caller was never authorized to see. Restore clears `deletedAt`/`deletedById`, bringing the record back with all relationships intact (no data is copied or reconstructed — the row and its foreign keys never moved). Permanent delete requires the record to already be soft-deleted (the Managing Partner cannot skip the soft-delete step even for permanent deletion) and cascades to dependent rows via database-level `onDelete: Cascade` relations rather than application code; a permanently-deleted Document also best-effort-removes its stored files from disk. Who may trigger the soft-delete on each entity mirrors that entity's existing highest-privilege mutation role (Case/Document/Task: Managing Partner or Associate; Client: Managing Partner only, matching `setClientStatus`).

**Generic-architecture note:** requirement 8 (reusable by future modules) is satisfied by one shared `recycleBin` module — one list/restore/permanent-delete endpoint set, one audit-logging convention, one UI screen — covering all four entity types via an explicit switch over entity type rather than a single polymorphic Prisma query. This is a deliberate trade-off: Prisma's generated client gives each model its own distinctly-typed delegate, so a truly generic runtime function would need to erase those types (effectively `any`), which this codebase's lint configuration forbids project-wide. Adding a fifth soft-deletable entity later means: add `deletedAt`/`deletedById` columns to its schema (as done here for the four), add one `case` branch to each of the three `recycleBin.service.ts` functions, and add the type name to the `RecyclableEntityType` union — no other architectural change. Auto-purge after a retention period remains optional/deferred, as stated above; it has not been implemented in v1.4.

---

## 28. Security Requirements

RBAC enforced at the API level (shared by Web/Android/iOS); password policy and MFA (mandatory for Partner/Accounts); encrypted data at rest and in transit, including chat messages and OCR text; session management per Section 9 with mobile app-level PIN/biometric lock and remote session revocation; field-level confidentiality (Client never sees internal-only content, Internal Chat, or pre-approval drafts); Internal Chat and Client Chat logically separated; IP allow-listing option for the Web Admin Portal; regular vulnerability scanning and dependency patching, including app-store security compliance; data segregation for multi-branch setups if applicable.

**MFA implemented in v1.10 (Milestone 4).** TOTP (RFC 6238, via an authenticator app) rather than SMS/email OTP — needs no third-party provider, unlike Notifications' Email/SMS channels (Section 17), which were deferred for exactly that reason. Self-service enrollment (QR code + manual-entry key, confirmed with a real code before anything is persisted, so a typo'd/abandoned enrollment never half-enables MFA) issues 10 single-use backup codes. Login for an MFA-enabled account becomes two steps: password verification returns a short-lived (5-minute) MFA challenge token instead of a session; a second call verifies a TOTP or backup code against that token before a session is issued. "Mandatory for Partner/Accounts" is implemented as a **post-login setup nudge** (`mfaSetupRequired: true` in the login response, surfaced as a banner linking to the setup screen), not a hard route block — blocking every route pre-enrollment would leave a Managing Partner or Accounts Team user with no working session to reach the enrollment screen in the first place, an unrecoverable bootstrapping deadlock. Disabling MFA requires re-entering the current password, the same "prove you're still you" bar a password change needs. The TOTP secret is AES-256-GCM encrypted at rest (not hashed — unlike a password, it must remain decryptable to verify future codes); backup codes are bcrypt-hashed and single-use, same as passwords.

**Malware-scan engine implemented in v1.10 (Milestone 4).** The integration point existed since the original Security Hardening pass but returned a no-op `{clean: true}` pending a real AV engine. It now performs genuine, dependency-free detection: the industry-standard **EICAR test signature** (so the scan path is verifiable end-to-end without needing real malware) and an **executable-magic-byte heuristic** (Windows PE, Linux ELF, Mach-O, shell-script shebang) rejecting an executable disguised with a document extension — including closing a real gap where a `.doc` upload previously skipped all content scanning entirely (legacy `.doc` can't be verified by magic bytes the way PDF/PNG/JPEG/TIFF/DOCX can, but that's no longer a reason to skip the malware scan too). A real third-party AV engine (ClamAV daemon, cloud scanning API) remains a future upgrade — this closes the gap of having no scanning at all, not the full space of what a dedicated AV product would catch.

**Pagination implemented in v1.10 (Milestone 4).** The four highest-traffic list endpoints (`GET /api/cases`, `/api/clients`, `/api/cases/:caseId/documents`, `/api/cases/:caseId/tasks`) now accept `page`/`pageSize` query parameters and return `X-Total-Count`/`X-Page`/`X-Page-Size` response headers, rather than always returning every matching row. The JSON response body deliberately stays a plain array (metadata rides in headers, the same convention GitHub's REST API uses) so every existing consumer — three frontend pages, two backend test files — needed zero changes; only the Case and Client list screens' UI grew Previous/Next/page-size controls consuming the new headers.

---

## 29. Backup & Audit Logs

Automated daily full + incremental backups (including chat data, OCR text, Knowledge Base items), configurable retention (e.g., 90-day rolling + 3-year monthly archive), periodic restore testing. Documented RTO/RPO with offsite/cloud redundant storage. Immutable audit log of logins, document views/downloads, document-approval decisions at every stage, case reassignments, invoice changes, **role and permission changes (including individual overrides — Section 8a)**, data exports, chat thread access, and Recycle Bin actions — retained per compliance period (recommend 7 years, to confirm against applicable legal record-keeping norms). Closed cases retained per statutory limitation periods before archival/deletion consideration; no hard-delete without Partner-level multi-step confirmation (Section 27).

**Audit Log Viewer implemented in v1.10 (Milestone 4).** A read-only screen (`GET /api/audit-log`, `/admin/audit-log`) over the existing `AuditLog` table — no new data source, per this section's own standing convention (below). Access is either `AUDIT_LOG.VIEW_ALL` (Managing Partner — every entry, firm-wide) or `AUDIT_LOG.VIEW_OWN` (Accounts Team — the actor's own actions only); both permission keys were seeded back in Step 3 but had no screen reading them until now. Filterable by entity type, action, user, and date range, with the same header-based pagination convention as the list endpoints above (here expressed as a `{total, page, pageSize, entries}` response body instead, since this is a new endpoint with no pre-existing consumer to stay backward-compatible with).

**Standing convention as of v1.3:** the Audit Log is the single mechanism for any "who did what, when" requirement — Task History (Section 14) is the reference implementation (task creation, reassignment, and every status change, each attributed to an actor and timestamped). A future module that needs its own change history should write to this same log rather than adding a bespoke history table or column; that's a one-line `recordAuditLog(actor, action, entityType, entityId, details)` call per event, and reading the trail back is a single query filtered by `entityType`/`entityId`.

---

## 30. Future AI Features

Grouped by function; all flagged for a later phase, not part of the initial build.

**Drafting & Review:** Legal drafting, AI document review, Contract analysis.
**Research & Analysis:** AI legal research, Case law suggestions, Judgment summarization, Natural-language case search.
**Specialized Legal AI:** Property title verification, AI legal opinion generation.
**Operational/Advisory:** Smart deadline extraction, Hearing outcome pattern insights, Billing anomaly detection.
**Client-Facing:** Client query chatbot.

**Governing principle:** every AI feature must be evaluated for confidentiality/privilege risk before implementation. No client-confidential data — including OCR'd text or chat content — is sent to third-party AI services without explicit safeguards; on-premise/private-instance models preferred for privileged content. AI-generated drafts/opinions always route through the human Document Approval Workflow before reaching a client.

---

## 31. Deployment Architecture

### 31.1 Overview
Three-client, one-backend architecture: **Web Admin Portal** (Partner, Advocates, Office Staff, Accounts), **Android App** and **iPhone App** (Advocates on the go, Clients).

### 31.2 Shared Backend
Single secure backend API (REST/GraphQL) is the sole gateway to the database — no client talks to the database directly. All business logic and RBAC enforcement live in the backend. One shared secure cloud database is the single source of truth across all three clients.

### 31.3 Mobile-Specific Considerations
Push notifications (FCM/APNs); limited offline support (cached read-only recent views, sync-on-reconnect, no offline editing of legally sensitive data); camera-based document capture into the OCR pipeline; app-level biometric/PIN lock and remote session revocation; app-store data-handling compliance.

---

## 32. Phase-wise Development Plan

**Phase 1 — Foundation (Core MVP):** Authentication & RBAC (incl. Client ID), Case Management (incl. Matter Number), Client Management, Document Management (upload/tagging/basic versioning), Task Management.

**Phase 2 — Operations:** Hearing Calendar (conflict detection), Notifications & Reminders, Case Timeline/Notes, foundational Audit Logs.

**Phase 3 — Financial Layer:** Time Tracking, Billing & Invoicing, Accounts dashboard & financial reports.

**Phase 4 — Communication & Approval:** Internal Chat, Client Chat, Document Approval Workflow, OCR pipeline, role-specific Dashboards.

**Phase 5 — Client-Facing & Multi-Platform:** Client Portal, Android and iOS apps, push notifications, Reports & Analytics.

**Phase 6 — Knowledge & Office Administration:** Knowledge Base, Office Management (attendance, leave, employee records, announcements, holiday calendar).

**Phase 7 — Extended Functional Layer:** Contact Directory, Expense Management & Matter Profitability, Advanced Conflict Check, Global Search Module, Admin/Customization (Custom Fields/Dropdowns/Practice Areas), **Role & Permission Management (Section 8a)**, Data Import & Export, Recycle Bin & Soft-Delete Policy, Calendar Integration (Google/Apple/Outlook), Tagging System.

**Phase 8 — Hardening & Scale:** MFA, advanced security hardening across all platforms, backup/DR formalization, multi-branch support (if applicable), performance optimization.

**Phase 9 — Intelligence Layer (Future):** AI-assisted features (Section 30), rolled out incrementally from lowest-risk (deadline extraction, judgment summarization, case-law suggestions) to highest-risk (legal drafting, AI legal opinion generation, property title verification).

**Note on execution order (v1.1):** this phase list remains the SRD's reference plan. The Managing Partner has directed a specific execution sequence for the current build that pulls select items forward ahead of their listed phase (Case Timeline/Notes and Hearing Calendar from Phase 2, richer Managing Partner Dashboard from Phase 4, Recycle Bin and Role & Permission Management from Phase 7) to address operational needs found during Phase 1 review. See [CHANGELOG.md](../CHANGELOG.md) and [TODO.md](../TODO.md) for the actual execution order and status — this section is intentionally left as the original reference plan rather than rewritten to match, so the rationale in "Recommended Development Roadmap" below still reads coherently on its own terms.

**Note on execution order (v1.2):** following hands-on use of Step 1, the Managing Partner requested a second round of in-place refinements before approving Step 2 — task reassignment, dashboard pagination, Employee Task Audit (pulling forward part of Phase 7's Admin/Customization and Phase 5's Reports & Analytics), the Case Stage/dropdown system (pulling forward part of Phase 7's Admin/Customization), and clarifications to the Hearing Calendar and Case Overview screens. These are treated as corrections to Step 1's scope, not a new phase — see CHANGELOG.md for the full record.

**Note on execution order (v1.3):** a third round of Step 1 refinement, approved before Step 2: Task History, expanded Employee Task Audit, Hearing Timeline, and a richer Smart Task Assignment view, plus formalizing the Picklist system, the Audit-Log-history pattern, and the single-screen detail-page pattern as permanent architectural conventions rather than one-off choices. Still treated as Step 1 corrections, not a new phase.

**Note on execution order (v1.5):** Step 3 (Enterprise Role & Permission Management — pulling forward the Role & Permission Management item from Phase 7, as already flagged by the v1.1 note above) was executed as a design-document-first milestone: a full architecture document was reviewed and approved before any implementation code was written, then built incrementally across four delivery milestones (M1 Schema & Seed, M2 Evaluator/Middleware/full route cutover, M3 Permission-Management Admin API, M4 Role & Permission Management UI), each requiring explicit Managing Partner approval before the next began. A fifth milestone number (M6) covers final documentation reconciliation and a production-readiness review rather than new functionality. See [STEP3_ROLE_PERMISSION_DESIGN.md](../STEP3_ROLE_PERMISSION_DESIGN.md) for the full architecture and [CHANGELOG.md](../CHANGELOG.md) and [TODO.md](../TODO.md) for the milestone-by-milestone execution record.

**Note on execution order (v1.6):** Step 4 (Litigation Operations Enhancement) delivers the Cause List screen (Section 15.1a, pulling forward the "filterable by attorney/court/case type" language already present in Section 15.1) as a single coherent milestone rather than a further design-document-gated sequence, per the Managing Partner's explicit direction — the underlying data model (the `Hearing` table) and access model (case-level row scoping, Section 3.2/3.3) were already fully specified by prior versions of this document, so no new architectural decision warranted a separate approval gate before implementation. Treated as an enhancement to existing Case/Hearing/Task/Calendar/Picklist modules, not a new SRD phase. See [CHANGELOG.md](../CHANGELOG.md) and [TODO.md](../TODO.md) for the execution record.

**Note on execution order (v1.7):** following a complete gap analysis against this document (every remaining requirement verified against the live codebase, not assumed from prior documentation), the Managing Partner grouped all remaining in-scope Version 1.0 work into four milestones and directed continuous, non-gated execution through all four, stopping only for material architectural decisions — a deliberate departure from Steps 1–4's per-step approval-gate cadence. Milestone 1 (this version) delivers Contact Directory (Section 12), Tagging System (Section 10.3), Advanced Conflict Check (Section 10.2), and Case Reassignment (Section 10.1) — the smallest, most self-contained group, chosen to go first since none of it depends on Billing, Notifications, Search, or Reports (Milestones 2–4). Explicitly excluded from all four milestones and left deferred, per the Managing Partner's binding instruction: Phase 9's AI features (Section 30), Client Portal (Section 21), Internal/Client Chat (Section 20), Knowledge Base (Section 22), OCR (Section 13.3), Digital File System (Section 13.2), Document Approval Workflow (Section 13.4), Calendar Sync (Section 15.2), Office Management (Section 26 — already self-described as a future phase), and native Android/iOS apps (Section 6.16/31). See [CHANGELOG.md](../CHANGELOG.md) and [TODO.md](../TODO.md) for the full milestone plan and execution record.

**Note on execution order (v1.8):** Milestone 2 delivers the self-contained financial layer (Time Tracking, Expense Management, Billing & Invoicing — Section 16) with no dependency on Milestone 1's Contact Directory/Tagging/Conflict Check, per the Managing Partner's continuous-execution direction. The same deferred-scope list from v1.7's note above still applies unchanged. See [CHANGELOG.md](../CHANGELOG.md) and [TODO.md](../TODO.md) for the execution record.

---

## Recommended Development Roadmap

**Sequence:** Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.

**Rationale:** The core operational backbone (1–3) is what the firm needs on day one. Chat, document approval, and OCR (4) are proven internally before any client-facing rollout. Mobile apps (5) extend an already-working backend rather than re-testing new logic three times in parallel. Knowledge Base and Office Management (6) are firm-wide utilities, useful but non-blocking for go-live. The broader functional layer — Contact Directory, Expense/Profitability, Advanced Conflict Check, Global Search, Admin Customization, Import/Export, Recycle Bin, Calendar Integration, Tagging (7) — builds on a system that's already in daily use, rather than adding surface area before the core is proven. Security hardening (8) precedes broad general availability. AI features (9) are deliberately last, gated behind a mature, human-reviewed data foundation.

**Cadence:** Each phase is its own releasable milestone with a UAT cycle involving at least one Partner, one Advocate, and one Accounts Team member — and from Phase 5 onward, at least one Client — before proceeding to the next phase.

---

## Appendix A — Pre-Freeze Gap Analysis (Reference)

Recorded at the time of freeze for future planning; not part of the functional scope of v1.0 itself:

1. **Non-Functional Requirements** — concurrent users, page-load targets, uptime SLA, mobile offline sync limits — to be defined during Phase 1 technical architecture.
2. **Data residency & DPDP Act, 2023 compliance** — hosting location, consent handling, data-principal rights, breach notification.
3. **Testing & UAT sign-off strategy** — formal QA plan (unit/integration/security-pentest/UAT criteria) per phase.
4. **Data migration & cutover plan** — concrete plan for migrating the firm's existing physical/Excel records at go-live, distinct from the general Data Import capability.
5. **E-signature integration** and **Engagement Letter/Retainer Agreement generation** — to close the loop on the Document Approval Workflow's Client stage.
6. **Court e-Filing / eCourts / NJDG integration** (India-specific) — to reduce manual hearing-calendar entry.
7. **GST-compliant invoicing specifics** — GSTIN, HSN/SAC codes, TDS-certificate tracking.
8. **Privilege/confidentiality classification** — a distinct "privileged/attorney work product" flag beyond the current internal/client-visible binary.
9. **Multi-branch numbering integrity** — confirm Client ID/Matter Number stay firm-wide unique if multi-branch is enabled later.
10. **Client offboarding / matter transfer-out process.**
11. **Training/change management and post-launch support/maintenance SLA.**

---

**End of Software Requirements Document — Version 1.9 (Frozen)**
