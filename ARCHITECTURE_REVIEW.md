# Architecture Review — Phase 1 (Foundation)

**Scope:** Everything committed at `726a647` — backend (Node/Express/TypeScript/Prisma/PostgreSQL) and frontend (React/TypeScript/Vite). This is a descriptive review only; see [IMPROVEMENTS.md](IMPROVEMENTS.md) for prioritized recommendations. No code was changed to produce this document.

**This document is a point-in-time snapshot as of `726a647` and is intentionally left unedited below as the historical record of what was found.** For what has since been fixed, see [CHANGELOG.md](CHANGELOG.md) and the status ledger immediately below.

---

## Resolution Status

| Finding | Status | Where |
|---|---|---|
| §4 — Row-level authorization missing outside Cases (Documents, Tasks, Case-advocates, Clients) | ✅ Fixed | `d5aea67` |
| §4 — `PATCH /api/tasks/:id` had no access check at all | ✅ Fixed | `d5aea67` |
| §5 — `passwordHash` leaking via un-selected nested includes in `createCase`/`getCase` (found *while* fixing §4, not in the original review pass) | ✅ Fixed | `d5aea67` |
| §5 — Error handler leaking raw internal error messages | ✅ Fixed | `d5aea67` |
| §5 — Unvalidated foreign keys on case/task creation | ✅ Fixed | `d5aea67` |
| §8 — No automated tests | ✅ Addressed (authorization coverage) | `dc62004` |
| *(found by the new test suite, not this review)* `GET /api/auth/staff-directory` missing `requireStaff` | ✅ Fixed | `dc62004` |
| §5 — No Helmet headers, open CORS, no rate limiting, refresh token in `localStorage`, no upload MIME allowlist, weak password policy, no security logging | ✅ Fixed | High: Security Hardening (see CHANGELOG.md) |
| §2, §8 — Only `auth` had a service layer; the one `any` in `cases.controller.ts`; no lint/format config anywhere | ✅ Fixed | High: Consistency & Maintainability (see CHANGELOG.md) |
| §3, §6, §7, §9 — indexing gaps, pagination, shared UI components | ⏳ Not yet started | IMPROVEMENTS.md items 16–26 |
| §1 — `CaseClient.partyRole`/`Document.category` unconstrained-string typo risk | ✅ Largely addressed for the fields the Managing Partner flagged (Court/Judge/Case Stage/Practice Area/Case Type/Opposite Counsel/Opposite Party/Department/Hearing Purpose/Document Category) | `PicklistValue` system — see README.md "Standing Architectural Conventions" and Step 1 revision entries in CHANGELOG.md. Not a DB-level constraint (still a plain string column), just a UI-level guarantee that entry only happens through the curated dropdown. `CaseClient.partyRole` itself is unchanged. |
| §1 — No `onDelete`/`onUpdate` referential actions specified anywhere | ✅ Fixed (for the relations Step 2 needed) | Step 2: Soft Delete & Recycle Bin (see CHANGELOG.md) — `onDelete: Cascade` added to `CaseClient.case/client`, `CaseAdvocate.case`, `Document.case`, `DocumentVersion.document`, `Task.case`, `CaseNote.case`, `Hearing.case`, `ClientSession.client`, so permanent deletion from the Recycle Bin cascades correctly at the database level instead of relying on undocumented `RESTRICT` defaults. `User`'s relations (the case cited in the original finding — deactivating/deleting a `User` with attached `Task`/`Case`/`Document` rows) are unchanged; `User` deletion still isn't a supported operation anywhere in the product (deactivation, not deletion, is the existing pattern), so this remains open specifically for `User`. |
| §1 — No soft-delete columns yet | ✅ Fixed | Step 2: Soft Delete & Recycle Bin (see CHANGELOG.md) — `deletedAt`/`deletedById` added to `Case`/`Client`/`Document`/`Task`, backing a Managing-Partner-only Recycle Bin per SRD §27. |

---

## 1. Database Schema

**File:** `backend/prisma/schema.prisma`

**What's there:** `User`, `UserSession`, `Client`, `ClientSession`, `Case`, `CaseClient`, `CaseAdvocate`, `Document`, `DocumentVersion`, `Task`, `SequenceCounter` — 11 models covering exactly the Phase 1 SRD scope, with no premature modelling of later-phase entities (chat, billing, hearings, OCR). Enums are used consistently for status/role/priority fields instead of free-text.

**Strengths:**
- `SequenceCounter`-backed ID generation (`idGenerator.ts`) uses Prisma's native `upsert`, which Postgres executes as a single atomic `INSERT ... ON CONFLICT DO UPDATE` — correct under concurrent case/client creation, no race condition.
- Many-to-many relationships (`CaseClient`, `CaseAdvocate`) are modelled through explicit join tables with `@@unique` compound constraints, not implicit Prisma many-to-many — this is the right call given both join tables carry their own data (`partyRole`) or will need to (future audit fields).
- `DocumentVersion` as a child of `Document` (rather than mutating a single row) correctly captures the "every re-upload creates a new version, prior versions retained" requirement (SRD 13.1) — verified end-to-end in Phase 1 testing.
- Indexes exist where they were top-of-mind (`UserSession.userId`, `ClientSession.clientId`, `Document.caseId`, `Task.caseId`, `Task.assignedToId`).

**Gaps:**
- No index on `Case.partnerId`, despite it being one half of the `scopeForActor` OR-filter used on every case list/detail/update request.
- No index on `CaseAdvocate.userId` alone — only the compound `@@unique([caseId, userId])` exists, which Postgres can use for lookups but is less efficient than a dedicated index when the query filters by `userId` without knowing `caseId` (exactly what `scopeForActor`'s advocate check does).
- No indexes on the columns actually used for filtering in list endpoints: `Case.status`, `Case.practiceArea`, `Client.status`, `Task.status`, `Task.dueDate`. Every filtered list query is currently a sequential scan once the tables have any real volume.
- No `onDelete`/`onUpdate` referential actions specified anywhere — every relation defaults to Prisma's implicit `RESTRICT`. That's a defensible default, but it's undocumented and untested (e.g., what happens today if someone tries to deactivate/delete a `User` who has `Task`/`Case`/`Document` rows attached?).
- No soft-delete columns yet (`is_deleted`/`deleted_at`/`deleted_by`) — expected, since the Recycle Bin is explicitly Phase 7 in the SRD, not a Phase 1 gap.
- `CaseClient.partyRole` and `Document.category` are unconstrained `String` fields. That matches the SRD's "flexible tag/role" intent, but means there's zero protection today against typo'd or inconsistent values (`"Plaintiff"` vs `"plaintiff"` vs `"PLAINTIFF"`) — will matter once search/filtering/reporting is built on top of these fields.
- No full-text search index — expected, Global Search is Phase 7.

---

## 2. Folder Structure

**Backend** (`backend/src/`): `config/`, `middleware/`, `modules/{auth,clients,cases,documents,tasks}/`, `scripts/`, `types/`, `utils/`. Each module folder holds `*.routes.ts` + `*.controller.ts`, and `auth/` additionally has `auth.service.ts`.

**Frontend** (`frontend/src/`): `api/`, `components/`, `context/`, `pages/{Cases,Clients,Tasks,Users}/`.

**Strengths:**
- Backend module-per-domain structure mirrors the SRD's module list (Section 5) — easy to find where a given SRD module's code lives, and it's obvious where Phase 2+ modules (`hearings/`, `billing/`, `chat/`) will slot in without restructuring.
- Clear separation of `middleware/`, `config/`, and `utils/` from business logic.

**Inconsistencies:**
- **Only `auth` has a service layer.** `auth.controller.ts` delegates to `auth.service.ts` for all business logic; `clients`, `cases`, `documents`, and `tasks` controllers call `prisma` directly and inline all business logic in the HTTP handler. This is the single biggest structural inconsistency in the codebase — four out of five modules don't follow the pattern the fifth one establishes.
- No `repositories/` or data-access abstraction anywhere — every module (including `auth.service.ts`) imports the shared Prisma client directly. Acceptable at Phase 1 scale, but means there's no seam to introduce caching, read replicas, or query-level testing later without touching every controller.
- Frontend has no `hooks/` or shared data-fetching layer — every page calls `api.get/post/patch` directly in a `useEffect`, duplicating the same loading-state and error-handling shape across ~12 page components.
- No shared frontend UI component library (`components/` currently only has `Layout.tsx` and `ProtectedRoute.tsx`) — tables, forms, badges, and buttons are hand-rolled per page with the same CSS classes but no shared `<Table>`, `<Form>`, `<Badge>` components. Confirmed by direct count: 15 inline `style={{...}}` occurrences scattered across page files rather than centralized in `index.css` or a component.

---

## 3. API Endpoints

**Full inventory as currently registered in `app.ts` and each module's `*.routes.ts`:**

| Method | Path | Auth | Role Gate |
|---|---|---|---|
| GET | `/api/health` | none | — |
| POST | `/api/auth/login/staff` | none | — |
| POST | `/api/auth/login/client` | none | — |
| POST | `/api/auth/refresh` | none (refresh token is the credential) | — |
| POST | `/api/auth/logout` | ✓ | any |
| GET | `/api/auth/sessions/me` | ✓ | staff only (checked in controller) |
| POST | `/api/auth/sessions/:userId/force-logout` | ✓ | MANAGING_PARTNER |
| GET | `/api/auth/staff-directory` | ✓ | any staff |
| POST | `/api/auth/users` | ✓ | MANAGING_PARTNER |
| GET | `/api/auth/users` | ✓ | MANAGING_PARTNER |
| PATCH | `/api/auth/users/:userId/status` | ✓ | MANAGING_PARTNER |
| POST | `/api/clients` | ✓ | MANAGING_PARTNER, OFFICE_STAFF |
| GET | `/api/clients` | ✓ | any staff |
| GET | `/api/clients/:id` | ✓ | any staff |
| PATCH | `/api/clients/:id` | ✓ | MANAGING_PARTNER, OFFICE_STAFF, ASSOCIATE |
| PATCH | `/api/clients/:id/status` | ✓ | MANAGING_PARTNER |
| POST | `/api/cases` | ✓ | MANAGING_PARTNER, ASSOCIATE, OFFICE_STAFF |
| GET | `/api/cases` | ✓ | any staff (row-scoped by `scopeForActor`) |
| GET | `/api/cases/:id` | ✓ | any staff (row-scoped) |
| PATCH | `/api/cases/:id` | ✓ | MANAGING_PARTNER, ASSOCIATE (+ row-scoped) |
| PATCH | `/api/cases/:id/status` | ✓ | MANAGING_PARTNER, ASSOCIATE (+ row-scoped) |
| POST | `/api/cases/:id/advocates` | ✓ | MANAGING_PARTNER, ASSOCIATE (**not** row-scoped — see §4) |
| DELETE | `/api/cases/:id/advocates/:userId` | ✓ | MANAGING_PARTNER, ASSOCIATE (**not** row-scoped) |
| GET | `/api/cases/:caseId/documents` | ✓ | any staff (**not** row-scoped) |
| POST | `/api/cases/:caseId/documents` | ✓ | any staff (**not** row-scoped) |
| GET | `/api/documents/:id` | ✓ | any staff (**not** row-scoped) |
| POST | `/api/documents/:id/versions` | ✓ | any staff (**not** row-scoped) |
| GET | `/api/documents/versions/:versionId/download` | ✓ | any staff (**not** row-scoped) |
| GET | `/api/cases/:caseId/tasks` | ✓ | any staff (**not** row-scoped) |
| POST | `/api/cases/:caseId/tasks` | ✓ | MANAGING_PARTNER, ASSOCIATE (**not** row-scoped) |
| GET | `/api/tasks/my` | ✓ | any staff (correctly self-scoped by `assignedToId`) |
| PATCH | `/api/tasks/:id` | ✓ | any staff, **no ownership or role check at all** |

**Design observations:**
- REST nesting is used consistently and sensibly: sub-resources of a case (`documents`, `tasks`) are mounted under `/api/cases/:caseId/...` via `Router({ mergeParams: true })`, while single-resource operations (`/api/documents/:id`, `/api/tasks/:id`) live at the top level. This is a coherent, deliberate pattern — not an accident.
- There is no API versioning (`/api/v1/...`). Fine for a Phase 1 that has no external consumers yet, but worth deciding now rather than after a mobile app (Phase 5) is depending on unversioned routes.
- No pagination on any list endpoint (`GET /api/clients`, `GET /api/cases`, `GET /api/cases/:caseId/documents`, `GET /api/cases/:caseId/tasks`) — every one returns the full result set.
- The bolded rows above are the most important finding in this entire review and are covered in depth in §4 (Authentication & RBAC) and §5 (Security).

---

## 4. Authentication & RBAC

**Files:** `middleware/auth.ts`, `middleware/rbac.ts`, `modules/auth/auth.service.ts`, `modules/auth/auth.controller.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/api/client.ts`.

**Strengths (verified working in Phase 1 testing, re-confirmed by reading the code again for this review):**
- Two-token model (short-lived JWT access token + opaque, hashed, DB-tracked refresh token) is a correct, standard pattern. Refresh tokens are never stored in plaintext (`hashRefreshToken` / SHA-256 before persisting), and rotate on every use (old token hash is overwritten, so replay of a stolen-but-already-used refresh token fails) — this was explicitly tested and confirmed during Phase 1 verification.
- Actor-type separation (`USER` vs `CLIENT`) is enforced at the middleware level (`requireStaff` / `requireClient`), not just in the UI — confirmed a client token gets `403` calling a staff endpoint.
- Session/device tracking (`UserSession`/`ClientSession`) supports exactly the SRD 9.3/9.4 requirements: self-logout (current device), Partner force-logout (all devices), and automatic revocation on account disable or password change.
- Role is embedded in the JWT (`role` claim), which is what makes `requireRole(...)` a fast, no-DB-lookup check per request — a reasonable performance trade-off, with the known and acceptable consequence that a role change or account disablement takes up to the access-token TTL (15 minutes) to fully take effect on already-issued access tokens, even though the *refresh* token is immediately invalidated.

**The central finding of this review:** RBAC is enforced consistently at the **role** level (via `requireRole`) but inconsistently at the **row/ownership** level. The `cases` module introduced a `scopeForActor()` helper specifically so that an Associate/Junior Associate can only see and modify cases they own or are assigned to (SRD 3.2/3.3: "read access to assigned cases only"). That helper is applied to `listCases`, `getCase`, `updateCase`, and `setCaseStatus` — but **not** to:
- `addAdvocate` / `removeAdvocate` (cases.controller.ts) — any Associate can add or remove advocates on *any* case in the firm, not just their own.
- `listDocumentsForCase` / `uploadDocument` / `getDocument` / `addVersion` / `downloadVersion` (documents.controller.ts) — any authenticated staff member (including Office Staff, Accounts Team, or a Junior Associate with no relationship to the case) can list, upload, view, and **download** documents for any case in the firm by ID.
- `listTasksForCase` / `createTask` / `updateTask` (tasks.controller.ts) — same gap, and `updateTask` additionally has **no role check at all** (not even `requireRole`), meaning any authenticated staff member can reassign, reprioritize, or reschedule any task in the firm, including tasks that belong to cases they have no connection to.

This isn't a set of isolated bugs — it's a missing architectural piece: `scopeForActor()` exists once, inline, in `cases.controller.ts`, instead of being a shared authorization utility that every module reuses. Documents and Tasks were built without it.

**Frontend RBAC:** `Layout.tsx` conditionally renders the "Firm Users" nav link only for `MANAGING_PARTNER`, and `ProtectedRoute`/`StaffOnlyRoute` correctly gate route access by `actorType`. This is UI-convenience gating only — as it should be, given the API is the real enforcement point — but per the finding above, the API isn't actually holding up its end of that bargain everywhere yet.

---

## 5. Security

- **Password hashing:** `bcryptjs`, 12 salt rounds (`utils/password.ts`) — appropriate work factor, pure-JS implementation chosen deliberately to avoid native-module build issues on Windows dev machines.
- **Secrets:** `backend/.env` (gitignored, confirmed not committed) currently holds dev-placeholder JWT secrets and a dev DB password. `.env.example` documents the required shape without real values. This is correct hygiene for Phase 1, but the placeholders must be rotated before this touches anything beyond one developer's machine.
- **CORS:** `app.use(cors())` in `app.ts` with no options — allows any origin. Acceptable only because there's no deployed frontend origin to restrict to yet.
- **No security headers:** no `helmet()` or equivalent — no `X-Content-Type-Options`, `X-Frame-Options`, CSP, etc.
- **No rate limiting** on `/api/auth/login/staff` or `/api/auth/login/client` — both are open to unlimited-attempt credential stuffing / brute force today.
- **Refresh tokens live in `localStorage`** (`frontend/src/context/authStorage.ts`), alongside the access token, session ID, and role, as a single JSON blob. This is readable by any JavaScript running on the page, including an injected XSS payload — there is no React `dangerouslySetInnerHTML` usage anywhere today (verified by inspection), so there's no *known* XSS vector yet, but the storage choice means a future XSS bug anywhere in the app would escalate directly to full, persistent session theft (the refresh token is long-lived). httpOnly cookies are the standard mitigation and were not used here.
- **Error handling leaks internals:** `middleware/errorHandler.ts` returns `err.message` directly to the client on any uncaught exception (500). Since several handlers (`createCase`, `createTask`, `addAdvocate`) pass unvalidated foreign keys (`partnerId`, `advocateIds`, `clients[].clientId`, `assignedToId`) straight to Prisma without existence checks, a client-side typo or malicious probe produces a raw Prisma constraint-violation message in the API response (e.g., naming the underlying `@@relation` constraint) — a minor information-disclosure issue and a real UX bug (the frontend has no way to show a sensible error for this case today).
- **Mass-assignment / unvalidated foreign keys:** `createCase` accepts `partnerId` and `advocateIds` directly from the request body with no check that the given `partnerId` actually holds the `MANAGING_PARTNER` role, or that `advocateIds` refers to `ASSOCIATE`/`JUNIOR_ASSOCIATE` users. An Associate creating a case can currently set `partnerId` to any user ID at all, including their own or an Accounts Team member's.
- **File upload has no type allowlist.** `documents/storage.ts` accepts any MIME type/extension up to 25MB — there's a size cap but nothing restricting uploads to the legal-document formats the SRD names (PDF, DOCX, images).
- **No malware/virus scanning** on uploaded files (expected at this phase, flagged for completeness).
- **No CSRF exposure:** because the API is a stateless Bearer-token design (no cookies used for auth), CSRF doesn't apply — this is a genuine structural positive, not an oversight.
- **XSS baseline is sound:** React's JSX escaping is used throughout; no raw HTML injection points were found in the frontend.
- **No audit logging exists yet** — expected, since Section 29 (Backup & Audit Logs) is explicitly a Phase 2 deliverable, not Phase 1.

---

## 6. Scalability

- **Stateless API design:** JWT-based auth with no server-side session store for the *access* token means the API server itself can be horizontally scaled behind a load balancer without sticky sessions. (The refresh-token table is the only server-side session state, and it's in Postgres, which is already shared/centralized.)
- **Connection handling:** a single `PrismaClient` instance is instantiated once (`config/prisma.ts`) and imported everywhere — correct pattern (avoids the classic mistake of creating a new client per request, which exhausts Postgres connections under load).
- **No pagination anywhere** (already noted in §3) is the most immediate scalability ceiling — `GET /api/clients`, `GET /api/cases`, and both `GET .../documents` / `GET .../tasks` endpoints will degrade linearly and then fall over as row counts grow, since the full table (filtered, unpaginated) is fetched and serialized every time.
- **No caching layer** (Redis or in-memory) anywhere — not a problem at Phase 1 volume, but there's currently no seam prepared for one (all reads go straight to Postgres via Prisma in the controller).
- **Local disk file storage** (`backend/uploads/`, via Multer's `diskStorage`) ties the API process to a specific machine's filesystem — this won't survive horizontal scaling or a container redeploy without a shared volume, and is explicitly flagged in the SRD's own deployment architecture (Section 31) as needing to move to cloud storage.
- **No background job / queue infrastructure** — fine today (nothing async-heavy exists yet), but Phase 2's Notifications and Phase 4's OCR will need one, and no seam (e.g., a job-queue library, a worker process convention) has been established yet.
- **No read/write query separation or index coverage analysis** — covered in §1; today's indexing gaps will show up as scalability problems before they show up as anything else.

---

## 7. Performance

- **N+1 risk is currently avoided** — every list/detail endpoint that needs related data uses Prisma's `include`, producing a single query with joins rather than N+1 round trips (verified in `getCase`, `listCases`, `listDocumentsForCase`, `myTasks`, etc.).
- **Over-fetching on some endpoints:** `getCase` includes `documents.versions` (latest only, correctly limited via `take: 1`) but pulls the *entire* `tasks` relation unfiltered and unlimited — on a case with a long task history, this loads every task on every case-detail page view whether the UI needs them all or not (currently it does render them all, but there's no pagination if that list grows into the hundreds).
- **bcryptjs synchronous cost:** 12 rounds in pure JS is noticeably slower than native `bcrypt` (which uses a C++ binding) — likely 150–300ms per hash/compare on typical hardware. This runs on every login and every client/user creation. Not a problem at Phase 1's request volume, but worth knowing the ceiling if login volume grows before this is revisited.
- **No response caching, no ETags, no conditional GET support** anywhere — every request re-fetches and re-serializes from Postgres, including largely-static data like the staff directory.
- **No frontend code-splitting** — `App.tsx` imports every page eagerly; the whole Web Admin Portal ships as one bundle. Not a problem yet at ~15 pages, but worth noting before Phase 5+ adds substantially more screens.
- **No database query logging/slow-query visibility** — Prisma's query logging isn't enabled anywhere, so there's currently no way to observe what's actually slow once real data volume exists.

---

## 8. Coding Standards

- **No linter or formatter configured** in either package — confirmed no `.eslintrc*`, `eslint.config.*`, or `.prettierrc*` exists anywhere in the repo. Both `tsconfig.json` files do have `"strict": true`, which is the one enforced standard currently in place.
- **`any` type usage breaks strict-mode intent:** `cases.controller.ts`'s `listCases` declares `const where: any = ...` to build up the dynamic Prisma filter — the one place in the codebase where TypeScript's type checking is deliberately bypassed.
- **Inconsistent layering** (restated from §2): `auth` module has controller→service→Prisma; every other module is controller→Prisma directly. Whichever pattern is chosen going forward, the codebase should be consistent about it.
- **Validation boilerplate is repeated, not centralized:** every single handler across every controller repeats the same `const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400)...` shape by hand — there's no shared `validate(schema)` middleware, even though `zod` (already a dependency) trivially supports one.
- **Comments are used well and sparingly** — the codebase's inline comments consistently explain *why* (SRD section references, non-obvious security rationale like refresh-token rotation) rather than restating *what* the code does, which is the right comment discipline for a codebase like this.
- **Naming is consistent** across both frontend and backend (`camelCase` for variables/functions, `PascalCase` for types/components, route files named `*.routes.ts`, controllers `*.controller.ts`) — no drift found.
- **No automated tests exist** (already tracked in `TODO.md`) — every verification so far has been manual (direct API calls, browser interaction). This is a coding-standards gap as much as a process one: there's no CI-enforceable definition of "still works" for any endpoint.

---

## 9. UI Consistency

- **One shared stylesheet** (`frontend/src/index.css`) defines the visual language (`.card`, `.badge`, `.stat-tile`, table styles, form input styles, button variants) and every page correctly reuses these classes rather than reinventing styling — this is a real strength; the app looks and behaves consistently across Clients, Cases, Tasks, and Users screens.
- **No shared component layer**, however: the *classes* are shared but the *markup* is not. Every list page (`ClientList`, `CaseList`, `UserList`) hand-rolls its own `<table>`/`<thead>`/`<tbody>` structure, every form page (`NewClient`, `NewCase`, `NewUser`) hand-rolls its own label/input/error/submit pattern. A change to, say, how errors are displayed under a field would require editing 5+ files today instead of 1.
- **15 inline `style={{...}}` usages** scattered across page components (confirmed by direct search) alongside the CSS-class system — mostly minor layout tweaks (`maxWidth`, `marginTop`) that arguably belong as utility classes instead, for consistency and easier global adjustment.
- **Loading and empty states are inconsistent:** some pages show `<p>Loading…</p>` (e.g., `CaseDetail`, `ClientDetail`) while list pages show nothing during the initial fetch and only render an empty-state row once data resolves to `[]` — there's no shared convention for "still loading" vs "confirmed empty."
- **Error display is inconsistent in shape but not in style:** form pages consistently use the `.error-text` class for validation errors (good), but there's no global/toast-level error handling for failures outside a form (e.g., a failed `GET` on a list page currently fails silently with no user-visible feedback at all).
- **Role-based UI gating exists but is minimal:** only the "Firm Users" nav link is conditionally shown by role today; other role-specific behavior (e.g., what a Junior Associate should and shouldn't be able to do on a case) isn't yet reflected in the UI beyond what the API happens to allow or reject.

---

## Summary

Phase 1 delivered exactly what was scoped, and the parts that were tested end-to-end (auth flows, ID generation, versioning, RBAC role gating) work correctly and match the SRD precisely. The most consequential finding from this review is structural, not cosmetic: **row-level authorization (`scopeForActor`) was invented once for the Cases module and never generalized**, leaving Documents and Tasks — and two Case sub-routes (`advocates`) — reachable by staff members outside their assigned cases, and `PATCH /api/tasks/:id` reachable with no role check at all. Everything else (indexing gaps, missing pagination, no service-layer consistency, no lint config, no shared UI components) is a normal, expected accumulation for a Phase 1 built fast and correctly-scoped — none of it is surprising for this stage, but all of it is worth deciding on deliberately before Phase 2 adds more surface area on top of the same patterns.

See [IMPROVEMENTS.md](IMPROVEMENTS.md) for a prioritized, actionable list.
