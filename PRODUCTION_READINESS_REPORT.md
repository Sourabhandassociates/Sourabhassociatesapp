# Production Readiness Report — Sourabh And Associates Law Firm Management App

**Date:** 2026-08-04
**Scope:** Full application as of Step 3 M6 (Phase 1 Foundation + Managing Partner Review Steps 1–3, i.e. Case Operations, Soft Delete & Recycle Bin, and Enterprise Role & Permission Management — see [TODO.md](TODO.md) for the complete execution history).
**Author's note:** This is a review-and-report document only, produced under the Managing Partner's explicit instruction not to implement new functionality during M6 "unless a genuine production blocker is discovered." No blocker meeting that bar was found — see §4. Every gap below is either already tracked in [TODO.md](TODO.md)'s Known Issues list or newly identified here and added to it.

---

## 1. Production Readiness Review

Each category is assessed as it stands today, with an explicit judgment on whether it blocks **live internal use by firm staff** (the scope the Managing Partner has asked about) as distinct from public/multi-tenant/internet-scale production use, which this application does not target.

### 1.1 Security
- **Authentication:** two-token JWT model (short-lived access token, hashed/rotated opaque refresh token), correct and tested. Refresh token delivered via httpOnly/`SameSite` cookie for web; `X-Client-Platform: mobile` path preserved for a future mobile client.
- **Authorization:** as of Step 3, every protected staff endpoint resolves access through the seeded permission catalogue (`requirePermission`/`resolveViewScope`), with row-level scoping layered on top — no endpoint remains on the old hardcoded-role-array mechanism (verified by the M2 no-exceptions guarantee, [STEP3_ROLE_PERMISSION_DESIGN.md](STEP3_ROLE_PERMISSION_DESIGN.md) §11). Managing Partner Safety (Rule A/Rule B, last-active-MP deactivation guard) prevents any configuration path from locking every Managing Partner out.
- **Password hashing:** bcryptjs, 12 rounds. Password complexity enforced (12+ chars, mixed case, digit, symbol).
- **Transport/headers:** Helmet enabled; CORS restricted to an explicit origin allowlist (`CORS_ORIGIN`); no wildcard.
- **Rate limiting:** general (300 req/15min) + tight auth-specific (10 req/15min) limits, with trips logged.
- **File uploads:** MIME + extension allowlist, magic-byte verification, 25MB cap. **Gap:** no antivirus engine wired to the malware-scan integration point yet (`documents/fileValidation.ts`'s `scanForMalware` is a pass-through stub) — TODO.md #18.
- **Secrets:** `config/env.ts` refuses to boot with any JWT secret under 32 characters. **Gap — not a code blocker, an operational one:** the seeded Managing Partner password (`ChangeMe123!`) and the local dev DB password are placeholders that must be rotated before this environment is used by real staff (TODO.md #1, #2). This is a one-time ops action (change the password / re-seed), not a code change.
- **Known dependency CVEs:** `react-router-dom` and the `vitest`/`vite`/`esbuild` dev-dependency chain carry moderate/high advisories requiring breaking major-version upgrades; deliberately deferred to Phase 8 (TODO.md #4, #4b). The `vitest` ones require an exposed dev/UI server (`vitest --ui`), which this project never runs — not exploitable as currently operated.
- **Not yet implemented:** MFA for staff (SRD §28 requires it for Partner/Accounts) — Phase 8, not started.
- **Verdict:** **No code blocker.** Rotate the two placeholder credentials before real use; everything else is either already hardened or a tracked, deliberately-deferred item that doesn't block an internal rollout.

### 1.2 Performance
- N+1 queries avoided throughout (Prisma `include` used consistently).
- Permission evaluation is O(1) per request after a single memoized load (`attachEffectivePermissions`), no per-check DB queries — verified by design and by the 201-test suite completing in normal time.
- **Gap:** `getCase` still pulls the entire unfiltered `tasks` relation (ARCHITECTURE_REVIEW.md §7); no response caching/ETags anywhere; bcryptjs is slower than native bcrypt (~150–300ms/hash) — immaterial at current staff headcount, worth knowing if login volume grows substantially.
- **Verdict:** No blocker for internal use at a single-firm scale.

### 1.3 Scalability
- Stateless API (JWT access tokens, no server-side session store for them) — horizontally scalable in principle.
- **Gap:** local disk file storage (`backend/uploads/` via Multer) ties uploaded documents to one machine/container — won't survive horizontal scaling or a container redeploy without a shared volume (already flagged in SRD §31 as a future move to cloud storage). **No pagination** on any list endpoint (Clients/Cases/Tasks/Documents) — fine at a single-firm's data volume, will degrade as records accumulate over years.
- **Verdict:** Acceptable for a single-firm, single-instance deployment (the actual target). Would need addressing before multi-instance or very high record-count deployment.

### 1.4 Deployment
- No Dockerfile, docker-compose, or CI/CD pipeline exists in the repo. Deployment today is manual: `npm install`, `prisma migrate deploy`, `npm run seed`, `npm run build`, run the compiled server behind a process manager.
- No reverse-proxy/HTTPS termination configuration is part of this repo (expected — that's infrastructure, not application code, and depends on the actual hosting choice).
- **Verdict:** No blocker for a manually-operated internal deployment, but there is no repeatable, automated deployment pipeline yet. Worth a deployment runbook (or containerization) before handing this to anyone other than the developer to operate.

### 1.5 Backup strategy
- **Gap — no backup strategy exists anywhere in the codebase or docs.** Postgres has no configured backup/retention policy, and uploaded files on local disk have no backup story either. This is an infrastructure/ops decision (e.g., `pg_dump` on a schedule, managed-Postgres automated backups, or a filesystem snapshot policy for `uploads/`) that sits outside the application itself, but for a law firm's case/client records, this is the single most important operational gap in this report.
- **Verdict:** Not a code blocker, but a **must-do before this holds any real client/case data** — recommend it be resolved at the same time hosting is chosen, before go-live.

### 1.6 Logging
- Structured security-event logging exists (`securityLogger` — auth failures, permission denials, rate-limit trips, rejected uploads) and audit-trail logging exists for business events (`AuditLog` table — hearing scheduling, case notes, task reassignment/status changes, recycle-bin actions, and now every permission-management action).
- **Gap:** no general structured request logging (`pino-http`/`morgan` or equivalent) — only `console.error` on unhandled exceptions, and only in `src/scripts/**`/`server.ts` per the lint convention (`no-console` elsewhere). There is no record today of ordinary request traffic, only of security events and audited business actions.
- **Verdict:** Sufficient for security/compliance auditing (which was the explicit design goal — every permission change, override, and reset is traceable to who/when/why). Not sufficient for general operational debugging at scale; acceptable for the current internal-use target, worth revisiting if request volume or the support burden grows.

### 1.7 Monitoring
- **Gap:** no uptime/APM/error-tracking integration (e.g., Sentry, Datadog, a simple pingdom-style check) anywhere. The `/api/health` endpoint (`app.ts`) returns a static `{ status: "ok" }` regardless of actual database connectivity — it does not verify a live Postgres connection (a pre-existing, still-open finding from ARCHITECTURE_REVIEW.md's Observability section).
- **Verdict:** No blocker for a small internal rollout with direct developer support, but recommended before treating this as unattended production infrastructure — start with making `/api/health` a real check, then add basic uptime monitoring.

### 1.8 Error handling
- Centralized error handler returns generic messages for unexpected 500s (fixed during Priority 1 hardening — no longer leaks raw Prisma/internal error text); typed error classes (`AuthError`, `ForbiddenError`, `ConflictError`, `NotFoundError`, etc.) are used consistently across modules including the new permissions module.
- Foreign keys are validated before insert (case creation validates `partnerId`/`advocateIds` roles, task creation validates `assignedToId`), closing the original information-disclosure/mass-assignment gap.
- **Verdict:** No blocker. This category was the subject of the Priority 1 hardening pass and is in good shape.

### 1.9 Environment configuration
- `config/env.ts` centralizes all environment variables, fails fast on missing/weak values (`required`, `requireStrongSecret`), and documents every variable's purpose inline. `.env.example` exists and is current.
- **Gap:** no environment-specific config profiles (dev/staging/prod) beyond `NODE_ENV` — acceptable at this scale, since the only environment-sensitive behavior today is rate-limit bypass under `NODE_ENV=test` and the `isProduction` flag (not yet consumed anywhere beyond being defined).
- **Verdict:** No blocker.

### 1.10 Database migrations
- All schema changes are captured as versioned Prisma migrations (`backend/prisma/migrations/`), applied via `prisma migrate deploy` in a real environment or `prisma migrate dev` locally. Every Step in this engagement (soft-delete columns, the full Step 3 permission schema) shipped as a proper migration, never a manual schema edit.
- **Verdict:** No blocker. This is a genuine strength — the migration history is clean and reviewable.

### 1.11 Seed process
- `npm run seed` is idempotent (safe to re-run) and seeds: the first Managing Partner account, Case Stage/Document Category picklist defaults, and, as of Step 3, the full 54-key permission catalogue and 270-row role-default matrix. It never overwrites a Managing-Partner-edited `RolePermission.granted` value on re-seed.
- **Real gap found and documented this engagement (M4, §11.1 of the design doc):** `prisma migrate deploy` and `npm run seed` are two separate commands, and nothing enforces running both — a fresh environment that only runs migrations will have an empty permission catalogue and lock out every user, including the Managing Partner, from every permission-gated route. This is now documented as a mandatory setup/deployment step in [README.md](README.md), but it is **not** enforced in code (deliberately — coupling migration and seeding would deviate from this project's existing `--skip-seed` convention).
- **Verdict:** No code blocker, but **this is the single most likely deployment mistake** for whoever stands up the next environment. Recommend a one-line deployment runbook (`prisma migrate deploy && npm run seed`) be kept alongside whatever hosting instructions are eventually written, and that this exact sequence be treated as a single atomic deployment step operationally even though it's two commands.

### 1.12 File storage
- Local disk (`backend/uploads/`), organized by Multer's `diskStorage`. Already covered in §1.3 (Scalability) — the relevant gap is portability/horizontal-scaling, not correctness. Document versioning (`DocumentVersion`) correctly retains every prior version rather than overwriting.
- **Verdict:** No blocker for a single-server internal deployment.

### 1.13 Upload handling
- Size cap (25MB), MIME + extension allowlist, magic-byte verification against spoofed file types, malware-scan integration point (currently a stub — see §1.1). Confidentiality flag (`INTERNAL`/`CLIENT_VISIBLE`) is stored on `Document` but not yet enforced anywhere, since there is no Client Portal yet to enforce it against (TODO.md #15) — not a gap for internal-only use today.
- **Verdict:** No blocker for internal use.

### 1.14 Session handling
- Staff and Client sessions tracked separately (`UserSession`/`ClientSession`), each supporting self-logout, Managing-Partner force-logout (staff), and automatic revocation on account disable or password change.
- Role/permission changes take effect on next token refresh; an already-issued access token can lag up to its 15-minute TTL after a role or permission change, while the refresh token is invalidated immediately — a documented, deliberate trade-off (design doc §9.5), not an oversight.
- **Gap:** no scheduled cleanup job for expired/revoked session rows — they accumulate indefinitely in the DB (TODO.md #13). Harmless functionally, just unbounded table growth over a long deployment lifetime.
- **Verdict:** No blocker.

### 1.15 Browser compatibility
- Standard React 18 + Vite SPA, no browser-specific code paths, no use of bleeding-edge/experimental browser APIs. No explicit cross-browser test matrix has been run (no automated or manual multi-browser verification performed as part of this engagement) — verification so far has been in a single Chromium-based browser context.
- **Verdict:** No known blocker, but also no positive verification beyond one browser engine. Recommend a quick manual pass in Firefox/Safari/Edge before wide internal rollout if any staff use non-Chromium browsers.

### 1.16 Mobile responsiveness
- The Web Admin Portal is built as a desktop-oriented admin tool (tables, matrices, multi-column forms) — this matches its actual usage pattern (office staff at a desk), not a phone-first design.
- `frontend/src/index.css` has only 3 `@media` query occurrences — minimal responsive breakpoint coverage. No responsive testing was performed on the Permission Management UI, Case/Client/Task screens, or the Recycle Bin at mobile viewport widths as part of this engagement.
- **Verdict:** No blocker for the stated use case (desk-based staff use of a Web Admin Portal); this is explicitly out of scope until the separate Android/iOS apps (SRD Phase 5) are built. If any staff need to use the Web Admin Portal from a phone/tablet browser today, expect a cramped experience on the wider screens (Role Defaults matrix, tables) — not broken, but not optimized.

---

## 2. Technical Debt Review

Classified by urgency, drawing on [TODO.md](TODO.md)'s Known Issues list, [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md)'s open findings, and [IMPROVEMENTS.md](IMPROVEMENTS.md)'s not-yet-started items.

### Critical (must fix before production)
*None identified.* Every item that was originally Critical (the row-level authorization gaps, the ungated `PATCH /api/tasks/:id`, the leaking error messages) was fixed during the Priority 1 pass (Phase 1) and, for the permission-framework-specific instance, during Step 3 M2's mandatory correction. No new Critical-severity issue was found during this review.

### High (should fix soon, not a hard blocker for internal use)
1. **Rotate the two placeholder credentials** (seeded Managing Partner password, dev DB password) before real staff/client data enters the system — TODO.md #1, #2.
2. **Establish a backup strategy** for Postgres and `uploads/` — no code change, an infrastructure/ops decision, but currently entirely absent (§1.5).
3. **Wire a real AV engine** to the existing malware-scan integration point — TODO.md #18. The integration point and file-type/magic-byte hardening are already done; only the scanning engine itself is missing.
4. **Office Staff case visibility isn't field-redacted** — SRD §8 specifies metadata-only access for Office Staff; current implementation grants full read access. Note: as of Step 3, this could now be closed *without* a schema change, by scoping Office Staff's `CASES.VIEW_*` permission more narrowly and adding field-level filtering in `cases.service.ts` — the permission framework makes this cheaper to fix now than it would have been before Step 3, though the fix itself is still unbuilt (TODO.md #5).
5. **`react-router-dom` and `vitest`/`vite`/`esbuild` CVEs** — require breaking major-version upgrades, deliberately deferred to Phase 8 to avoid destabilizing a hardening pass; not currently exploitable as this project operates it (TODO.md #4, #4b).

### Medium (worth doing, no urgency)
6. Add pagination to Clients/Cases/Tasks/Documents list endpoints (IMPROVEMENTS.md #16).
7. Add the missing DB indexes identified in the original schema review (`Case.partnerId`, `CaseAdvocate.userId`, `Case.status`/`practiceArea`, `Client.status`, `Task.status`/`dueDate`) — IMPROVEMENTS.md #17.
8. Make `/api/health` verify live DB connectivity instead of returning a static OK — IMPROVEMENTS.md #22.
9. Add structured request logging (`pino-http`/`morgan`) — IMPROVEMENTS.md #21.
10. Move file storage off local disk before any multi-instance deployment — IMPROVEMENTS.md #19.
11. No case status-transition validation (a case can jump between any two statuses) — TODO.md #8.
12. Task `OVERDUE` status is computed on read, not auto-set by a scheduled job — TODO.md #9 (functionally fine today; the derived-flag approach already works).
13. No revoked/expired session cleanup job — unbounded table growth over time — TODO.md #13.
14. Global input sanitization doesn't cover multipart form-data text fields (still Zod-validated, just not sanitizer-passed) — TODO.md #20.

### Low (cosmetic / nice-to-have)
15. Extract shared frontend components (`<DataTable>`, `<FormField>`, `<Badge>`) so markup, not just CSS classes, is shared across pages — IMPROVEMENTS.md #24.
16. Standardize loading/empty/error states across pages — IMPROVEMENTS.md #25.
17. Replace scattered inline `style={{...}}` usages with utility classes — IMPROVEMENTS.md #26.
18. No password-reset/forgot-password flow for staff or clients yet — TODO.md #10.
19. Client credential delivery is manual (returned once in the API response) rather than automated — TODO.md #12 (correctly deferred to the future Notifications module).
20. Recycle Bin has no auto-purge after a retention period; permanently-deleted files are removed from disk best-effort only, no retry queue — TODO.md #21.
21. No revocation cleanup, no ETags/response caching, `getCase`'s unbounded `tasks` include — see §1.2/§1.14.

### Future Enhancement (explicitly out of current scope, not debt)
- Everything in TODO.md's "Remaining Work by Phase" (Phase 2 Notifications, Phase 3 Billing, Phase 4 Chat/Approval/OCR, Phase 5 Client Portal/mobile apps, Phase 6 Knowledge Base/Office Management, Phase 7 Contact Directory/Expense Management/Global Search/Admin Customization/Calendar Integration, Phase 8 MFA) — these are scoped-out future phases per the approved SRD, not deferred debt from the phases already built.
- Custom/admin-creatable roles (Step 3's explicit non-goal, design doc §10) — the current five-role model with configurable permissions was the approved scope; a true custom-role system has a documented migration path if ever requested.
- Field-level permission granularity (governing individual fields within a record, not just whole-record access) — also an explicit Step 3 non-goal (design doc §10), overlapping with debt item #4 above but broader in scope than that one specific case.

---

## 3. Architecture Validation

### Service layer consistency
Every module except `auth` follows `*.routes.ts` → `*.controller.ts` (thin) → `*.service.ts` (business logic + Prisma + authorization): `clients`, `cases`, `tasks`, `documents`, `hearings`, `caseNotes`, `recycleBin`, `permissions`. **Documented exception:** `auth.controller.ts` mixes controller/service responsibilities directly (imports `prisma` and error classes itself) — a pre-existing Phase 1 pattern that was deliberately *not* refactored during Step 3 (per "do not modify unrelated functionality"); the M3 last-active-Managing-Partner safeguard was added following that file's own established convention rather than introducing a new service layer for one check. This is the one known, intentional deviation from the otherwise-consistent layering — tracked, not accidental.

### Authorization consistency
Fully consistent as of Step 3 M2's completion: every protected staff endpoint is gated by `requirePermission(key)` (or, for `PATCH /api/tasks/:id`, the one route whose authorization genuinely depends on request-body content, an equivalent body-aware service-layer check per design doc §3.6) — no endpoint remains on the pre-Step-3 hardcoded `requireRole` mechanism. Client-facing routes (`requireClient`) are untouched by Step 3 by design (an explicit non-goal, §10).

### Permission framework consistency
Single evaluation path for the whole application: `loadEffectivePermissions` computes the effective set once per request (memoized on `req.actor`), `requirePermission` and `resolveViewScope` both read from that same set, and every module (including the newest, `permissions` itself) is gated the same way. No module bypasses the framework or re-implements its own authorization check.

### Row-level authorization consistency
`caseScopeWhere`/`clientScopeWhere` (`utils/authorization.ts`) now derive scope from `resolveViewScope` (permission-driven) rather than hardcoded role arrays, but the underlying Prisma where-filter logic is unchanged from Phase 1 — row-level scoping and the permission framework are complementary layers, not a replacement of one by the other, exactly as the Managing Partner's binding principles required. The Recycle Bin's per-entity permission check (`assertEntityPermission`) mirrors the existing switch-based-per-entity pattern rather than introducing a new one.

### Soft-delete consistency
`Case`/`Client`/`Document`/`Task` all follow the identical `deletedAt`/`deletedById` pattern established in Step 2, excluded from every list/search/dashboard/authorization path, restorable and permanently-deletable only through the Recycle Bin (Managing-Partner-gated, now via `RECYCLE_BIN.*` permissions rather than a hardcoded role check). No entity added since Step 2 has deviated from this pattern.

### Audit logging consistency
The Step 1 `AuditLog`-history pattern (generic entity/action/actor/timestamp, formalized as a standing convention) now also covers every Step 3 permission action (`ROLE_PERMISSION_CHANGED`, `USER_PERMISSION_OVERRIDE_GRANTED/REVOKED/REMOVED`, `USER_PERMISSIONS_RESET`), consistent with how it already covered hearing/task/case-note/recycle-bin actions. Failed *permission* attempts deliberately route to the separate `securityLogger` rather than `AuditLog` — a documented, deliberate split (business-entity history vs. operational/security signal), not an inconsistency.

### Coding standards consistency
Zero `any` usage anywhere in the codebase (backend or frontend, confirmed by full-codebase grep during the Consistency pass and unchanged since). Naming conventions (`camelCase`/`PascalCase`/`*.routes.ts`/`*.controller.ts`/`*.service.ts`) hold across every module including `permissions`. ESLint + Prettier are configured for both packages and pass cleanly (§4). The one architectural exception (`auth.controller.ts`'s layering) is the only known deviation from an otherwise fully consistent codebase.

---

## 4. Final Verification

| Check | Result |
|---|---|
| Backend test suite | ✅ **201/201 passing**, 20 test files, 0 failures |
| Backend typecheck (`tsc`) | ✅ Clean, zero errors |
| Backend lint (`eslint`) | ✅ Clean, zero errors/warnings |
| Frontend typecheck (`tsc -b`) | ✅ Clean, zero errors |
| Frontend lint (`eslint`) | ✅ Clean, zero errors/warnings |
| Frontend production build (`vite build`) | ✅ Succeeds — 114 modules, ~288KB JS / 4.7KB CSS (gzipped ~88KB / ~1.6KB) |

**No genuine production blocker was discovered during this review.** Every gap identified above is either already-tracked technical debt (§2) or an operational/infrastructure step (credential rotation, backup strategy, deployment runbook) rather than a defect in the shipped application code. Per the Managing Partner's explicit instruction, no new functionality was implemented as part of producing this report.

---

## 5. Final Summary

- **Final automated test count:** 201 backend tests (0 frontend automated tests — no frontend test harness exists yet in this project; explicitly flagged, not silently skipped, in the M4 completion summary).
- **Modules completed:** Authentication & RBAC, Client Management, Case Management, Document Management, Task Management (Phase 1); Case Notes/Diary, Hearing Calendar & scheduling, Task History, Employee Task Audit, Smart Task Assignment, admin-managed Picklists (Step 1); Soft Delete & Recycle Bin for Case/Client/Document/Task (Step 2); Enterprise Role & Permission Management — schema, evaluator/middleware, full route cutover, Permission-Management Admin API, and the Role & Permission Management UI (Step 3, M1–M4). Step 3 M6 (this report) closes out Step 3 with no further code changes.
- **Remaining phases (not started, per SRD §32 and TODO.md):** Phase 2 Notifications & Reminders; Phase 3 Financial Layer (Time Tracking, Billing & Invoicing, Accounts dashboard); Phase 4 Communication & Approval (Internal/Client Chat, Document Approval Workflow, OCR, richer role-specific dashboards); Phase 5 Client-Facing & Multi-Platform (Client Portal, Android/iOS apps, push notifications, Reports & Analytics); Phase 6 Knowledge Base & Office Management; Phase 7 remaining items (Contact Directory, Expense Management, Advanced Conflict Check, Global Search, further Admin/Customization, Data Import/Export, Calendar Integration, Tagging, Digital File System); Phase 8 Hardening & Scale (MFA, the two deferred CVE upgrades).
- **Known limitations carried forward:** see §2's Technical Debt Review in full; the highest-priority items are credential rotation and establishing a backup strategy, both operational rather than code changes.
- **Production readiness (for the stated goal — live internal use by firm staff, single-instance deployment):** **~90%.** The application layer itself — authentication, authorization, the full permission framework, row-level scoping, soft-delete/recycle-bin, audit logging, input validation, security headers, rate limiting, upload validation — is complete, tested (201/201), and consistent. The remaining ~10% is entirely operational: rotate the two placeholder credentials, decide and implement a backup strategy for Postgres and `uploads/`, and write a short deployment runbook that includes the migrate-then-seed sequence (§1.11). None of this requires new application code.
- **Recommendation:** **Ready for live internal use once the operational steps above are completed** (credential rotation and a backup strategy — both are same-day tasks, not development work). The application itself has no known Critical or blocking defect. Do not begin Phase 4+ (or any new feature phase) until the Managing Partner has reviewed this report and the two remaining operational steps have been actioned, consistent with treating Step 3 as the last major architectural change before production use.

---

**End of report.** No code was modified to produce this document, per the Managing Partner's explicit instruction for M6.
