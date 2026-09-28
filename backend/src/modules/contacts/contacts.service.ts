import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { logConflictOverride, requireConflictClearance, ConflictAcknowledgement } from "../../utils/conflictCheck";
import { AccessTokenPayload } from "../../utils/jwt";

/**
 * Contacts redesign pass (2026-08-07b) — the Contacts module is now two things under
 * one directory:
 *
 *  1. An auto-synced, read-only mirror of every Client's own contact info. Client is
 *     the single source of truth — this module never creates or edits those rows
 *     directly; `syncClientContact` (called from clients.service.ts on Client
 *     create/update) is the only writer. See `listClientDirectory`.
 *  2. A manually-managed list of non-client professional contacts (Judges, Opposing
 *     Counsel, CAs, vendors — SRD Section 12's original scope). Everything below this
 *     comment except `syncClientContact`/`listClientDirectory` operates on this list
 *     only — `clientId` is always null here, enforced by rejecting it on create and
 *     by refusing to edit/delete/link-matter a client-managed row.
 */
export interface CreateContactInput extends ConflictAcknowledgement {
  name: string;
  category: string;
  organization?: string;
  designation?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

/** SRD Section 10.2 — Advanced Conflict Check runs on Contact creation, same shared
 * gate as Client creation (utils/conflictCheck.ts). */
export async function createContact(actor: AccessTokenPayload, input: CreateContactInput) {
  const name = input.name.trim();
  const matches = await requireConflictClearance(actor, name, input);

  const contact = await prisma.contact.create({
    data: {
      name,
      category: input.category,
      organization: input.organization,
      designation: input.designation,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      createdById: actor.sub,
    },
  });
  await recordAuditLog(actor, "CONTACT_CREATED", "Contact", contact.id, { entityName: contact.name });

  if (matches.length > 0) {
    await logConflictOverride(actor, "CONTACT", contact.id, name, matches, input.conflictReason!);
  }
  return contact;
}

/** The manually-managed (non-client) professional contacts list — `clientId` is
 * always null here by construction (see module comment). */
export async function listContacts(search: string, category?: string) {
  return prisma.contact.findMany({
    where: {
      deletedAt: null,
      clientId: null,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { organization: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getContact(contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, deletedAt: null },
    include: {
      matters: { include: { case: { select: { id: true, matterNumber: true, title: true, status: true } } } },
    },
  });
  if (!contact) throw new NotFoundError("Contact not found");
  return contact;
}

function assertNotClientManaged(contact: { clientId: string | null }) {
  if (contact.clientId) {
    throw new BadRequestError(
      "This contact mirrors a Client's own details and can only be changed by editing that Client."
    );
  }
}

export interface UpdateContactInput {
  name?: string;
  category?: string;
  organization?: string;
  designation?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export async function updateContact(actor: AccessTokenPayload, contactId: string, input: UpdateContactInput) {
  const existing = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Contact not found");
  assertNotClientManaged(existing);

  const contact = await prisma.contact.update({ where: { id: contactId }, data: input });
  const changes = diffObjects(existing, contact, ["name", "category", "organization", "designation", "email", "phone", "notes"]);
  if (changes) {
    await recordAuditLog(actor, "CONTACT_UPDATED", "Contact", contactId, { entityName: contact.name, changes });
  }
  return contact;
}

export async function deleteContact(actor: AccessTokenPayload, contactId: string) {
  const existing = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Contact not found");
  assertNotClientManaged(existing);

  await prisma.contact.update({
    where: { id: contactId },
    data: { deletedAt: new Date(), deletedById: actor.sub },
  });
  await recordAuditLog(actor, "CONTACT_DELETED", "Contact", contactId, { entityName: existing.name });
}

export async function linkMatter(actor: AccessTokenPayload, contactId: string, caseId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!contact) throw new NotFoundError("Contact not found");
  assertNotClientManaged(contact);
  const caseRecord = await prisma.case.findFirst({ where: { id: caseId, deletedAt: null } });
  if (!caseRecord) throw new NotFoundError("Case not found");

  const link = await prisma.contactMatter.upsert({
    where: { contactId_caseId: { contactId, caseId } },
    create: { contactId, caseId },
    update: {},
  });
  await recordAuditLog(actor, "CONTACT_LINKED_TO_MATTER", "Contact", contactId, { entityName: contact.name, details: caseRecord.matterNumber });
  return link;
}

export async function unlinkMatter(actor: AccessTokenPayload, contactId: string, caseId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!contact) throw new NotFoundError("Contact not found");
  assertNotClientManaged(contact);

  await prisma.contactMatter.deleteMany({ where: { contactId, caseId } });
  await recordAuditLog(actor, "CONTACT_UNLINKED_FROM_MATTER", "Contact", contactId, { entityName: contact.name, details: caseId });
}

/**
 * The only writer of a client-linked Contact row. Called from clients.service.ts on
 * both create and update so the two record types can never drift apart — `upsert` on
 * the unique `clientId` means "create the mirror if this is the first time, otherwise
 * refresh it to the client's current values" is one operation, not two call sites to
 * keep in sync by hand. `category` is a fixed system value, not user-selectable (it
 * isn't shown anywhere in the Client Contacts directory view), distinguishing these
 * rows from the CONTACT_CATEGORY-picklist-driven manual contacts at a glance if ever
 * inspected directly.
 */
export async function syncClientContact(
  actor: AccessTokenPayload,
  client: { id: string; name: string; email: string | null; phone: string | null }
) {
  await prisma.contact.upsert({
    where: { clientId: client.id },
    create: {
      name: client.name,
      category: "Client",
      email: client.email,
      phone: client.phone,
      clientId: client.id,
      createdById: actor.sub,
    },
    update: {
      name: client.name,
      email: client.email,
      phone: client.phone,
    },
  });
}

/**
 * The Client Contacts directory (requirement: Contact Name / Client Name / Client
 * Type / Mobile / Email / Address / Status). Address/Type/Status are never copied
 * onto Contact — they're read live from the joined Client on every request, so
 * there's nothing to fall out of sync (see schema.prisma's Contact.clientId comment).
 * A soft-deleted Client's row is simply excluded by the join (`client.deletedAt:
 * null`) rather than requiring its Contact to be independently soft-deleted/restored.
 */
export async function listClientDirectory(search?: string) {
  const contacts = await prisma.contact.findMany({
    where: {
      clientId: { not: null },
      client: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { clientId: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    },
    include: { client: { select: { id: true, clientId: true, name: true, type: true, status: true, address: true } } },
    orderBy: { name: "asc" },
  });

  return contacts.map((c) => ({
    id: c.id,
    contactName: c.name,
    email: c.email,
    mobile: c.phone,
    client: c.client!,
  }));
}
