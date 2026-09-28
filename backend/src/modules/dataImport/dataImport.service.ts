import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma";
import { BadRequestError } from "../../utils/errors";
import { AccessTokenPayload } from "../../utils/jwt";
import { recordAuditLog } from "../../utils/auditLog";
import { findConflicts, ConflictMatch } from "../../utils/conflictCheck";
import * as clientsService from "../clients/clients.service";
import * as contactsService from "../contacts/contacts.service";
import * as casesService from "../cases/cases.service";

/**
 * Milestone 3 (Version 1.0 completion, SRD Section 25 — Data Import & Export). Bulk
 * import of Clients, Matters, and Contacts from Excel: template download -> upload ->
 * validation preview -> confirm -> commit, exactly the flow the SRD specifies.
 *
 * Deliberate safety choice: a row with a possible conflict-check match (SRD 10.2) is
 * flagged in the preview but never auto-created on commit — conflict override is a
 * Managing-Partner-only, individually-reasoned action (requireConflictClearance), and
 * bulk-import silently rubber-stamping potentially dozens of conflicts at once would be
 * a real regression of that safeguard, not a convenience. A flagged row must be created
 * individually through the normal Client/Contact screen instead.
 */
export type ImportEntityType = "clients" | "contacts" | "matters";

interface ColumnDef {
  key: string;
  header: string;
  required: boolean;
}

const COLUMNS: Record<ImportEntityType, ColumnDef[]> = {
  clients: [
    { key: "name", header: "Name", required: true },
    // Optional as of the Client-module optional-fields pass (2026-08-06) — only
    // Name is required, matching the single-client Create Client screen.
    { key: "type", header: "Type", required: false },
    { key: "email", header: "Email", required: false },
    { key: "phone", header: "Phone", required: false },
    { key: "address", header: "Address", required: false },
  ],
  contacts: [
    { key: "name", header: "Name", required: true },
    { key: "category", header: "Category", required: true },
    { key: "organization", header: "Organization", required: false },
    { key: "designation", header: "Designation", required: false },
    { key: "email", header: "Email", required: false },
    { key: "phone", header: "Phone", required: false },
    { key: "notes", header: "Notes", required: false },
  ],
  matters: [
    { key: "title", header: "Cause Title", required: true },
    { key: "practiceArea", header: "Practice Area", required: true },
    { key: "partnerEmail", header: "Partner Email", required: true },
    { key: "clientIds", header: "Client IDs (comma-separated)", required: true },
    { key: "partyRoles", header: "Party Roles (comma-separated, same order as Client IDs)", required: true },
    { key: "advocateEmails", header: "Advocate Emails (comma-separated)", required: false },
    { key: "courtCaseNumber", header: "Court Case Number", required: false },
    { key: "courtName", header: "Court Name", required: false },
    { key: "jurisdiction", header: "Jurisdiction", required: false },
    { key: "stage", header: "Case Stage", required: false },
    { key: "caseType", header: "Case Type", required: false },
    { key: "oppositeCounsel", header: "Opposite Counsel", required: false },
    { key: "oppositeParty", header: "Opposite Party", required: false },
    { key: "department", header: "Department", required: false },
  ],
};

export function generateTemplateWorkbook(entityType: ImportEntityType): ExcelJS.Workbook {
  const columns = COLUMNS[entityType];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "S&A LEGAL";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(entityType);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 26 }));
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

export interface ParsedRow {
  /** 1-based Excel row number, for user-facing error messages. */
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  conflicts: ConflictMatch[];
}

async function parseWorkbook(entityType: ImportEntityType, buffer: Buffer): Promise<{ rowNumber: number; data: Record<string, string> }[]> {
  const columns = COLUMNS[entityType];
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled Buffer type and this project's @types/node Buffer type are
  // structurally identical at runtime but resolve to distinct nominal types here — a
  // known exceljs typing friction point, not a real type error (the value is a plain
  // Node Buffer either way).
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestError("Uploaded file has no worksheet");

  const headerRow = sheet.getRow(1).values as (string | undefined)[];
  const headerMap = new Map<number, string>();
  columns.forEach((col) => {
    const colIndex = headerRow.findIndex((h) => h?.toString().trim() === col.header);
    if (colIndex > 0) headerMap.set(colIndex, col.key);
  });
  if (headerMap.size === 0) {
    throw new BadRequestError("Uploaded file's header row doesn't match the expected template — download a fresh template");
  }

  const rows: { rowNumber: number; data: Record<string, string> }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = row.values as unknown[];
    const isBlank = !values || values.every((v) => v === undefined || v === null || v === "");
    if (isBlank) continue;

    const data: Record<string, string> = {};
    headerMap.forEach((key, colIndex) => {
      const cell = row.getCell(colIndex).value;
      data[key] = cell === null || cell === undefined ? "" : String(cell).trim();
    });
    rows.push({ rowNumber: r, data });
  }
  return rows;
}

async function validateClientRow(data: Record<string, string>): Promise<{ errors: string[]; conflicts: ConflictMatch[] }> {
  const errors: string[] = [];
  if (!data.name) errors.push("Name is required");
  if (data.email) {
    const existing = await prisma.client.findUnique({ where: { email: data.email } });
    if (existing) errors.push(`A client with email ${data.email} already exists`);
  }
  const conflicts = data.name ? await findConflicts(data.name) : [];
  return { errors, conflicts };
}

async function validateContactRow(data: Record<string, string>): Promise<{ errors: string[]; conflicts: ConflictMatch[] }> {
  const errors: string[] = [];
  if (!data.name) errors.push("Name is required");
  if (!data.category) errors.push("Category is required");
  const conflicts = data.name ? await findConflicts(data.name) : [];
  return { errors, conflicts };
}

async function validateMatterRow(data: Record<string, string>): Promise<{ errors: string[]; conflicts: ConflictMatch[] }> {
  const errors: string[] = [];
  if (!data.title) errors.push("Cause Title is required");
  if (!data.practiceArea) errors.push("Practice Area is required");

  if (!data.partnerEmail) {
    errors.push("Partner Email is required");
  } else {
    const partner = await prisma.user.findUnique({ where: { email: data.partnerEmail } });
    if (!partner || partner.role !== "MANAGING_PARTNER") {
      errors.push(`Partner Email ${data.partnerEmail} does not match an existing Managing Partner`);
    }
  }

  const clientIds = data.clientIds ? data.clientIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const partyRoles = data.partyRoles ? data.partyRoles.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (clientIds.length === 0) {
    errors.push("At least one Client ID is required");
  } else if (clientIds.length !== partyRoles.length) {
    errors.push("Client IDs and Party Roles must have the same number of comma-separated entries");
  } else {
    const found = await prisma.client.findMany({ where: { clientId: { in: clientIds } } });
    const foundIds = new Set(found.map((c) => c.clientId));
    const missing = clientIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) errors.push(`Client ID(s) not found: ${missing.join(", ")}`);
  }

  if (data.advocateEmails) {
    const emails = data.advocateEmails.split(",").map((s) => s.trim()).filter(Boolean);
    const found = await prisma.user.findMany({ where: { email: { in: emails } } });
    const validEmails = new Set(found.filter((u) => u.role === "ASSOCIATE" || u.role === "JUNIOR_ASSOCIATE").map((u) => u.email));
    const missing = emails.filter((e) => !validEmails.has(e));
    if (missing.length > 0) errors.push(`Advocate Email(s) not a valid Associate/Junior Associate: ${missing.join(", ")}`);
  }

  return { errors, conflicts: [] };
}

export async function parseAndValidate(entityType: ImportEntityType, buffer: Buffer): Promise<ParsedRow[]> {
  const parsed = await parseWorkbook(entityType, buffer);
  const validator = entityType === "clients" ? validateClientRow : entityType === "contacts" ? validateContactRow : validateMatterRow;

  const results: ParsedRow[] = [];
  for (const row of parsed) {
    const { errors, conflicts } = await validator(row.data);
    results.push({ rowNumber: row.rowNumber, data: row.data, errors, conflicts });
  }
  return results;
}

export interface CommitResult {
  createdCount: number;
  skipped: { rowNumber: number; reason: string }[];
}

/** Only rows with zero errors and zero conflict-check matches are created — see the
 * module-level comment on why conflicted rows are never auto-created here. */
export async function commitImport(actor: AccessTokenPayload, entityType: ImportEntityType, rows: ParsedRow[]): Promise<CommitResult> {
  let createdCount = 0;
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (const row of rows) {
    if (row.errors.length > 0) {
      skipped.push({ rowNumber: row.rowNumber, reason: row.errors.join("; ") });
      continue;
    }
    if (row.conflicts.length > 0) {
      skipped.push({ rowNumber: row.rowNumber, reason: "Possible conflict of interest — create individually with an override reason" });
      continue;
    }

    try {
      if (entityType === "clients") {
        await clientsService.createClient(actor, {
          name: row.data.name,
          type: row.data.type,
          email: row.data.email || undefined,
          phone: row.data.phone || undefined,
          address: row.data.address || undefined,
        });
      } else if (entityType === "contacts") {
        await contactsService.createContact(actor, {
          name: row.data.name,
          category: row.data.category,
          organization: row.data.organization || undefined,
          designation: row.data.designation || undefined,
          email: row.data.email || undefined,
          phone: row.data.phone || undefined,
          notes: row.data.notes || undefined,
        });
      } else {
        const partner = await prisma.user.findUniqueOrThrow({ where: { email: row.data.partnerEmail } });
        const clientIds = row.data.clientIds.split(",").map((s) => s.trim());
        const partyRoles = row.data.partyRoles.split(",").map((s) => s.trim());
        const clients = await prisma.client.findMany({ where: { clientId: { in: clientIds } } });
        const clientDbIds = clientIds.map((cid) => {
          const client = clients.find((c) => c.clientId === cid)!;
          return { clientId: client.id, partyRole: partyRoles[clientIds.indexOf(cid)] };
        });
        const advocateEmails = row.data.advocateEmails ? row.data.advocateEmails.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const advocates = advocateEmails.length
          ? await prisma.user.findMany({ where: { email: { in: advocateEmails } } })
          : [];

        await casesService.createCase(actor, {
          title: row.data.title,
          practiceArea: row.data.practiceArea,
          courtCaseNumber: row.data.courtCaseNumber || undefined,
          courtName: row.data.courtName || undefined,
          jurisdiction: row.data.jurisdiction || undefined,
          partnerId: partner.id,
          advocateIds: advocates.map((a) => a.id),
          clients: clientDbIds,
          stage: row.data.stage || undefined,
          caseType: row.data.caseType || undefined,
          oppositeCounsel: row.data.oppositeCounsel || undefined,
          oppositeParty: row.data.oppositeParty || undefined,
          department: row.data.department || undefined,
        });
      }
      createdCount += 1;
    } catch (err) {
      skipped.push({ rowNumber: row.rowNumber, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  await recordAuditLog(actor, "DATA_IMPORT_COMPLETED", "DataImport", undefined, {
    entityName: entityType,
    details: `${createdCount} created, ${skipped.length} skipped`,
  });

  return { createdCount, skipped };
}
