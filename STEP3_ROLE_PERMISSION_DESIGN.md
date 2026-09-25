# Step 3 — Enterprise Role & Permission Management: Architecture & Design Document

**Status: M1–M4 approved; M6 delivered 2026-08-04 and awaiting Managing Partner review (M5 retired into M2) (see §11's milestone table for exact status). Architecture approved 2026-08-04; the Managing Partner then required nine binding principles incorporated before coding began, reflected throughout this document (Permission.isCoreAdmin and the Managing Partner Safety rule in §9.3, the Audit Log module in §3.16, Search/Reset UI requirements in §6, the audit-event taxonomy in §9.4, and the incremental milestone plan in §11). Implementation proceeds one milestone at a time — full test suite, functional verification, documentation update, and commit after each, stopping for Managing Partner approval before the next. M2 additionally absorbed the route-cutover work originally scoped as M5, per the Managing Partner's explicit direction, and — on review — was required to close its one deferred exception (`PATCH /api/tasks/:id`) before being accepted, since Step 3's mandate is a permission framework with no exceptions. M3 built the full Permission-Management Admin API. M4 built the frontend for all of it (Role Defaults matrix, Employee Overrides, Permission Summary) and, in live browser verification, surfaced a real operational gap — the dev database needed `npm run seed` re-run after the Step 3 migrations, or the Managing Partner's own account got 403'd (§11.1) — now documented as a deployment step, not silently patched over.**

**Scope:** SRD v1.4 Section 8a (Configurable Permissions) and Section 7's `Permission`/`RolePermission`/`UserPermissionOverride` entities, elevated from product-level SRD prose into a concrete, buildable engineering design — grounded in the application's actual current code (every default proposed below was verified against the real route/service behavior as it exists today, not assumed from the SRD's narrative alone; several small discrepancies between the two were found in the process and are called out explicitly rather than silently reconciled).

**Why this document exists before any code:** the Managing Partner's own framing is correct — this is the single piece of infrastructure every future module (Billing, Client Portal, Chat, Knowledge Base, AI, Office Management, Reports) will sit on top of. A schema or evaluation-model mistake here is expensive to unwind later, in a way a mistake in, say, the Hearing Calendar's date-sort order is not. Freezing the design first, the same discipline already applied to the SRD itself, is the right call.

---

## Table of Contents

1. [Database Design](#1-database-design)
2. [Permission Evaluation Flow](#2-permission-evaluation-flow)
3. [Permission Matrix](#3-permission-matrix)
4. [View Scope](#4-view-scope)
5. [Future Compatibility](#5-future-compatibility)
6. [User Interface](#6-user-interface)
7. [Migration Strategy](#7-migration-strategy)
8. [Testing Strategy](#8-testing-strategy)
9. [Security Considerations](#9-security-considerations)
10. [Explicit Non-Goals](#10-explicit-non-goals)
11. [Implementation Milestones](#11-implementation-milestones)

---

## 1. Database Design

Three new tables, additive only — no existing table is altered except `AuditLog`, which needs no schema change at all (it's already generic: `entityType`/`entityId`/`action`/`details` as plain strings, exactly so that a new module like this one can start writing to it without a migration).

### 1.1 `Permission`

The catalogue of everything that *can* be permitted. Rows are seeded by migration/seed script, not created through the UI — the catalogue is code-defined (so it can be reviewed, versioned, and tested like any other schema decision), while *who holds which permission* is what the UI configures.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `key` | `String` | Unique. Namespaced `MODULE.ACTION`, e.g. `CASES.VIEW_ALL`, `TASKS.ASSIGN`. See §3.1 for the naming convention and full catalogue. |
| `module` | `String` | Denormalized copy of the key's module segment. Indexed. Exists so the matrix UI and "all permissions in module X" queries don't need to parse `key` — a cheap redundancy that pays for itself the first time someone renders the Role Defaults screen grouped by module. |
| `action` | `String` | Denormalized copy of the key's action segment (`VIEW_ALL`, `CREATE`, `EDIT`, `DELETE`, `RESTORE`, `PERMANENT_DELETE`, `ASSIGN`, `MANAGE`, etc. — full vocabulary in §3.1). |
| `label` | `String` | Human-readable, shown in the UI ("View All Cases"). |
| `description` | `String?` | Optional longer explanation, shown as a tooltip in the matrix UI when a permission's effect isn't self-evident from its label (e.g. clarifying that `USERS.MANAGE_PERMISSIONS` is what gates this very screen). |
| `isViewScope` | `Boolean` | `true` for the `VIEW_ALL` / `VIEW_ASSIGNED` / `VIEW_OWN` triad on a module (§4). Lets the UI render those three as a linked radio-style group per module instead of three independent checkboxes that could contradict each other. |
| `isCoreAdmin` | `Boolean` | `true` for the 15 permissions that make up the Managing Partner Safety guarantee (§9.3) — Manage Users, Manage Permissions, Manage Settings, Restore/Recycle Bin, and Audit Logs. A schema-level flag rather than a hardcoded list in application code, so the set of protected permissions is visible in the data itself (and in the Role Defaults UI, §6) rather than buried in a constants file only a developer would think to check. |
| `createdAt` | `DateTime` | |

**Constraints:** `@@unique([key])`. **Index:** `@@index([module])`.

### 1.2 `RolePermission`

The **default** permission set for each of the five fixed staff roles (`UserRole` — reusing the existing enum; see §10 for why roles themselves stay fixed). Seeded as a **dense matrix**: every `(role, permission)` pair gets a row at seed time, `granted` true or false per the catalogue in §3. This is a deliberate choice over a sparse "presence = granted" table — it means the Role Defaults screen is a single query returning every cell of the matrix, already-populated, ready to render; and the evaluator (§2) never has to reason about "no row exists" as a distinct case from "row exists with `granted: false`" for a *role* default (only `UserPermissionOverride`, which is genuinely sparse, has that ambiguity, and it's resolved explicitly — see §2).

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `role` | `UserRole` | The existing Prisma enum — `MANAGING_PARTNER` / `ASSOCIATE` / `JUNIOR_ASSOCIATE` / `OFFICE_STAFF` / `ACCOUNTS_TEAM`. Not a new `Role` table (see §10). |
| `permissionId` | `String` | FK → `Permission.id` |
| `granted` | `Boolean` | The role's default for this permission. |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `updatedById` | `String?` | FK → `User.id`. Null only for the initial seed (system-set); every subsequent edit is Managing-Partner-attributed. |

**Constraints:** `@@unique([role, permissionId])` — exactly one row per role×permission. **Indexes:** `@@index([role])` (the evaluator's hot lookup path), `@@index([permissionId])`.

### 1.3 `UserPermissionOverride`

A per-employee exception. Unlike `RolePermission`, this table is genuinely sparse — most employees will have zero rows here, matching SRD §8a's framing of overrides as the exception, not the rule.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK → `User.id` |
| `permissionId` | `String` | FK → `Permission.id` |
| `effect` | `GRANT \| REVOKE` (new enum) | `GRANT` = allow even if the role default is `false`; `REVOKE` = deny even if the role default is `true`. |
| `reason` | `String` | **Mandatory** — SRD §8a.3 requires a reason on every override. Enforced at the API validation layer, not just a UI hint. |
| `setById` | `String` | FK → `User.id`. Who made the change — in practice always a Managing Partner given the route gate (§9), but stored explicitly rather than inferred, so the audit trail is self-contained even if the gating rule ever changes. |
| `setAt` | `DateTime` | `@default(now())` |

**Constraints:** `@@unique([userId, permissionId])` — at most one active override per (user, permission). **Removing** an override (reverting that one permission to the role default, per SRD §8a.3) is a **row delete**, not a soft-delete or a third "NONE" effect value — the permission-override table is not one of the SRD §27 Recycle-Bin-tracked entities (Cases/Clients/Documents/Tasks/Contacts/Expenses, etc.), and the change is permanently preserved anyway via the `AuditLog` entry written at the moment of deletion (§9) — the *event* is what needs to survive, not the row. **Indexes:** `@@index([userId])` (the evaluator's hot lookup path — "all of this user's overrides"), `@@index([permissionId])`.

### 1.4 Relationships

```
User ──(role: UserRole enum, not a FK)── shared by many RolePermission rows
User ──1:N── UserPermissionOverride ──N:1── Permission
Permission ──1:N── RolePermission
Permission ──1:N── UserPermissionOverride
RolePermission / UserPermissionOverride writes ──1:N── AuditLog (entityType "RolePermission" / "UserPermissionOverride")
```

`Client` participates in none of this — SRD §8a.4 explicitly excludes clients, and nothing here changes their existing fixed-access model.

### 1.5 Why not a `Role` table?

`RolePermission.role` stays the existing `UserRole` enum rather than becoming a foreign key to a new, admin-creatable `Role` table. This is a deliberate scope boundary, not an oversight — see §10 (Non-Goals) for the reasoning and the documented migration path if the firm ever does want custom, admin-defined roles later.

### 1.6 Scalability

- **New module, new permissions:** a future module (Billing, say) needs zero schema change here — it just means more `Permission` rows and more `RolePermission` rows at seed time. §5 walks through this concretely.
- **Query cost stays flat as the catalogue grows:** the evaluator (§2) loads *one user's* effective permission set per request — bounded by "permissions this role/user actually has," not by the total size of the catalogue. A catalogue of 200 permissions across 15 modules costs the same per-request lookup as one of 40 permissions across 5 modules, because both queries are indexed on `role`/`userId`, not scanned.
- **The dense `RolePermission` matrix does grow with the catalogue** (5 roles × N permissions), but at the scale this system will ever reach — low hundreds of permission keys — that's a few thousand rows, trivial for Postgres and for rendering a matrix UI (which already needs to show every cell regardless).

---

## 2. Permission Evaluation Flow

### 2.1 Principle

Every permission check resolves an **effective permission** for `(user, permissionKey)`, entirely server-side, on every request — never inferred from, or trusted from, anything the client sends. This is the same principle already stated in SRD §28 ("never trust client-side hiding alone") and already practiced throughout this codebase's row-level authorization (`utils/authorization.ts`); Step 3 doesn't introduce a new principle, it generalizes an existing one from "is this role in a hardcoded allowlist" to "does this user currently hold this permission."

### 2.2 Resolution order

```
resolveEffectivePermission(userId, role, permissionKey):

  1. UserPermissionOverride exists for (userId, permissionKey)?
       ├─ Yes, effect = GRANT   → ALLOWED   (stop)
       └─ Yes, effect = REVOKE  → DENIED    (stop)

  2. No override — RolePermission exists for (role, permissionKey)?
       ├─ Yes, granted = true   → ALLOWED   (stop)
       └─ Yes, granted = false  → DENIED    (stop)

  3. Neither exists (should not happen once seeding is complete — see §7,
     defensive fallback only) → DENIED (fail-closed, never fail-open)
```

This is exactly the flow the Managing Partner's request sketched, made precise: **override always wins when present; role default otherwise; deny if the system is ever missing data for a permission it should have seeded.**

### 2.3 Where this runs

```
Incoming request, JWT already verified (existing requireAuth middleware)
        │
        ▼
  actor.actorType === "CLIENT"?
        │
       Yes ──────────────────────────► Step 3 does not apply. The existing
        │                                requireClient / client-scoped routes
        │No                              and Section 3.6 access model are
        ▼                                completely untouched (SRD §8a.4).
  loadEffectivePermissions(actor)
  — one indexed query pass (RolePermission
    for actor.role UNION/overridden-by
    UserPermissionOverride for actor.sub),
    resolved into a single flat Set<string>
    of granted permission keys, attached to
    req.effectivePermissions for the
    lifetime of this request
        │
        ▼
  requirePermission("<MODULE>.<ACTION>")   ← new middleware, same shape as
        │                                     today's requireRole(...roles)
   key in req.effectivePermissions?
        │                    │
       Yes                   No
        │                    │
        ▼                    ▼
   next() → controller   403 + PERMISSION_DENIED security log
                          (existing logSecurityEvent pattern from
                          middleware/rbac.ts, unchanged)
```

`loadEffectivePermissions` runs **once per request**, not once per permission check, because a single request routinely needs to answer more than one permission question (e.g. a Case Detail page load implicitly asks "can view," and rendering the Delete button asks "can delete," and both should be answered without two round-trips to the database). A staff member's total granted-permission count is small — dozens, not thousands — so eager whole-set loading into an in-memory `Set` is simpler than, and performs identically to, lazy per-key caching within a request.

### 2.4 View-scoped list/search endpoints

A single allow/deny isn't enough for a list endpoint — "can you view cases" has three possible answers today (all of them, your assigned ones, or none), and the service layer needs to know which, to build the right Prisma `where` clause. This is §4's subject in full; the evaluation flow's role here is just to supply the answer cheaply, from the same `req.effectivePermissions` set already loaded in §2.3 — no second database round-trip:

```
resolveViewScope(req, "CASES"):
  "CASES.VIEW_ALL"      in req.effectivePermissions → scope = ALL
  "CASES.VIEW_ASSIGNED" in req.effectivePermissions → scope = ASSIGNED
  "CASES.VIEW_OWN"      in req.effectivePermissions → scope = OWN
  none of the above                                  → scope = NONE
```

### 2.5 What replaces what

| Today | After Step 3 |
|---|---|
| `requireRole("MANAGING_PARTNER", "ASSOCIATE")` on a route | `requirePermission("CASES.EDIT")` on the same route |
| `caseScopeWhere(actor)` checking a hardcoded `CASE_UNRESTRICTED_ROLES` array | `resolveViewScope(req, "CASES")` deciding `ALL` vs `ASSIGNED`, then the **same** existing Prisma OR-filter (`{ partnerId: actor.sub }` / `{ advocates: { some: { userId: actor.sub } } }`) is applied when the scope is `ASSIGNED` — the filter logic itself is untouched, only the thing that decides *which* filter applies changes |
| `requireStaff` (staff vs client) | Unchanged — that distinction is orthogonal to permissions and stays exactly as-is |

---

## 3. Permission Matrix

### 3.1 Naming convention

Every permission key is `MODULE.ACTION`, both segments `UPPER_SNAKE_CASE`. This refines SRD §8a.2's flat list (`VIEW_ALL_CASES`, `CREATE_CASES`, …) into a structured, module-namespaced form — nothing in the current codebase references the flat names (verified: Step 3 hasn't been built yet, so there's no migration cost to this refinement), and namespacing is what makes the matrix UI, the "all permissions in module X" queries, and a catalogue that will eventually span 15+ modules manageable. A cross-reference from every SRD §8a.2 flat name to its namespaced equivalent is given inline in the tables below.

**Action vocabulary** (not every module uses every action — each module's applicable actions are listed in its own table):

| Action | Meaning |
|---|---|
| `VIEW_ALL` | See every record in the module, unscoped. |
| `VIEW_ASSIGNED` | See only records linked to the user (case-assigned, client-linked to an accessible case, etc.) — mirrors today's `caseScopeWhere`/`clientScopeWhere` "assigned" branch. |
| `VIEW_OWN` | See only records the user personally owns (their own tasks, their own uploads) — a narrower tier than `VIEW_ASSIGNED`, used where the module has a meaningful "mine" concept independent of case assignment. |
| `CREATE` | Add a new record. |
| `EDIT` | Modify an existing record's fields. |
| `CHANGE_STATUS` | Transition a record's lifecycle status — kept separate from `EDIT` only where the app already gates it as a distinct action today (Case status, Client status). |
| `ASSIGN` | Reassign a record's owner/assignee (Task reassignment; Case advocate management uses its own `MANAGE_ADVOCATES` action instead, since it's additive not reassignment). |
| `MANAGE_ADVOCATES` | Case-specific: add/remove advocates on a case. |
| `DELETE` | Soft-delete (send to Recycle Bin) — SRD §27. |
| `RESTORE` | Restore a soft-deleted record — SRD §27, Managing-Partner-only by default. |
| `PERMANENT_DELETE` | Irreversibly delete from the Recycle Bin — SRD §27, Managing-Partner-only by default. |
| `APPROVE` | Move a record through an approval workflow. **Reserved** — no module uses this yet; the Document Approval Workflow (SRD Phase 4) will be its first consumer. |
| `EXPORT` | Export data out of the system. **Reserved** — Data Import/Export (SRD Phase 7). |
| `MANAGE` | Administrative control over a module's own configuration (Settings/dropdowns, Permissions themselves). |

`PRINT`, named explicitly in the request, is deliberately **not** modeled as its own backend permission: printing is "render what you can already view, formatted for paper," a frontend concern layered on an existing `VIEW_*` grant, not a distinct authorization boundary. If a future need arises to *track* who printed what (e.g. a confidentiality audit requirement), that's better served by an `AuditLog` entry on print, gated by the existing `VIEW` permission, than by a whole new permission axis — noted here as a considered decision, not an oversight.

### 3.2 How the tables below were built

Each module's proposed defaults are **reverse-engineered from the application's actual current route and service-layer behavior**, verified by reading every `*.routes.ts` file and, where a route carries no `requireRole` at all, the corresponding `*.service.ts` to confirm nothing else gates it. This precision is what makes §7's "no behavior change on adoption" a checkable claim rather than an assumption. Several places where the running code is *more permissive* than the SRD's narrative description are flagged inline — these are pre-existing conditions, not introduced by this design, and are called out for the Managing Partner's awareness; fixing them (tightening a default beyond today's actual behavior) is a decision for after Step 3 ships, made deliberately through the Role Defaults screen rather than silently baked into the migration.

**Legend:** ✅ granted by default · ❌ denied by default. (SRD §8's `➖` "partial/conditional" almost always resolves to "granted at a narrower action or scope" once broken into individual permission keys — e.g. Associate's `➖` for invoice approval becomes `MANAGE_BILLING` granted but `APPROVE` denied, once Billing exists.)

### 3.3 Dashboard

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `DASHBOARD.VIEW` | View Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |

No route gate exists on the Dashboard today (any authenticated staff member reaches it) — default reflects that. Its *content* stays individually scoped by each underlying module's own view-scope (e.g. a Junior Associate's task breakdown is naturally limited by `TASKS.VIEW_OWN`), so `DASHBOARD.VIEW` being universal doesn't widen what data anyone actually sees.

### 3.4 Cases

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `CASES.VIEW_ALL` | View All Cases | ✅ | ❌ | ❌ | ✅ | ❌ |
| `CASES.VIEW_ASSIGNED` | View Assigned Cases | — | ✅ | ✅ | — | ✅¹ |
| `CASES.CREATE` | Create Case | ✅ | ✅ | ❌ | ✅ | ❌ |
| `CASES.EDIT` | Edit Case Details | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CASES.CHANGE_STATUS` | Change Case Status/Stage | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CASES.MANAGE_ADVOCATES` | Add/Remove Advocates | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CASES.DELETE` | Delete Case (soft) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CASES.RESTORE` | Restore Case | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CASES.PERMANENT_DELETE` | Permanently Delete Case | ✅ | ❌ | ❌ | ❌ | ❌ |

¹ Accounts Team gets `CASES.VIEW_ASSIGNED` granted (not blocked) today — but since an Accounts Team member is never a case partner/advocate, the existing OR-filter always returns zero rows for them. This is current behavior exactly (the route has no role restriction beyond `requireStaff`), preserved as-is; SRD §8's "❌ (billing-linked only)" framing describes an intended future refinement (case visibility scoped to billing-linked matters), not what's coded today.

**Known, separately-tracked gap (not addressed by Step 3):** Office Staff's `CASES.VIEW_ALL` default matches today's code exactly, but TODO.md item #5 already flags that Office Staff's view isn't field-redacted to "metadata only" as SRD §3.4 describes — Step 3's permission model controls *whether* a role can view a case, not *which fields* of it. Field-level redaction is a different mechanism and stays an open item.

### 3.5 Clients

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `CLIENTS.VIEW_ALL` | View All Clients | ✅ | ❌ | ❌ | ✅ | ✅ |
| `CLIENTS.VIEW_ASSIGNED` | View Case-Linked Clients | — | ✅ | ✅ | — | — |
| `CLIENTS.CREATE` | Create Client | ✅ | ❌ | ❌ | ✅ | ❌ |
| `CLIENTS.EDIT` | Edit Client Profile | ✅ | ✅ | ❌ | ✅ | ❌ |
| `CLIENTS.CHANGE_STATUS` | Change Client Status | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CLIENTS.DELETE` | Delete Client (soft) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CLIENTS.RESTORE` | Restore Client | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CLIENTS.PERMANENT_DELETE` | Permanently Delete Client | ✅ | ❌ | ❌ | ❌ | ❌ |

Note `CLIENTS.CREATE`: today only Managing Partner and Office Staff can create clients — Associates cannot, despite being able to create Cases. Preserved exactly.

### 3.6 Tasks

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `TASKS.VIEW_ALL` | View All Tasks (firm-wide) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `TASKS.VIEW_ASSIGNED` | View Tasks on Accessible Cases | ✅ | ✅ | ✅ | ✅² | ❌ |
| `TASKS.VIEW_OWN` | View My Tasks | ✅ | ✅ | ✅ | ✅ | ✅ |
| `TASKS.CREATE` | Create Task | ✅ | ✅ | ❌ | ❌ | ❌ |
| `TASKS.EDIT` | Edit Task Details | ✅ | ✅ | ✅ | ✅² | ❌ |
| `TASKS.CHANGE_STATUS` | Update Task Status | ✅ | ✅ | ✅ | ✅² | ❌ |
| `TASKS.ASSIGN` | Reassign Task | ✅ | ✅ | ✅ | ✅² | ❌ |
| `TASKS.DELETE` | Delete Task (soft) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `TASKS.RESTORE` | Restore Task | ✅ | ❌ | ❌ | ❌ | ❌ |
| `TASKS.PERMANENT_DELETE` | Permanently Delete Task | ✅ | ❌ | ❌ | ❌ | ❌ |

² **Real finding, flagged for visibility:** `PATCH /api/tasks/:id` today carries **no `requireRole` restriction at all** — any staff role that can reach a task (its assignee, or anyone with case access) can edit, change status, *and reassign* it. Because Office Staff is case-unrestricted (§3.4), this means **Office Staff can currently edit, status-change, or reassign any task in the firm**, not just administrative ones, despite SRD §3.4's narrower "administrative support" framing. `TASKS.EDIT`/`TASKS.CHANGE_STATUS`/`TASKS.ASSIGN` defaults above preserve this exactly (all three ✅ for Office Staff) — tightening it is a legitimate post-Step-3 policy decision for the Managing Partner to make deliberately through the Role Defaults screen, not something this migration silently changes. `TASKS.CHANGE_STATUS` was split out from `TASKS.EDIT` after the initial M2 cutover, once `PATCH /api/tasks/:id` itself was migrated to body-aware permission enforcement (§11's M2 entry) — status changes previously had no distinct key, sharing `TASKS.EDIT`'s "no gate at all" behavior, and needed their own so a status-change request and a field-edit request could be authorized independently.

`Jr Assoc` gets `TASKS.EDIT`/`TASKS.CHANGE_STATUS`/`TASKS.ASSIGN` granted at the same broad scope as Associate today, for the same reason (no route-level restriction) — narrower than the SRD's "execute only" framing for Junior Associates, and the same applies here: preserved as current behavior, revisitable afterward.

**The own-assignee workflow** — a task's assignee has always been able to act on their own task even without case-level access (`assertTaskAccess`'s assignee bypass, SRD §6.6) — is preserved under the permission framework by tying it to `TASKS.VIEW_OWN` (universally granted today) rather than leaving it as an unconditional code-level exception: `PATCH /api/tasks/:id` grants an action if the actor holds the broad `TASKS.<ACTION>` permission **or** is the task's own assignee and holds `TASKS.VIEW_OWN`. Since every role holds `TASKS.VIEW_OWN` today, this is behaviorally identical to "the assignee can always act on their own task" — but it is now a real, revocable grant (a future role whose `TASKS.VIEW_OWN` is revoked would also lose this), not a bypass invisible to the permission system. Row-level authorization (`assertTaskAccess`) is unchanged and still runs first — a caller with no case access and no assignment to the task 404s before the permission check is ever reached.

### 3.7 Hearings

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `HEARINGS.VIEW` | View Hearings | ✅ | ✅ | ✅ | ✅ | ❌³ |
| `HEARINGS.CREATE` | Schedule Hearing | ✅ | ✅ | ❌ | ❌ | ❌ |
| `HEARINGS.EDIT` | Reschedule / Record Outcome | ✅ | ✅ | ❌ | ❌ | ❌ |

³ Same case-scope mechanism as Cases/Tasks — Accounts Team's `HEARINGS.VIEW` would be granted-but-empty if seeded ✅ (never a case partner/advocate); marked ❌ here instead since, unlike Cases, Accounts has no legitimate billing reason to see hearings at all, matching SRD's intent cleanly with no behavior-preservation conflict (the route itself has no explicit block today, so this is the one place in this table where the proposed default is *slightly* narrower than literal current code — flagged, not hidden).

No soft-delete exists for Hearings yet (not one of the four Step 2 entities) — no `DELETE`/`RESTORE`/`PERMANENT_DELETE` rows here. See §5 for how trivially that would be added later.

### 3.8 Case Notes

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `CASE_NOTES.VIEW` | View Case Notes / Diary | ✅ | ✅ | ✅ | ✅⁴ | ❌ |
| `CASE_NOTES.CREATE` | Add Case Note | ✅ | ✅ | ✅ | ❌ | ❌ |

⁴ **Real finding:** `GET /api/cases/:caseId/notes` has no `requireRole` (only `requireStaff` + case-scope) — Office Staff can currently *view* case notes/diary entries, even though SRD §3.4 says Office Staff has "no access to case strategy notes." Preserved as current behavior; the SRD narrative appears to have been written for a stricter model than what actually shipped in Step 1. Worth a deliberate look during Step 3's rollout review.

No `EDIT`/`DELETE` actions — notes are immutable today (chronological diary entries, by design, per SRD §7), so the catalogue doesn't invent actions the app doesn't support. Adding note-editing later would just mean adding `CASE_NOTES.EDIT`/`.DELETE` rows — no Step 3 redesign.

### 3.9 Documents

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `DOCUMENTS.VIEW` | View Documents | ✅ | ✅ | ✅ | ✅ | ❌⁵ |
| `DOCUMENTS.UPLOAD` | Upload / Add Version | ✅ | ✅ | ✅ | ✅⁶ | ✅⁶ |
| `DOCUMENTS.DELETE` | Delete Document (soft) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `DOCUMENTS.RESTORE` | Restore Document | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DOCUMENTS.PERMANENT_DELETE` | Permanently Delete Document | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DOCUMENTS.APPROVE` | Approve Document (reserved) | — | — | — | — | — |

⁵ Same case-scope reasoning as Hearings — Accounts denied by default proposal despite no explicit route block today, since a case-unrestricted role isn't at play here (Accounts was never in `CASE_UNRESTRICTED_ROLES`, so this one *is* a straight preservation of current behavior, not a tightening).

⁶ **Real finding, the most significant one in this review:** neither `POST /api/cases/:caseId/documents` (upload) nor `POST /api/documents/:id/versions` (new version) carries `requireRole` — **any** staff role, including Junior Associate, Office Staff, and Accounts Team, can currently upload a document or a new version to any case they have access to. This is broader than SRD §3.4/§3.5's narrative (Office Staff "scanned documents only," Accounts Team "no access to case documents" at all). `DOCUMENTS.UPLOAD` defaults above preserve this exactly for every role that can reach a case at all — this is the single clearest candidate the Managing Partner may want to tighten via the Role Defaults screen once Step 3 ships, and is flagged here specifically so that decision is made deliberately rather than discovered by accident later.

`DOCUMENTS.APPROVE` is seeded into the catalogue with no defaults yet meaningfully assignable — no Document Approval Workflow exists to approve anything through. See §5.

### 3.10 Calendar

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `CALENDAR.VIEW` | View Hearing Calendar | ✅ | ✅ | ✅ | ✅ | ❌ |

A thin, independently-toggleable view over the same underlying hearing data as §3.7 (kept as its own key, not collapsed into `HEARINGS.VIEW`, per the "module-wise granular permissions" requirement — a firm might reasonably want, say, Office Staff to manage the calendar without seeing hearing outcome notes elsewhere, even though today both default identically). No create/edit actions of its own — scheduling happens through the Hearings module (Case Detail's Hearings tab), not the Calendar page itself.

### 3.11 Employee Task Audit

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `EMPLOYEE_AUDIT.VIEW` | View Employee Task Audit | ✅ | ❌ | ❌ | ❌ | ❌ |

Matches today's route exactly (`requireRole("MANAGING_PARTNER")` on `GET /api/tasks/audit/:userId`).

### 3.12 Recycle Bin

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `RECYCLE_BIN.VIEW` | View Recycle Bin | ✅ | ❌ | ❌ | ❌ | ❌ |

This key gates only *seeing the combined cross-entity list* (`GET /api/recycle-bin`). Restoring or permanently deleting a specific record is gated by **that record's own module permission** (`CASES.RESTORE`, `DOCUMENTS.PERMANENT_DELETE`, etc. — §3.4/§3.5/§3.6/§3.9) — mirroring exactly how `recycleBin.service.ts` is actually built today (Step 2): one shared list/UI surface, but a `switch` over entity type doing the real per-entity work underneath. Step 3's permission model follows that same shape rather than inventing a separate, parallel "Recycle Bin permission" per entity type. All are Managing-Partner-only by default today, so in practice this distinction doesn't change any current behavior — it only matters once/if the Managing Partner later decides, say, an Associate should be able to restore Documents but not Cases from the bin, which the model already supports with no redesign.

**`isCoreAdmin`:** `RECYCLE_BIN.VIEW` and every `.RESTORE`/`.PERMANENT_DELETE` key across Cases/Clients/Documents/Tasks are flagged `isCoreAdmin: true` (§1.1, §9.3) — the "Restore/Recycle Bin" leg of the Managing Partner Safety guarantee.

### 3.13 Users

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `USERS.VIEW` | View User Accounts (admin list) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USERS.VIEW_DIRECTORY` | Staff Directory (name/role lookup) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `USERS.CREATE` | Create User Account | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USERS.EDIT_STATUS` | Activate/Deactivate User | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USERS.FORCE_LOGOUT` | Force Logout (all devices) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USERS.MANAGE_PERMISSIONS` | Manage Roles & Permissions | ✅ | ❌ | ❌ | ❌ | ❌ |

`USERS.VIEW` (the full admin account list, `GET /api/auth/users`) is distinct from `USERS.VIEW_DIRECTORY` (the lightweight id/name/role lookup used by assignment pickers, `GET /api/auth/staff-directory`, open to every staff role today) — collapsing them would either lock non-Partners out of assignment pickers or open the full admin list to everyone; keeping them separate preserves both current behaviors exactly. `USERS.MANAGE_PERMISSIONS` is new (it gates Step 3's own screen) — see §9 for why it carries an extra, non-configurable safeguard on top of the normal permission system.

**`isCoreAdmin`:** `USERS.VIEW`, `USERS.CREATE`, `USERS.EDIT_STATUS` (the "Manage Users" leg) and `USERS.MANAGE_PERMISSIONS` (the "Manage Permissions" leg) are flagged `isCoreAdmin: true` (§1.1, §9.3). `USERS.VIEW_DIRECTORY` and `USERS.FORCE_LOGOUT` are not — the guarantee covers the ability to administer accounts and permissions, not every Users-module action.

`GET /api/auth/sessions/me` (view my own sessions) stays **outside** the permission system entirely — it's inherently "your own data," has no role gate today, and doesn't fit the module-permission model any more meaningfully than, say, "can I see my own name" would.

### 3.14 Settings

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `SETTINGS.VIEW` | View Dropdown Values | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SETTINGS.MANAGE` | Manage Dropdown Values | ✅ | ❌ | ❌ | ❌ | ❌ |

Matches today's picklists routes exactly (`GET` open to any staff, `POST`/`PATCH` Managing-Partner-only).

**`isCoreAdmin`:** `SETTINGS.MANAGE` is flagged `isCoreAdmin: true` — the "Manage Settings" leg.

### 3.15 Audit Log *(reserved — no dedicated viewer screen yet)*

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `AUDIT_LOG.VIEW_ALL` | View Full Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ |
| `AUDIT_LOG.VIEW_OWN` | View Own Action History | ❌ | ❌ | ❌ | ❌ | ✅ |

No dedicated Audit Log Viewer screen exists in the application yet (SRD's Section 7 admin console list — "User Management, Role & Permission Management, Firm Profile & Practice Area Configuration, Office Announcements Composer, **Audit Log Viewer**" — puts it alongside Step 3 itself, still unbuilt beyond what Task History/Employee Task Audit already surface as *derived* views over the same underlying `AuditLog` table). This module is added to the catalogue now, ahead of that screen being built, for one specific reason: the Managing Partner's Step 3 principles require "Audit Logs" to be one of the always-recoverable core-administrative capabilities (§9.3), and that guarantee needs a real permission key to protect even before there's a UI to exercise it. Defaults follow SRD §8's existing "View audit logs: MP ✅, Accounts ➖ (own actions)" row. **`isCoreAdmin`:** `AUDIT_LOG.VIEW_ALL` is flagged `true` (`AUDIT_LOG.VIEW_OWN` is not — it's a narrower, self-scoped grant unrelated to the administrative-recoverability guarantee).

### 3.16 Reports *(reserved — not yet built)*

| Key | Label | MP | Assoc | Jr Assoc | Office Staff | Accounts |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `REPORTS.VIEW` | View Reports | ✅ | ❌ | ❌ | ❌ | ✅ |
| `REPORTS.EXPORT` | Export Reports | ✅ | ❌ | ❌ | ❌ | ✅ |

No Reports module or routes exist in the application yet (SRD Phase 3/5 scope). These rows are seeded now — at provisional defaults matching SRD §8's "Firm-wide financial reports: MP ✅, Accounts ➖" row — precisely to demonstrate §5's future-compatibility claim: when Reports is eventually built, it consumes an already-seeded catalogue entry rather than requiring any Step 3 schema or evaluator change. No route currently enforces these keys against anything.

### 3.17 Summary table (all modules, at a glance)

| Module | Actions modeled |
|---|---|
| Dashboard | VIEW |
| Cases | VIEW_ALL, VIEW_ASSIGNED, CREATE, EDIT, CHANGE_STATUS, MANAGE_ADVOCATES, DELETE, RESTORE*, PERMANENT_DELETE* |
| Clients | VIEW_ALL, VIEW_ASSIGNED, CREATE, EDIT, CHANGE_STATUS, DELETE, RESTORE*, PERMANENT_DELETE* |
| Tasks | VIEW_ALL, VIEW_ASSIGNED, VIEW_OWN, CREATE, EDIT, CHANGE_STATUS, ASSIGN, DELETE, RESTORE*, PERMANENT_DELETE* |
| Hearings | VIEW, CREATE, EDIT |
| Case Notes | VIEW, CREATE |
| Documents | VIEW, UPLOAD, DELETE, RESTORE*, PERMANENT_DELETE*, APPROVE (reserved) |
| Calendar | VIEW |
| Employee Audit | VIEW |
| Recycle Bin | VIEW* (per-entity RESTORE/PERMANENT_DELETE live on that entity's own module) |
| Users | VIEW*, VIEW_DIRECTORY, CREATE*, EDIT_STATUS*, FORCE_LOGOUT, MANAGE_PERMISSIONS* |
| Settings | VIEW, MANAGE* |
| Audit Log (reserved) | VIEW_ALL*, VIEW_OWN |
| Reports (reserved) | VIEW, EXPORT |

`*` = flagged `isCoreAdmin: true` (§9.3). **Total: 14 modules, 54 concrete permission keys** (53 at initial seed + `TASKS.CHANGE_STATUS`, added when M2 completed body-aware authorization for `PATCH /api/tasks/:id` — see §11), of which 4 (the two Reports keys and `AUDIT_LOG.VIEW_ALL`/`VIEW_OWN`) are unenforced by any route until those screens exist, and **15 keys carry the `isCoreAdmin` flag**.

---

## 4. View Scope

### 4.1 The three tiers

| Tier | Meaning | Existing mechanism it generalizes |
|---|---|---|
| `VIEW_ALL` | No scope filter — every record in the module. | Today's `CASE_UNRESTRICTED_ROLES`/`CLIENT_UNRESTRICTED_ROLES` hardcoded arrays in `utils/authorization.ts`. |
| `VIEW_ASSIGNED` | Records linked to the user through some relationship (case partner/advocate, client linked to an accessible case). | Today's `caseScopeWhere`/`clientScopeWhere` OR-filter branch. |
| `VIEW_OWN` | Records the user personally owns, independent of any case link (their own tasks, their own uploads). | Today's `assignedToId: actor.sub` filter in `myTasks`. |

### 4.2 How a module wires into it

The service layer keeps full ownership of *what the Prisma `where` clause looks like* for each tier — Step 3 only decides *which tier applies*, replacing a hardcoded role check with a permission lookup:

```
function scopeWhereFor(module, tier, actor):
  switch (tier):
    ALL      → {}                                    (module-specific, usually empty)
    ASSIGNED → <module's existing OR-filter>          (e.g. caseScopeWhere's OR clause,
                                                        UNCHANGED from today)
    OWN      → <module's existing "mine" filter>      (e.g. { assignedToId: actor.sub },
                                                        UNCHANGED from today)
    NONE     → deny entry (403) or an empty result,
               per module — in practice unreachable,
               since a route requiring at least one
               VIEW_* permission to be entered at all
               (via requirePermission) should never let
               a NONE-scope actor this far
```

`resolveViewScope(req, module)` (§2.4) picks the tier; the module's own, already-written filter logic runs unmodified once the tier is chosen. This is the concrete reason §7's migration can be a pure swap rather than a rewrite: the *filters* aren't touched, only the thing that selects among them.

### 4.3 Not every module needs all three tiers

A module only defines the `VIEW_*` keys it actually needs (§3's summary table shows this per module) — Documents and Hearings, for instance, have no independent `VIEW_OWN` concept today (no route exposes "documents I personally uploaded" as its own filtered view), so they only carry `VIEW` (a single, always-scoped-through-the-parent-case tier, functionally closest to `ASSIGNED` but simple enough not to need three separate keys). Forcing every module into the full three-tier shape regardless of whether the underlying data model supports it would be exactly the kind of premature abstraction this project's engineering standards avoid — the tier vocabulary is available to every module, not mandatory for every module.

### 4.4 Consistency guarantee

Because every module's view-scope decision runs through the same `resolveViewScope` function reading the same `req.effectivePermissions` set, the *rule* ("override wins, then role default, then deny") is identical everywhere by construction — there is no way for one module to accidentally implement a different precedence order than another, the way today's hand-written `CASE_UNRESTRICTED_ROLES` vs `CLIENT_UNRESTRICTED_ROLES` arrays could in principle drift out of sync with each other (they haven't, but nothing today prevents it; Step 3 removes that risk structurally).

---

## 5. Future Compatibility

The claim to verify: a future module should integrate into this architecture by **adding rows, not redesigning tables or the evaluator**. Three concrete walkthroughs:

### 5.1 Billing (SRD Phase 3)

When Billing is built: add `Permission` rows (`BILLING.VIEW_ALL`, `BILLING.VIEW_ASSIGNED`, `BILLING.CREATE_INVOICE`, `BILLING.APPROVE_INVOICE`, `BILLING.LOG_TIME`, `BILLING.LOG_EXPENSE`, …) via the seed script, extend `RolePermission` with their defaults (straight off SRD §8's existing Billing row — MP ✅ approve, Associate ➖ draft-only becomes `CREATE_INVOICE` ✅ / `APPROVE_INVOICE` ❌, Accounts ✅ full), wire `requirePermission("BILLING.CREATE_INVOICE")` onto the new route exactly like every existing route does today. Nothing in `Permission`, `RolePermission`, `UserPermissionOverride`, or the evaluator changes.

### 5.2 Client Portal (SRD Phase 5)

The Client Portal is the one place worth flagging explicitly: it's **client-facing**, and SRD §8a.4 already excludes Clients from this entire override system. The Client Portal's access model stays exactly what SRD §3.6 already defines (fixed, not configurable) — it does **not** get `Permission`/`RolePermission` rows at all. This is a boundary the design respects deliberately rather than one it forgot to consider: not every future module needs to (or should) plug into staff RBAC.

### 5.3 Chat (SRD Phase 4)

Internal Chat and Client Chat need `CHAT.VIEW`, `CHAT.SEND`, `CHAT.MANAGE_THREAD` (archiving, etc.) as new `Permission` rows, following SRD §8's existing Chat row for defaults. The one new wrinkle Chat introduces — thread-level participant scoping ("only participants in this specific thread") — is a **finer-grained** scope than any of `VIEW_ALL`/`VIEW_ASSIGNED`/`VIEW_OWN` naturally express, since thread membership isn't a property of the user's role or a case-link, it's per-thread state. This is called out honestly: Chat will likely need its own `ChatThread.participants` check *in addition to* `CHAT.VIEW` (the permission answers "can this user use Chat at all," the participant list answers "which threads specifically") — the same layering already used today, where `CASES.VIEW_ASSIGNED` answers "can this role see assigned cases at all" and the case's own `partnerId`/`advocates` relationship answers "assigned to *this* case." No new architectural concept, just the same pattern applied one level deeper.

### 5.4 Knowledge Base, AI, Office Management

- **Knowledge Base:** `KNOWLEDGE_BASE.VIEW`/`.PUBLISH`, straightforward module rows per SRD §8's existing row.
- **AI-assisted features** (SRD §2 goal 8): the recommended pattern is that an AI feature **inherits** the permission of the resource it operates on, rather than becoming its own permission axis — e.g. "AI-drafted case summary" is gated by `CASES.VIEW_ASSIGNED`/`VIEW_ALL` (whatever already governs seeing that case), not a new `AI.VIEW_SUMMARIES` key. This is a forward-looking design note, not a decision that needs to be finalized now — flagged so a future AI feature doesn't accidentally bolt on a parallel, redundant permission system.
- **Office Management** (attendance, leave, announcements): `OFFICE.VIEW_ATTENDANCE`, `OFFICE.MANAGE_LEAVE`, `OFFICE.POST_ANNOUNCEMENT`, etc. — same additive pattern, no surprises.

### 5.5 The general recipe

For any future module: **(1)** add its `Permission` rows, **(2)** seed `RolePermission` defaults for the five roles, **(3)** call `requirePermission`/`resolveViewScope` from its routes/services exactly like every existing module will after §7's cutover. Steps (1) and (2) are seed-script/migration work; step (3) is two function calls per route. This mirrors, almost verbatim, the extension recipe Step 2's own `recycleBin.service.ts` already documents for adding a fifth soft-deletable entity — Step 3 is designed to be the second example of that same "generic by convention, not by forcing everything through one polymorphic abstraction" pattern this codebase already established.

---

## 6. User Interface

Managing-Partner-only throughout, gated by `USERS.MANAGE_PERMISSIONS` (§3.13, §9.2). One "Role & Permission Management" screen (`/admin/permissions`) with three tabs — Role Defaults, Employee Overrides, Permission Summary — following the same visual language already established across the app's other admin screens (Admin Settings, Employee Task Audit, Recycle Bin: a `page-header` + `card`-sectioned layout, no new design system introduced for this one screen). "Enterprise-grade" here means dense, searchable, and unambiguous about what a change affects before it's committed — not a redesign of the app's existing look.

### 6.1 Role Defaults tab

The full matrix from §3: rows grouped by module (collapsible per module, since 54 rows at once is a lot), columns are the five fixed roles. Each cell is a checkbox reflecting that role's current `RolePermission.granted` value. `VIEW_ALL`/`VIEW_ASSIGNED`/`VIEW_OWN` triads (flagged via `Permission.isViewScope`) render as a single-select group per role/module rather than three independent checkboxes, since granting a role both `VIEW_ALL` and `VIEW_ASSIGNED` simultaneously is a meaningless combination (`VIEW_ALL` already implies it) — the UI prevents that contradiction rather than allowing it and hoping the evaluator's precedence (§2) papers over it correctly. A cell backing an `isCoreAdmin` permission on the `MANAGING_PARTNER` column renders visibly locked (e.g. greyed with a lock icon and tooltip "Required — see Managing Partner Safety") rather than as an unchecking-then-erroring checkbox, so Rule A (§9.3) is discoverable by looking, not just by hitting a rejected save. Toggling a cell stages a change; a visible "N unsaved changes" affects-everyone-with-this-role warning banner and an explicit **Save** action (not autosave-per-click) — this is a screen where a slip of the mouse could silently change what an entire role can do firm-wide, so the extra confirmation friction is deliberate, not an oversight.

**Search Permission:** a text filter above the matrix, matching against permission key, label, or module name — typing "restore" narrows the matrix to just the Recycle Bin-related rows across every module; typing "cases" narrows to the Cases module. Necessary once the catalogue is 54 rows deep (and will only grow per §5), not a nice-to-have.

### 6.2 Employee Overrides tab

**Search Employee:** a text filter on the employee picker (reuses the existing staff directory, `GET /api/auth/staff-directory`), matching name, email, or role — the same search-a-list pattern already used elsewhere in the app (e.g. the Employee Task Audit screen's employee picker), not a new interaction the Managing Partner has to learn.

Once an employee is selected: a per-permission list showing, for that employee, every permission's key/label, its role-default value, and — if an override exists — the override's effect, reason, who set it, and when, visually distinguished (e.g. a colored badge) from the plain role-default rows. Three actions:
- **Grant Override** / **Revoke Override** per row — opens a small form requiring the mandatory `reason` text field per SRD §8a.3; rejected outright with a clear message if the target row is an `isCoreAdmin` permission and the employee's role is `MANAGING_PARTNER` (Rule B, §9.3).
- **Remove Override** per row, for a row that already has one — reverts that single permission to the role default (a single confirm, non-destructive to anything except the override row itself; still fully audit-logged, §9.4).
- **Reset Employee to Role Defaults** — one bulk action, prominently placed (not buried in a per-row menu), that removes *every* override this employee currently has in one confirmed action, writing a single `USER_PERMISSIONS_RESET` audit entry rather than N individual `USER_PERMISSION_OVERRIDE_REMOVED` entries (§9.4) — the useful action when an employee's access needs to be fully normalized back to "whatever their role says," e.g. after a role change or a review, without hunting down every override one at a time.

### 6.3 Permission Summary

A read-only, per-user rollup: everything this person can currently do, and why — every granted permission, tagged with its source (role default vs. override, and if an override, its reason/who/when). Reuses the same **Search Employee** control as §6.2's tab (one shared employee-picker component, not two separate implementations). Two entry points: its own tab, and embedded as a section on the existing Employee Task Audit screen, so a Managing Partner reviewing an employee's activity doesn't have to context-switch to a separate screen to also see what that employee is currently permitted to do.

---

## 7. Migration Strategy

### 7.1 Sequence

1. **Additive schema migration** — `Permission`, `RolePermission`, `UserPermissionOverride` tables created. No existing table is altered.
2. **Seed script populates `Permission`** with the full catalogue from §3 (54 rows, 15 flagged `isCoreAdmin`).
3. **Seed script populates `RolePermission`** with exactly the defaults tables from §3 — every cell reverse-engineered from and verified against current route/service behavior (§3.2), including the flagged discrepancies (§3.6, §3.9) preserved as-is rather than silently tightened.
4. **Zero `UserPermissionOverride` rows seeded.** No employee starts with an override; the system launches in its purest "role defaults only" state.
5. **Parity verification, before any route is switched over:** an automated check (§8.1) computes, for every existing route × every role, both (a) today's `requireRole(...roles)` decision and (b) the new evaluator's decision using the freshly-seeded data, and asserts they're identical. This is the concrete mechanism behind "current behavior must remain unchanged" — a provable equivalence, not a hope.
6. **Route-by-route cutover**, each its own small, test-gated change (not one giant commit): swap `requireRole(...)` → `requirePermission(...)`, swap the hardcoded scope-array check → `resolveViewScope(...)`, run the full test suite, confirm green, move to the next module. This mirrors the incremental, test-gated discipline already used for every prior step of this engagement (service-layer extraction, Security Hardening, Step 1/Step 2) rather than introducing a new, riskier "big bang" pattern for the one change that matters most.
7. **`requireRole` is not deleted.** It remains available as a primitive for any future check that's genuinely role-intrinsic rather than permission-shaped (none is anticipated, but the primitive costs nothing to keep) — the goal is that no *route* still depends on it once cutover completes, not that the function itself is removed.

### 7.2 What "current behavior must remain unchanged" concretely means

Every discrepancy found during this review (§3.6's Task edit/reassign breadth, §3.9's Document upload breadth, §3.8's Case Notes visibility) is **preserved, not fixed**, in the seeded defaults. Step 3 is an access-control *mechanism* change (from hardcoded arrays to a configurable table), not a policy change — any policy tightening the Managing Partner may want as a result of the findings in §3 is a deliberate, separate, post-launch action taken through the Role Defaults screen itself, with its own audit trail, not something bundled invisibly into the migration.

---

## 8. Testing Strategy

### 8.1 Unit tests — the evaluator

- `resolveEffectivePermission`: override `GRANT` wins over a `false` role default; override `REVOKE` wins over a `true` role default; role default used when no override exists (both `true` and `false` cases); deny-by-default when neither a `RolePermission` nor `UserPermissionOverride` row exists (the defensive fallback in §2.2 step 3).
- `resolveViewScope`: correct tier chosen when only one of `VIEW_ALL`/`VIEW_ASSIGNED`/`VIEW_OWN` is granted; `VIEW_ALL` takes precedence when a user somehow holds more than one (shouldn't happen given §6.1's UI constraint, but the evaluator itself must be defensively correct, not just the UI); `NONE` when none are granted.
- **Parity test** (§7.1 step 5): for every current `requireRole` call site and every role, the new evaluator's decision matches, using the seeded `RolePermission` data — this is the automated proof behind the "no behavior change" claim, not just a manually-reviewed table.

### 8.2 Integration tests

- Every existing authorization-focused integration test in the current 137-test suite (role-gating + row-scoping, across cases/clients/documents/tasks/hearings/caseNotes/recycleBin) is expected to **keep passing unmodified in intent** once its underlying route is cut over from `requireRole` to `requirePermission` — if a test's fixtures or expectations need to change to keep it green, that's itself a signal of an unintended behavior change requiring investigation before proceeding, not a test to simply update.
- New tests specific to Step 3's own admin surface: `RolePermission` edit (Managing-Partner-only; non-Partner gets 403; audit-logged as `ROLE_PERMISSION_CHANGED` with before/after); `UserPermissionOverride` grant (requires `reason`; rejects a missing reason; audit-logged as `USER_PERMISSION_OVERRIDE_GRANTED`); override revoke (audit-logged as `USER_PERMISSION_OVERRIDE_REVOKED`; effective permission reverts on the very next request — no stale window); override removal (audit-logged as `USER_PERMISSION_OVERRIDE_REMOVED` with who/when even though the row itself is gone); **Reset Employee to Role Defaults** removes every override for that user in one action and writes exactly one `USER_PERMISSIONS_RESET` entry, not N individual removal entries.
- Managing Partner Safety (§9.3), both rules tested explicitly and independently: **Rule A** — attempting to set the `MANAGING_PARTNER` role default for any `isCoreAdmin` permission to `false` is rejected, regardless of how many Managing Partner accounts currently exist (i.e. rejected even with 5 active MPs, not just when there's exactly one — proving it's an absolute rule, not a count check). **Rule B** — attempting a `REVOKE` override on an `isCoreAdmin` permission targeting a `MANAGING_PARTNER`-role user is rejected unconditionally, including when other active Managing Partners exist (same reasoning — proving it's not a "last one" check). **Account deactivation** — deactivating the sole active Managing Partner via `PATCH /users/:userId/status` is rejected; deactivating one of several active Managing Partners succeeds.

### 8.3 Browser tests

- Role Defaults matrix: toggle a cell, save, log in as (or impersonate, if a test-only impersonation path exists) a user of that role with no override, confirm the new behavior takes effect immediately (next request, no cache lag per §9.5); **Search Permission** narrows the matrix correctly (e.g. "restore" shows only Recycle Bin-related rows across modules); an `isCoreAdmin` cell on the `MANAGING_PARTNER` column renders locked and cannot be unchecked through the UI.
- Employee Overrides: **Search Employee** finds the right person by name/email/role; grant an override with a reason, confirm it takes effect and is visually distinguished from role defaults; revoke it, confirm reversion to role default; attempting to revoke an `isCoreAdmin` permission from a Managing-Partner-role employee is blocked in the UI with a clear message before the request even round-trips; **Reset Employee to Role Defaults** clears every override for that employee in one action and the Permission Summary immediately reflects pure role defaults afterward.
- Permission Summary: renders correctly for a user with zero overrides (pure role defaults) and a user with a mix of grants/revokes; **Search Employee** (shared component, §6.3) works identically here.
- Attempted account deactivation of the sole active Managing Partner is blocked in the UI with a clear, non-technical error message (not a raw 500/403).

### 8.4 Regression

Full existing test suite (137 tests as of Step 2) must stay green throughout the incremental cutover in §7.1 step 6 — checked after **every** module's swap, not just once at the end, so a regression is caught at the module that introduced it rather than requiring a bisect across the whole change.

---

## 9. Security Considerations

### 9.1 Backend-only enforcement

Every permission decision — both the allow/deny in §2.3 and the view-scope selection in §2.4 — happens server-side, on every request, from data loaded fresh (§9.4) via the authenticated actor's `userId`/`role`, never from anything supplied by the client. The frontend fetches the current user's effective permission set once (e.g. embedded in the existing login/session-bootstrap response) **purely to decide what UI to render** (hide a Delete button a user can't use) — exactly as today's role-based nav/button hiding already works, and just as advisory: a hidden button is a UX courtesy, not a security boundary, and the backend is the sole source of truth per SRD §28.

### 9.2 API protection on the permission-management surface itself

Every route that mutates `RolePermission` or `UserPermissionOverride` requires `USERS.MANAGE_PERMISSIONS` like any other permission-gated route — **plus** a hardcoded `requireRole("MANAGING_PARTNER")` guard that stays in place regardless of what the configurable system says. This is a deliberate, singular exception to "gate everything through permissions, not hardcoded roles": it's the one screen that controls every other permission, so its own access can't be made to depend entirely on the system it configures — a belt-and-suspenders safeguard on the root of trust, not an inconsistency.

### 9.3 Managing Partner Safety (self-lockout prevention)

**The guarantee:** at least one active Managing Partner must always hold full permission to Manage Users, Manage Permissions, Manage Settings, Restore/Recycle Bin, and view Audit Logs — the 15 permission keys flagged `isCoreAdmin: true` throughout §3 — and these must always be recoverable, never lost by accident.

**How it's enforced — two rules, chosen specifically to make the guarantee provable rather than merely likely:**

- **Rule A — the role default can never be the failure point.** The `RolePermission` row for `(MANAGING_PARTNER, <any isCoreAdmin permission>)` can never be set to `granted: false`. This is rejected outright by the service layer, with a clear error, no exceptions. It has to be an absolute rule rather than a "would this leave zero MPs" count: `RolePermission` is role-*wide* — setting the Managing Partner role's own default to `false` for, say, `USERS.MANAGE_PERMISSIONS` would strip it from *every* Managing Partner simultaneously, including any created afterward, in one action. There is no count of "how many MPs currently exist" that makes that safe.
- **Rule B — a core-admin permission can never be revoked from a Managing Partner by override.** A `UserPermissionOverride` with `effect: REVOKE` targeting any `isCoreAdmin` permission is rejected for any user whose role is `MANAGING_PARTNER`, unconditionally — not "allowed as long as one other MP still has it," which would require a live count of other active MPs at write time and is vulnerable to a race between two concurrent revokes each independently observing "someone else still has it" and both proceeding, leaving zero. Categorically disallowing the revoke sidesteps that race entirely: there is no code path that can ever remove a core-admin permission from a Managing Partner via this system. If the firm genuinely wants to strip a specific individual's administrative power, the correct action is changing their `User.role` away from `MANAGING_PARTNER` (existing functionality, unrelated to Step 3) — which is also the conceptually correct action, since a Managing Partner without administrative power is a role mismatch, not a permission exception.
- **Account deactivation, extended:** the existing `PATCH /users/:userId/status` endpoint (`auth.service.ts`, predates Step 3) is extended with one additional check as part of this milestone: deactivating a user is rejected if it would leave zero *active* Managing Partner accounts. This isn't a new Step 3 table, but the same underlying guarantee — "always at least one active Managing Partner" — and belongs with this safeguard rather than being left as a gap the new permission system doesn't cover.

Both rules are O(1) — no counting query, no race window — directly serving §9.6's no-performance-regression requirement as well as the safety requirement. Tested explicitly (§8.2, §8.3): attempting either rejected action must fail with a clear, actionable error, not a raw 500.

### 9.4 Audit logging

Every mutation of the permission system writes to the existing `AuditLog` via the existing `recordAuditLog(actor, action, entityType, entityId, details)` utility, unchanged — reusing the Step 1-established "the Audit Log is the standard mechanism for any who-did-what-when requirement" convention rather than inventing a parallel logging path for this one module. Five distinct `action` values, one per kind of change (deliberately distinct rather than one generic `PERMISSION_CHANGED`, so the log is filterable by what actually happened):

| `action` | `entityType` | Written when | `details` captures |
|---|---|---|---|
| `ROLE_PERMISSION_CHANGED` | `RolePermission` | A role default is toggled on the Role Defaults screen | Permission key, role, before → after |
| `USER_PERMISSION_OVERRIDE_GRANTED` | `UserPermissionOverride` | An override is created with `effect: GRANT` | Permission key, target user, reason |
| `USER_PERMISSION_OVERRIDE_REVOKED` | `UserPermissionOverride` | An override is created with `effect: REVOKE` | Permission key, target user, reason |
| `USER_PERMISSION_OVERRIDE_REMOVED` | `UserPermissionOverride` | An individual override is deleted (reverting that one permission to the role default) | Permission key, target user, the override's prior effect |
| `USER_PERMISSIONS_RESET` | `UserPermissionOverride` | The bulk "Reset Employee to Role Defaults" action (§6.2) removes *every* override for a user in one action | Target user, count and list of permission keys that were removed |

This is the full "who changed what, for whom, from what, to what, when, and why" trail SRD §8a.4 requires, reconstructable from the same query shape (`entityType`/`entityId`/`createdAt`) every other module's history already uses.

**Failed permission attempts** (the ninth principle's "where appropriate" qualifier) are **not** written to `AuditLog`. They continue to use the existing `logSecurityEvent("PERMISSION_DENIED", …)` structured-JSON security-logging path (`utils/securityLogger.ts`) that every `requireRole` denial already uses today — unchanged, just now also firing from `requirePermission`. This is a deliberate distinction, not an oversight: `AuditLog` is a business-entity history table, read back in-app (Task History, the future Audit Log Viewer, this module's own change trail) and is exactly as long-lived and as visible as the records it describes; a permission *denial* is an operational/security signal (worth grepping, worth watching for a pattern of repeated probing — the exact same reasoning `utils/authorization.ts`'s `logOutOfScopeAttempt` already applies to out-of-scope resource access), not a fact about a business record. Routing every denied check into the same table users browse for case/task history would flood it with noise no Managing Partner reviewing "what happened to this case" wants to see. Both paths are real logging, just to the destination that matches what each event actually is.

### 9.5 Permission cache

There is **no cache beyond the single per-request eager load** described in §2.3 (`req.effectivePermissions`, populated once, discarded at the end of the request). This is a deliberate simplicity choice: a permission change (role-default edit or override grant/revoke) takes effect on the *very next request* system-wide, with zero propagation delay and no cache-invalidation logic to get wrong. The cost is one additional indexed query per request (or zero, if folded into the existing actor-lookup step `requireAuth` already performs) — negligible next to the row-level-scoping queries this codebase already runs on every case/document/task/client request today. If request volume ever makes this measurably expensive (not expected at this application's scale), a request-scoped or short-TTL cross-request cache is a contained addition later — explicitly deferred, not built preemptively, consistent with this project's standing practice of not designing for hypothetical scale.

### 9.6 Performance summary

| Operation | Cost added by Step 3 |
|---|---|
| Any authenticated request | +1 indexed query (`RolePermission` for the actor's role, LEFT JOIN or UNION'd against `UserPermissionOverride` for the actor's `userId`) — or 0 if merged into the existing per-request user lookup |
| Permission check itself (`requirePermission`) | O(1) — a `Set.has()` against the already-loaded `req.effectivePermissions` |
| View-scope resolution (`resolveViewScope`) | O(1) — same set, no extra query |
| Role Defaults matrix load | One query returning the full dense `RolePermission` table (a few hundred rows at most) |

---

## 10. Explicit Non-Goals

Stated plainly, so approval of this document is approval of a bounded scope:

- **No admin-creatable custom roles.** The five roles in SRD §3 stay fixed, Prisma-enum-backed. Step 3 makes *permissions* configurable, not the *role list* itself — matching how SRD §8a is actually framed ("role defaults + individual overrides," never "define a new role"). If the firm ever wants a true custom-role system, the documented migration path is: `RolePermission.role` becomes a foreign key to a new `Role` table instead of the `UserRole` enum, `User.role` gains a parallel FK, and the enum is retired — a real migration, not a config toggle, and one this design deliberately does not build now on the chance it's wanted later.
- **No field-level permission granularity.** A permission governs access to a whole record (a Case, a Document), not individual fields within it. Office Staff's "metadata only" case view (TODO.md #5) is a known, separately-tracked gap this design does not close.
- **No cross-request permission cache.** See §9.5.
- **No changes to the Client access model.** SRD §8a.4 excludes Clients explicitly; this design doesn't touch `requireClient`, client-scoped routes, or the Client Portal's future access model in any way.
- **`PRINT` is not a distinct backend permission.** See §3.1.

---

## 11. Implementation Milestones

Per the Managing Partner's ninth principle, Step 3 is built as six milestones, not one large change. **After every milestone: full test suite, functional verification, documentation update, commit — then stop and wait for Managing Partner approval before starting the next milestone.** No milestone after M1 begins without that approval. Step 4 (or any later phase) does not begin until every milestone below is complete, tested, and approved.

| # | Milestone | What ships | Behavior change to existing routes? |
|---|---|---|---|
| **M1** | Schema & Seed | ✅ **Complete (2026-08-04).** `Permission`/`RolePermission`/`UserPermissionOverride` tables (+ `PermissionEffect` enum, `Permission.isCoreAdmin`/`isViewScope`), migration, seed script populating the full 53-key catalogue (§3) and every `RolePermission` default exactly as tabulated. | **None.** Nothing read these tables yet. |
| **M2** | Evaluator, Middleware & Cutover | ✅ **Complete (2026-08-04), including `PATCH /api/tasks/:id`.** `loadEffectivePermissions`, `attachEffectivePermissions`/`requirePermission` middleware, `resolveViewScope` (§2/§4), Rule A/Rule B core-admin safety functions (§9.3, unit-tested, not yet wired to any live mutation route — that's M3's admin API) — **plus**, per the Managing Partner's explicit direction, the full route-by-route cutover originally scoped as M5: every `requireRole(...)` call and the hardcoded role-array scope checks in `caseScopeWhere`/`clientScopeWhere` replaced with `requirePermission`/`resolveViewScope`, module by module (Cases, Clients, Tasks, Documents, Hearings, Case Notes, Settings/Picklists, Recycle Bin, Users/Auth). M5 is retired as a separate milestone — its scope is done. `PATCH /api/tasks/:id` was initially left ungated pending a body-aware design (§3.6 originally flagged this); the Managing Partner required it closed before M2 could be considered complete, so a new `TASKS.CHANGE_STATUS` key was added (splitting status changes out from `TASKS.EDIT`) and `tasks.service.ts` now determines which of `TASKS.EDIT`/`TASKS.CHANGE_STATUS`/`TASKS.ASSIGN` a given request body requires, checking each against the actor's effective permissions — with the pre-existing own-assignee workflow preserved by treating a task's own assignee as authorized whenever they hold `TASKS.VIEW_OWN` (§3.6). **Every protected endpoint is now migrated to the permission framework with no exceptions.** | **None.** 180 tests pass (144 pre-M2 unmodified + 28 evaluator/middleware + 8 new covering the task-permission completion), proving byte-identical behavior across every migrated route, including the previously-deferred one. |
| **M3** | Permission-Management Admin API | ✅ **Complete (2026-08-04).** New `permissions.{routes,controller,service}.ts`: `GET /catalogue`, `GET`/`PATCH /role-defaults` (transactional, no-op changes skipped, Rule A enforced per change), `GET /employees/:userId` (Permission Summary — role, role defaults, overrides, merged effective grant, each source-tagged), `POST`/`DELETE /employees/:userId/overrides` (mandatory reason, duplicate rejected with 409, Rule B enforced), `POST /employees/:userId/reset` (bulk-remove, single audit entry). All Managing-Partner-only (`USERS.MANAGE_PERMISSIONS` + hardcoded `requireRole` safety net, §9.2). Rule A/Rule B (built in M2) wired into a live mutation path for the first time. The account-deactivation safeguard (§9.3) extends the existing `PATCH /api/auth/users/:userId/status` in place, following that file's existing controller-holds-logic convention rather than introducing a new service layer for one check. | **None.** 201 tests pass (180 pre-M3 unmodified + 21 new), zero regressions. |
| **M4** | Frontend: Role & Permission Management screens | ✅ **Complete (2026-08-04).** `frontend/src/pages/Admin/PermissionManagement.tsx`, mounted at `/admin/permissions`: Role Defaults tab (matrix, module grouping/collapse, Search Permission, unsaved-changes banner, Save/Cancel with confirm, Rule A cells rendered disabled+locked), Employee Overrides tab (Search Employee, Grant/Revoke via a mandatory-reason dialog, Remove Override, Reset to Role Defaults, Rule B's Revoke button disabled+tooltipped), Permission Summary tab (same data, read-only, no action buttons) — the latter two share one presentational table component so the grant/revoke/remove logic and the read-only rendering never duplicate the row-building logic. Browser-verified live end to end (§8.3) — see §11.1 below for what that surfaced. | **None** to existing screens. |
| ~~M5~~ | ~~Cutover~~ | Merged into M2 above, completed ahead of schedule. | — |
| **M6** | Final documentation & production readiness | ✅ **Delivered (2026-08-04), awaiting Managing Partner approval.** Documentation consistency pass across SRD/README/CHANGELOG/TODO/this design doc/ARCHITECTURE_REVIEW/IMPROVEMENTS (SRD bumped to v1.5 — §8a.3 amended for the Permission Summary tab, new §8a.5 formalizing Managing Partner Safety); [`PRODUCTION_READINESS_REPORT.md`](PRODUCTION_READINESS_REPORT.md) delivered (16-category readiness review, 5-tier technical debt classification, architecture validation, final verification, production-readiness assessment — no Critical/blocking issues found); final full-suite regression re-confirmed (201/201 backend tests, clean lint/typecheck/build both packages). No new functionality — a review-and-report milestone only, per the Managing Partner's explicit direction. | **None.** Documentation and reporting only. |

**M2 no-exceptions guarantee:** every endpoint this application exposes to staff users is now authorized through the permission framework — either by a route-level `requirePermission` gate, or, for the one route whose authorization genuinely depends on request-body content (`PATCH /api/tasks/:id`), by an equivalent body-aware service-layer check (§3.6). There is no endpoint left on the old hardcoded-role-array mechanism.

**§11.1 — M4 browser verification finding: the dev database needed re-seeding.** Live-testing M4 against the local dev environment surfaced a real deployment gap: `npm run dev`'s database had the M1–M3 *migrations* applied (schema present) but had never had `npm run seed` run against it, so `RolePermission` was empty and the Managing Partner's own account got 403'd loading the Role Defaults screen — a correct result given empty data, but a genuine "don't forget this step" finding, since `prisma migrate dev`/`deploy` and the seed script are two separate commands and nothing currently enforces running both. Fixed for this environment by running `npm run seed` (idempotent, safe to re-run — confirmed by M1's own tests). **Operational note for any future environment (staging, production, or a fresh teammate's machine): after applying the Step 3 migrations, `npm run seed` must also be run once, or every Managing Partner will be locked out of `/admin/permissions` — and, after the M2 cutover, every other permission-gated route too — until it is.** Worth a pre-flight check or an explicit deployment runbook step; not fixed automatically here since coupling migration and seeding is a deliberate choice this project already makes elsewhere (`prisma migrate dev` never auto-seeds, per the existing `--skip-seed` convention used throughout this engagement) and changing that is outside M4's scope.

**All six milestones have been delivered** — M5 was retired into M2, per the row above. **Step 3 (Enterprise Role & Permission Management) is fully built, tested, and documented; M6 now awaits Managing Partner review and approval.**

---

**End of design document. M1 through M6 are delivered. Step 3's implementation is finished — see [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) for the post-Step-3 assessment. M5 was retired into M2. Per the Managing Partner's standing instruction, no new development begins until M6 is explicitly reviewed and approved.**
