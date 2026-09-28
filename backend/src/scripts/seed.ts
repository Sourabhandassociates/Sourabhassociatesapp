/**
 * Bootstraps the first Managing Partner account. User creation is normally
 * Managing-Partner-only (SRD Section 3.1), so the very first one has to be
 * seeded directly rather than created through the API.
 *
 * Run with: npm run seed -- --name "Sourabh Sharma" --email partner@saa.local --password "ChangeMe123!"
 */
import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { seedPermissionCatalogue } from "../modules/permissions/seedPermissions";

function arg(flag: string, fallback?: string): string {
  const idx = process.argv.indexOf(flag);
  const value = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (!value) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required argument ${flag}`);
  }
  return value;
}

/**
 * Step 1 revision (Managing Partner review, item 4) — seeds the litigation-stage
 * dropdown with the Managing Partner's example values. Idempotent (upsert on the
 * category+value unique constraint) so re-running the seed script is always safe.
 */
async function seedCaseStages() {
  const stages = [
    "New",
    "Pending",
    "Under Trial",
    "Evidence",
    "Arguments",
    "Reserved for Orders",
    "Judgment Delivered",
    "Closed",
  ];
  for (const value of stages) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "CASE_STAGE", value } },
      update: {},
      create: { category: "CASE_STAGE", value },
    });
  }
  console.log(`Seeded ${stages.length} Case Stage values.`);
}

/**
 * Step 1 second revision (Managing Partner review, item 6) — seeds DOCUMENT_CATEGORY
 * with the values that were previously hardcoded in the Documents tab's <select>, so
 * migrating that dropdown to the picklist system doesn't lose any existing options.
 */
async function seedDocumentCategories() {
  const categories = ["Pleadings", "Orders", "Evidence", "Client Documents", "Agreements", "Notes"];
  for (const value of categories) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "DOCUMENT_CATEGORY", value } },
      update: {},
      create: { category: "DOCUMENT_CATEGORY", value },
    });
  }
  console.log(`Seeded ${categories.length} Document Category values.`);
}

/**
 * Step 4 — replaces the ClientType enum with the Picklist system. Seeded with the
 * exact existing enum literal values (not prettified Title Case) so every
 * already-stored Client.type value matches a picklist entry with zero drift/backfill.
 */
async function seedClientTypes() {
  const types = ["INDIVIDUAL", "COMPANY", "GOVERNMENT", "TRUST"];
  for (const value of types) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "CLIENT_TYPE", value } },
      update: {},
      create: { category: "CLIENT_TYPE", value },
    });
  }
  console.log(`Seeded ${types.length} Client Type values.`);
}

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 12) — seeds CONTACT_CATEGORY with
 * the categories named in the SRD's Contact Directory description.
 */
async function seedContactCategories() {
  const categories = [
    "Opposite Advocate",
    "Judge",
    "Chartered Accountant",
    "Company Secretary",
    "Expert",
    "Government Department",
    "Other",
  ];
  for (const value of categories) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "CONTACT_CATEGORY", value } },
      update: {},
      create: { category: "CONTACT_CATEGORY", value },
    });
  }
  console.log(`Seeded ${categories.length} Contact Category values.`);
}

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 10.3) — seeds TAG with the example
 * values the SRD's Tagging System description names.
 */
async function seedTags() {
  const tags = ["GST", "Income Tax", "NCLT", "Arbitration", "Property", "Civil", "Consumer", "Company Law"];
  for (const value of tags) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "TAG", value } },
      update: {},
      create: { category: "TAG", value },
    });
  }
  console.log(`Seeded ${tags.length} Tag values.`);
}

/**
 * Milestone 2 (Version 1.0 completion, SRD Section 16.2) — seeds EXPENSE_CATEGORY
 * with the categories the SRD's Expense Management description names.
 */
async function seedExpenseCategories() {
  const categories = ["Court Fees", "Stamp Duty", "Travel", "Courier", "Printing", "Typing", "Miscellaneous"];
  for (const value of categories) {
    await prisma.picklistValue.upsert({
      where: { category_value: { category: "EXPENSE_CATEGORY", value } },
      update: {},
      create: { category: "EXPENSE_CATEGORY", value },
    });
  }
  console.log(`Seeded ${categories.length} Expense Category values.`);
}

async function main() {
  await seedCaseStages();
  await seedDocumentCategories();
  await seedClientTypes();
  await seedContactCategories();
  await seedTags();
  await seedExpenseCategories();

  const { permissionCount, roleGrantCount } = await seedPermissionCatalogue();
  console.log(`Seeded ${permissionCount} permissions and ${roleGrantCount} role-default rows.`);

  const name = arg("--name", "Managing Partner");
  const email = arg("--email", "partner@saa.local");
  const password = arg("--password", "ChangeMe123!");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "MANAGING_PARTNER" },
  });

  console.log(`Created Managing Partner: ${user.email} (id: ${user.id})`);
  console.log(`Login with email "${email}" and the password you supplied.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
