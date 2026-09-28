# Software Requirements Document & Project Blueprint
## Sourabh And Associates — Law Firm Management App

**Status: SUPERSEDED — see [SRD_v1.1.md](SRD_v1.1.md), the current master reference.**
**This file is retained unmodified as the historical record of what was originally approved on 2026-08-02. Do not treat it as current.**

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
**Responsibilities:** Overall firm oversight, case allocation, final review of client communications and billing, strategic decision-making, access to firm-wide financial/performance data, final approver in the document approval workflow, posts office-wide announcements, sole holder of Recycle Bin permanent-delete/restore rights, sole owner of Custom Fields/Dropdowns/Practice Area configuration.
**Permissions:** Full read/write access to all cases, clients, documents, billing, reports, chat threads (oversight visibility), and audit logs. Can create/deactivate user accounts, assign roles, override task assignments, approve invoices, approve documents at the final internal stage, view any user's active sessions and **force logout across all devices**, and permanently delete/restore records from the Recycle Bin.

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
**Permissions:** Read-only access restricted to their own case(s): status/timeline, shared documents, upcoming hearing dates, invoices, and chat with assigned advocate. Logs in using their **Client ID** rather than an internally assigned staff account. No access to internal notes, strategy documents, other clients' data, Internal Chat, or the Contact Directory.

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
- Role & permission management console (Partner-only)
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
17. Admin, Settings & Customization Module
18. Data Import & Export Module
19. Audit Log & Security Module
20. Recycle Bin / Soft-Delete Module
21. Office Management Module (future — attendance, leave, employee records, holiday calendar)

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
2. Client Detail Screen — profile, Client ID, linked cases, contact history, documents, invoices, chat
3. New Client Intake Form (conflict-check prompt; Client ID auto-generated and displayed on save, with option to send login credentials)

### 6.4 Contact Directory Flow
1. Contact List Screen (filter by category: Opposite Advocate/Judge/CA/CS/Expert/Govt Dept/Other)
2. Contact Detail Screen — details, linked matters, notes

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
2. Role & Permission Matrix Editor
3. Firm Profile & Practice Area Configuration
4. Custom Field / Dropdown Builder
5. Office Announcements Composer (Partner/Office Staff)
6. Audit Log Viewer
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
- **Role** / **Permission** — many-to-many via mapping table.
- **UserSession** — id, user id, device info, refresh-token reference/hash, created-at, last-active-at, status (active/revoked), revoked-reason (user-logout/admin-forced/password-change/account-disabled).
- **Client** — id, **Client ID** (unique, `SA-CLI-000001` format, sequential), name/company, type, contact details, onboarding date, conflict-check status, login credentials linked to Client ID.
- **Case/Matter** — id, court case number, **Matter Number** (unique, `SA-MAT-2026-0001` format), title, practice area, tags, status, filing date, assigned Partner, assigned Advocate(s), court/jurisdiction.
- **CaseClient (mapping)** — Case ↔ Client, with party role (plaintiff/defendant/etc.).
- **Contact** — id, name, category (Opposite Advocate/Judge/CA/CS/Expert/Govt Dept/Other), organization, designation, contact details, notes, linked matter ids (many-to-many).
- **FileNode** — id, matter id, parent folder id (self-referencing), name, type (folder/file), linked Document id, system-default flag.
- **Document** — id, case id, folder (FileNode) id, uploaded-by, storage path, type/category, version, confidentiality flag, upload timestamp, OCR status, OCR extracted text (indexed), current approval stage.
- **DocumentApproval** — id, document id, stage (Draft/Senior Review/Partner Approval/Client Review/Finalized), current approver, decision, comments, timestamp.
- **Task** — id, case id, assigned-to, assigned-by, title, description, priority, due date, status.
- **Hearing** — id, case id, date/time, court, judge, purpose, outcome/notes, next-hearing-date (self-referencing).
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
- User ↔ Role ↔ Permission: as described; User ↔ UserSession: one-to-many.
- Invoice ↔ TimeLog/Expense/Payment: as described.
- KnowledgeBaseItem, Contact, Announcement: firm-wide entities, not tied to a single case.
- Every major entity ↔ AuditLog: one-to-many.

---

## 8. Roles & Permission Matrix

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

### 9.5 Biometric Unlock (Future Enhancement)
Fingerprint/Face ID gates local access to an already-valid session on mobile; it never substitutes for backend authentication and does not renew or create a session. If the underlying session is revoked, biometric unlock fails and falls back to full login.

---

## 10. Case Management Module

### 10.1 Core
- Court case number **and** a distinct internal **Matter Number** (`SA-MAT-2026-0001` — prefix + year + sequence), assigned the moment a case is created, independent of and never overwritten by the court case number.
- Case categorization by practice area (configurable, Section 24)
- Status lifecycle: Intake → Active → Adjourned/On-Hold → Closed → Archived
- Assignment of Partner (oversight) + one or more Advocates (execution)
- Linked entities in one place: clients, opposing parties, documents (with approval status and auto-generated folder tree), tasks, hearings, billing/expenses, timeline, case-linked chat threads
- Bulk filtering/search by Matter Number, court case number, client name/Client ID, status, practice area, tag, assigned advocate, court
- Case reassignment workflow (Partner-only) with audit trail

### 10.2 Advanced Conflict Check
At new-matter or new-client creation, cross-checks entered names against the firm's entire history of **Client Names, Opposite Parties, Directors, Partners, Shareholders, and Company Names** (via Client Management, Contact Directory, and past Case records), using fuzzy/partial matching. A possible match blocks silent creation and shows a warning listing matching records and the matter(s) they appeared in, requiring explicit Partner acknowledgment/override with a mandatory logged reason (`ConflictCheckLog`).

### 10.3 Tagging System
Every Matter supports multiple tags (GST, Income Tax, NCLT, Arbitration, Property, Civil, Consumer, Company Law, etc.), distinct from the single practice-area classification. Tags are drawn from a firm-managed list (extendable via Custom Dropdowns, Section 24) and feed Global Search (Section 23), Reports (Section 19), and Dashboards (Section 18).

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

---

## 12. Contact Directory Module

Single searchable directory for everyone the firm deals with outside its own staff and clients: **Opposite Advocates, Judges, Chartered Accountants, Company Secretaries, Experts, Government Departments, and other professional contacts.** Clients are cross-referenced from Client Management, not duplicated.
- Each record: name, category, organization, designation, contact details, associated matters, notes.
- Feeds Global Search (Section 23) and Advanced Conflict Check (Section 10.2).
- Permissions: viewable by all internal roles; create/edit by Advocates and Staff; no Client access.

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

Case-linked tasks with assignee, priority, due date, and status lifecycle (Pending → In Progress → Completed → Overdue). Personal task queue ("My Tasks") per user, team Kanban board for Associates/Partners, sub-task delegation (Associate → Junior Advocate), task comments/attachments, automatic overdue escalation notification.

---

## 15. Hearing Calendar

### 15.1 Core
Centralized calendar (month/week/day) across all active cases; each entry: case reference, court, judge/bench, purpose, date/time, assigned attorney; outcome recording post-hearing auto-updates next hearing date; conflict detection for double-booked attorneys; filterable by attorney/court/case type; read-only client-visible subset (next hearing date only). Hearing reminders push to mobile apps as native notifications, deep-linking to the Hearing Detail screen.

### 15.2 Calendar Integration
Hearings, meetings, and reminders sync to **Google Calendar, Apple Calendar, and Outlook Calendar** via OAuth-based per-user connections. Per-user, per-provider enable/disable toggle; disabling stops future pushes without deleting already-synced events. Sync respects role visibility. OAuth tokens stored with the same encryption standard as other credentials (Section 28).

---

## 16. Billing & Invoicing

### 16.1 Core
Time-tracking entry against case/task (billable/non-billable); configurable billing models (hourly/fixed-fee/retainer); auto-draft invoice generation aggregating logged hours + manual line items; approval workflow (Draft → Partner Review/Approve → Sent); payment tracking (partial payments, due dates, overdue alerts); client-facing invoice view; financial reports (revenue by case/client/practice area, outstanding receivables, billable-hours summary).

### 16.2 Expense Management
Tracks the firm's own out-of-pocket costs per matter, separate from client invoicing: **Court Fees, Stamp Duty, Travel, Courier, Printing, Typing, Miscellaneous.** Each entry: matter id, category, amount, date, incurred-by, receipt/attachment (OCR-searchable), billable-to-client flag. **Matter Profitability Report** compares billed/collected revenue against logged expenses + effective billable-hour cost — a true per-matter profitability figure. Full profitability view (revenue vs. internal cost) is Partner-only; Accounts Team logs expenses and sees standard billing reports.

---

## 17. Notifications & Reminders

- Channels: In-app, Email, SMS, native push (Android/iOS)
- Triggers: upcoming/overdue hearing/task, document upload, document-approval stage changes, invoice generated/paid/overdue, case reassignment/status change, new task assigned, new chat message, new office announcement
- Notification center with read/unread status and history
- Daily digest email option for Partners

---

## 18. Dashboards (Role-Specific)

### 18.1 Managing Partner Dashboard
Total active cases, today's hearings, pending tasks, advocate performance, revenue dashboard, outstanding invoices, client registrations, notifications, office announcements.

### 18.2 Advocate Dashboard
*(Associate and Junior Associate, scoped to own assignments.)* My cases, today's hearings, my tasks, pending drafts (documents awaiting their action in the approval workflow), calendar, client messages.

### 18.3 Client Dashboard
My cases, case timeline, next hearing, pending documents, bills & payments, chat with advocate.

### 18.4 Office Staff & Accounts Team Dashboards
Office Staff: hearing calendar overview, pending intake approvals, admin task queue. Accounts Team: outstanding invoices, payment collection trends, revenue by client/case.

---

## 19. Reports & Analytics

Case reports (status, practice area, advocate, duration), financial reports (revenue, receivables, billable-hours), Matter Profitability reports, staff performance reports, hearing outcome reports, tag-based reports (e.g., revenue/caseload by tag). All exportable to PDF/Excel/Word with date-range and custom filters (Section 25).

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

---

## 24. Admin, Settings & Customization Module

User Management, Role & Permission Matrix Editor, Firm Profile & Practice Area Configuration, Office Announcements Composer, Audit Log Viewer — plus no-code customization, **Managing Partner only**:
- **Custom Fields** — add fields to existing entities via a field-builder UI (name, type, applicable entity), no code change.
- **Custom Dropdowns** — define/edit option lists firm-wide (document categories, expense categories, tags, etc.).
- **Custom Practice Areas** — add/rename/retire practice areas, replacing any hardcoded list.
Changes apply immediately across Web, Android, and iOS — pure configuration, no release needed.

---

## 25. Data Import & Export Module

- **Export:** any report, case list, client list, or document set to **PDF, Excel, or Word**.
- **Import:** bulk import of **Clients, Matters, and Contacts** from Excel, for onboarding/migration.
- Flow: template download → upload → validation preview (errors/duplicates/conflict-check integration) → confirm → commit, with a post-import summary logged for audit.
- Import restricted to Managing Partner and Office Staff (Partner approval for bulk creation); export limited to what a role can already see.

---

## 26. Office Management Module (Future Phase)

**Attendance** (daily check-in/out), **Leave Management** (requests, approval, balances), **Employee Records** (designation, joining date, employment type), **Office Announcements** (surfaced on Partner Dashboard and pushed as notifications), **Holiday Calendar** (feeds into hearing/task scheduling).

---

## 27. Recycle Bin & Soft-Delete Policy

No record (Cases, Clients, Documents, Contacts, Tasks, Expenses, etc.) is ever hard-deleted by a normal user action. Deletion soft-deletes the record (`is_deleted`, `deleted_at`, `deleted_by`) into a Recycle Bin view visible **only to the Managing Partner**, who can **restore** or **permanently delete** (irreversible, requires explicit confirmation). Optional auto-purge after a configurable retention period. Every soft-delete/restore/permanent-delete action is captured in the Audit Log.

---

## 28. Security Requirements

RBAC enforced at the API level (shared by Web/Android/iOS); password policy and MFA (mandatory for Partner/Accounts); encrypted data at rest and in transit, including chat messages and OCR text; session management per Section 9 with mobile app-level PIN/biometric lock and remote session revocation; field-level confidentiality (Client never sees internal-only content, Internal Chat, or pre-approval drafts); Internal Chat and Client Chat logically separated; IP allow-listing option for the Web Admin Portal; regular vulnerability scanning and dependency patching, including app-store security compliance; data segregation for multi-branch setups if applicable.

---

## 29. Backup & Audit Logs

Automated daily full + incremental backups (including chat data, OCR text, Knowledge Base items), configurable retention (e.g., 90-day rolling + 3-year monthly archive), periodic restore testing. Documented RTO/RPO with offsite/cloud redundant storage. Immutable audit log of logins, document views/downloads, document-approval decisions at every stage, case reassignments, invoice changes, role changes, data exports, chat thread access, and Recycle Bin actions — retained per compliance period (recommend 7 years, to confirm against applicable legal record-keeping norms). Closed cases retained per statutory limitation periods before archival/deletion consideration; no hard-delete without Partner-level multi-step confirmation (Section 27).

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

**Phase 7 — Extended Functional Layer:** Contact Directory, Expense Management & Matter Profitability, Advanced Conflict Check, Global Search Module, Admin/Customization (Custom Fields/Dropdowns/Practice Areas), Data Import & Export, Recycle Bin & Soft-Delete Policy, Calendar Integration (Google/Apple/Outlook), Tagging System.

**Phase 8 — Hardening & Scale:** MFA, advanced security hardening across all platforms, backup/DR formalization, multi-branch support (if applicable), performance optimization.

**Phase 9 — Intelligence Layer (Future):** AI-assisted features (Section 30), rolled out incrementally from lowest-risk (deadline extraction, judgment summarization, case-law suggestions) to highest-risk (legal drafting, AI legal opinion generation, property title verification).

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

**End of Software Requirements Document — Version 1.0 (Frozen)**
