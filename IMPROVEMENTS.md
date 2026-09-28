# Improvement Plan — Pre-Phase-2

Derived from [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md). Items are ordered by priority, not by SRD phase; several are cross-cutting fixes that should land before Phase 2 (Hearing Calendar, Notifications, Audit Logs) adds more code on top of the same patterns. See [CHANGELOG.md](CHANGELOG.md) for exactly what changed and when as items below are completed.

**Status:** Critical (1–4) ✅ done. High — Security Hardening (5–11) ✅ done. High — Consistency & Maintainability (12–15) ✅ done. Medium — Scalability & Performance: 16–17 ✅ done (Version 1.0 Milestone 4); 18–20 ⏳ not yet started.

---

## Critical — Access Control Gaps (fix before anything else) ✅ DONE

These were exploitable by any authenticated staff account, regardless of role, simply by knowing or guessing an ID — not theoretical. All four fixed in `d5aea67`; automated regression coverage added in `dc62004`.

1. **Introduce a shared, reusable case-authorization helper** and apply it everywhere a `caseId` appears, instead of the one-off `scopeForActor()` currently living only in `cases.controller.ts`. Concretely: extract it into something like `backend/src/middleware/caseAccess.ts` exporting a function/middleware that both (a) filters list queries and (b) 404s a direct-by-ID lookup when the actor has no relationship to the case, and wire it into:
   - `cases.controller.ts`: `addAdvocate`, `removeAdvocate` (currently unchecked)
   - `documents.controller.ts`: `listDocumentsForCase`, `uploadDocument`, `getDocument`, `addVersion`, `downloadVersion` (currently unchecked)
   - `tasks.controller.ts`: `listTasksForCase`, `createTask`, `updateTask` (currently unchecked)
2. **Add a role + ownership check to `PATCH /api/tasks/:id`** (`tasks.controller.ts` `updateTask`) — today it has no `requireRole` at all and no case-scoping, so any authenticated staff member (Office Staff, Accounts Team, an unrelated Junior Associate) can reassign or edit any task firm-wide. At minimum: only the assignee, the assigning Advocate/Partner, or a Partner should be able to update a given task, consistent with SRD Section 8's "Junior Advocate: execute only" line.
3. **Validate foreign keys before insert, not after the DB rejects them:**
   - `createCase`: confirm `partnerId` actually belongs to a `MANAGING_PARTNER`-role user, and every `advocateIds` entry belongs to an `ASSOCIATE`/`JUNIOR_ASSOCIATE` before creating.
   - `createTask` / `updateTask`: confirm `assignedToId` is an active staff user.
   - `addAdvocate`: confirm the case exists and the target user is a valid advocate role.
   This closes both the authorization gap (assigning arbitrary users to arbitrary roles on a case) and the information-disclosure issue below (#4).
4. **Stop leaking raw error messages to clients.** `middleware/errorHandler.ts` currently returns `err.message` verbatim on every uncaught 500. Log the full error server-side (already done via `console.error`, though see the observability item below for making that a real logger) and return a generic `{ error: "Something went wrong" }` to the client instead, reserving detailed messages for errors you've deliberately thrown and typed (like the existing `AuthError` pattern in `auth.service.ts` — that pattern is good; extend it to other modules instead of relying on the generic 500 path).

---

## High — Security Hardening ✅ DONE

Implemented at the Managing Partner's explicit direction (security/confidentiality/data-integrity over convenience). See CHANGELOG.md's "High: Security Hardening" entry for full detail.

5. ~~Move refresh tokens out of `localStorage`.~~ **Done** — httpOnly/`SameSite` cookie for web (`utils/cookies.ts`), scoped to `/api/auth`; JSON-body delivery preserved for a future mobile client via `X-Client-Platform: mobile`. CSRF addressed by design: state-changing endpoints use Bearer-token auth (unforgeable cross-site), not cookies; the one cookie-authenticated endpoint relies on `SameSite`.
6. ~~Add `helmet()`~~ **Done**, with `crossOriginResourcePolicy: cross-origin` since the API is deliberately called cross-origin by the SPA.
7. ~~Restrict CORS~~ **Done** — explicit origin allowlist via `CORS_ORIGIN` env var, `credentials: true`.
8. ~~Add rate limiting~~ **Done** — general + auth-specific limiters (`middleware/rateLimit.ts`), disabled only under `NODE_ENV=test`, trips logged via the new security logger.
9. ~~Add a file-type allowlist~~ **Done**, plus more than originally scoped: post-upload magic-byte verification (in-house, not the `file-type` package — see CHANGELOG.md for why) and a malware-scan integration point.
10. ~~Enforce password complexity~~ **Done** — 12+ chars, mixed case, digit, symbol (`utils/validators.ts`'s `passwordSchema`).
11. ~~Rotate all dev-placeholder secrets~~ **Done for JWT secrets** — `config/env.ts` now refuses to start below 32 characters, and dev/test secrets were regenerated. The DB password and the seeded Managing Partner password are still local-dev placeholders (tracked in TODO.md #1) — those are data/ops steps for whoever stands up a real environment, not something to hardcode a fix for here.

**Also delivered beyond the original 7 items, since it was efficient to do while touching the same code:** centralized request validation (`parseBody()`, one function instead of duplicated `safeParse` in every controller), global input sanitization middleware, and structured security-event logging for auth failures/permission denials/rate-limit trips/rejected uploads.

---

## High — Consistency & Maintainability ✅ DONE

See CHANGELOG.md's "High: Consistency & Maintainability" entry for full detail. All 85 tests pass unmodified; both builds (backend `tsc`, frontend `tsc -b && vite build`) succeed.

12. ~~Give every module a service layer~~ **Done** — `clients`, `cases`, `tasks`, `documents` each now have a `*.service.ts`, matching `auth`'s existing pattern. Controllers are thin HTTP adapters; authorization/validation/business logic lives in the service layer.
13. ~~Centralize request validation~~ **Done in the prior Security Hardening pass** (`utils/validators.ts`'s `parseBody()`), not repeated here — see CHANGELOG.md's Security Hardening entry.
14. ~~Remove the one `any`~~ **Done, and generalized** — Priority 1 had already narrowed this specific `any` to `Record<string, unknown>`; this pass finishes the job with a properly typed `Prisma.CaseWhereInput` in the new `cases.service.ts`, exactly as this item specified. A full-codebase grep confirmed that was the only backend `any` remaining, plus found six frontend `catch (err: any)` blocks, replaced with a shared `getErrorMessage()` helper. Zero `any` remains anywhere in the codebase, backend or frontend.
15. ~~Add ESLint + Prettier~~ **Done** — flat-config ESLint in both packages (`typescript-eslint`, plus React-specific plugins for the frontend), a shared root-level Prettier config, `lint`/`lint:fix`/`format`/`format:check` scripts. Fixing what the linter surfaced also fixed a real (if minor) bug: `AuthContext.tsx` was silently defeating Vite's Fast Refresh (full page reloads instead of hot updates), visible in earlier dev-server logs — split into three files to resolve it properly instead of suppressing the warning.

---

## Medium — Scalability & Performance

16. ~~Add pagination~~ **Done in Version 1.0 Milestone 4** — `GET /api/clients`, `GET /api/cases`, `GET /api/cases/:caseId/documents`, and `GET /api/cases/:caseId/tasks` all accept `page`/`pageSize` query params; the JSON body stays a plain array (backward-compatible with every existing consumer) while `X-Total-Count`/`X-Page`/`X-Page-Size` response headers carry the metadata.
17. ~~Add the missing indexes~~ **Done in Version 1.0 Milestone 4** — `Case.partnerId`, `CaseAdvocate.userId`, `Case.status`, `Case.practiceArea`, `Client.status`, `Task.status`, `Task.dueDate` all indexed.
18. **Limit/paginate the `tasks` relation** in `getCase` (`cases.controller.ts`) — currently unbounded, unlike the already-limited `documents.versions` (`take: 1`) in the same query.
19. **Move file storage off local disk** before any multi-instance or containerized deployment — `documents/storage.ts`'s `diskStorage` ties uploaded files to whichever process/machine handled the request. This can wait until closer to actual deployment, but should be a conscious decision point, not something discovered at deploy time.
20. **Decide on a background-job mechanism now**, even a minimal one, ahead of Phase 2 (Notifications) and Phase 4 (OCR) both needing one — retrofitting a queue after two modules have already been built around synchronous request/response is more expensive than choosing one now.

---

## Medium — Observability

21. **Add structured request logging** (e.g., `pino-http` or `morgan`) — there is currently no record of what requests hit the API at all, only `console.error` on unhandled exceptions.
22. **Make the health check real** (`GET /api/health` in `app.ts` currently returns a static `{ status: "ok" }` regardless of DB connectivity) — have it verify a live Postgres connection.
23. **Enable Prisma query logging** (at least in development) to establish a baseline for spotting slow queries before they're a production problem.

---

## Low — UI Consistency

24. **Extract shared components** (`<DataTable>`, `<FormField>`, `<Badge>`) so the markup — not just the CSS classes — is shared across list/detail/form pages. Currently every page hand-rolls its own table and form structure against the same stylesheet.
25. **Standardize loading/empty/error states** across pages — some show `Loading…`, some show nothing until data resolves; failed `GET` requests on list pages currently fail silently with no user-visible feedback.
26. **Replace the 15 scattered inline `style={{...}}` usages** with utility classes in `index.css`, for the same reason as #24 — one place to adjust spacing/layout conventions instead of many.

---

## Explicitly Not Recommended Right Now

- **Don't** introduce a caching layer (Redis, etc.) yet — no evidence of a bottleneck that would justify the operational complexity at Phase 1 data volumes. Revisit once pagination + indexing (items #16–17) are in and something is still slow.
- **Don't** upgrade Prisma to the 7.x major version yet — it's a real gap (noted in the review) but a major-version migration is exactly the kind of destabilizing change that shouldn't be bundled into a "hardening" pass; it deserves its own isolated, tested changeset.
- **Don't** fix the `react-router-dom` CVEs by force-upgrading yet — same reasoning; that's a breaking major-version change already correctly deferred to Phase 8 in `TODO.md`, and bundling it here risks conflating a security-hygiene pass with a breaking-change migration.

---

## Suggested Sequencing

If approved, the natural order is: **Critical (1–4) → High Security (5–11) → High Consistency (12–15)**, since #12 (service layer) is the cleanest place to actually implement the authorization fixes in #1–3 rather than patching them inline in controllers that are about to be restructured anyway. Medium and Low items can follow in any order and don't block Phase 2 functionally, but #16–18 (pagination/indexing) are cheapest to do now, before more list endpoints exist to retrofit.
