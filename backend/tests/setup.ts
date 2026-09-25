import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/config/prisma";
import { seedPermissionCatalogue } from "../src/modules/permissions/seedPermissions";

// Guard against ever pointing this at a non-test database by accident — a typo'd
// or missing .env.test would otherwise silently truncate real data.
if (!process.env.DATABASE_URL?.includes("saa_law_firm_test")) {
  throw new Error(
    "Refusing to run tests: DATABASE_URL does not look like the test database. " +
      "Check backend/.env.test exists and vitest.config.ts is loading it."
  );
}

const TABLES = [
  "AuditLog",
  "UserPermissionOverride",
  "RolePermission",
  "Permission",
  "PicklistValue",
  "CaseNote",
  "Hearing",
  "DocumentVersion",
  "Document",
  "Task",
  "CaseAdvocate",
  "CaseClient",
  /** Milestone 1 (Version 1.0 completion) — Contact Directory, Tagging, Conflict Check. */
  "ConflictCheckLog",
  "ContactMatter",
  "Contact",
  "CaseTag",
  /** Milestone 2 (Version 1.0 completion) — Billing & Invoicing. */
  "Payment",
  "InvoiceLineItem",
  "Invoice",
  /** ACCOUNTS module (2026-08-14) — must precede Expense/Case/Client/User (FK targets). */
  "AccountsPayment",
  "ProfessionalFee",
  "Expense",
  "TimeLog",
  /** Milestone 3 (Version 1.0 completion) — Global Search + Notifications. */
  "RecentSearch",
  "Notification",
  /** Milestone 4 (Version 1.0 completion) — Admin/Customization. */
  "CustomFieldValue",
  "CustomFieldDefinition",
  "Announcement",
  "FirmProfile",
  "Case",
  "ClientSession",
  "Client",
  "UserSession",
  "User",
  "SequenceCounter",
];

/** Full isolation between every single test — slower than per-file isolation, but
 * eliminates an entire class of test flakiness/ordering bugs, which matters more
 * for tests whose entire purpose is proving an authorization rule holds. */
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );

  // Step 3 M2 — every staff route now resolves access through the permission
  // catalogue (requirePermission/resolveViewScope), so it must exist for every
  // test, not just the ones that test it directly. Re-seeded fresh after every
  // truncation (not seeded once in beforeAll) to preserve this file's full-
  // isolation guarantee above: a test that mutates a RolePermission row (as
  // tests/integration/permissionCatalogue.test.ts's idempotency test does) must
  // never leak that change into the next test. This is why no existing test file
  // needed to change to keep passing — the catalogue is infrastructure the harness
  // provides, the same way a real deployment seeds it once and every request after
  // that finds it already there.
  await seedPermissionCatalogue();
});

afterAll(async () => {
  await prisma.$disconnect();
});
