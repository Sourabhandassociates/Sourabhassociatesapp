import crypto from "crypto";
import { ClientStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { generateClientId } from "../../utils/idGenerator";
import { hashPassword } from "../../utils/password";
import { NotFoundError } from "../../utils/errors";
import { assertClientAccess, clientScopeWhere, caseScopeWhere } from "../../utils/authorization";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { logConflictOverride, requireConflictClearance, ConflictAcknowledgement } from "../../utils/conflictCheck";
import { syncClientContact } from "../contacts/contacts.service";
import { AccessTokenPayload } from "../../utils/jwt";

export interface CreateClientInput extends ConflictAcknowledgement {
  name: string;
  /** Step 4 — free text, validated by UI curation via the CLIENT_TYPE picklist
   * category rather than a DB enum (matches Case.stage/caseType's convention).
   * Optional as of the Client-module optional-fields pass (2026-08-06) — see
   * `Client.type`'s schema doc comment. */
  type?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/** A blank/whitespace-only string is treated the same as "not supplied" — stored as
 * NULL rather than an empty string, so display code only ever has to check for one
 * falsy shape (`null`), not two. */
function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * SRD Section 11.1 — Client ID is auto-generated and immutable; a temporary
 * password is generated for the client to log in with (to be relayed securely
 * by staff — automated delivery via email/SMS is a later-phase Notifications feature).
 *
 * Milestone 1 (Version 1.0 completion, SRD Section 10.2) — Advanced Conflict Check
 * runs here: the entered name is fuzzy-matched against existing Client/Contact names
 * and used Opposite Party/Opposite Counsel values before the record is created.
 */
export async function createClient(actor: AccessTokenPayload, input: CreateClientInput) {
  const name = input.name.trim();
  const matches = await requireConflictClearance(actor, name, input);

  const clientId = await generateClientId();
  // System-generated, not user-chosen, so complexity rules (utils/validators.ts's
  // passwordSchema) don't apply the same way — what matters here is entropy: 12 random
  // bytes is 96 bits, comfortably above the staff password policy's floor.
  const temporaryPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const client = await prisma.client.create({
    data: {
      name,
      type: normalizeOptional(input.type),
      email: normalizeOptional(input.email),
      phone: normalizeOptional(input.phone),
      address: normalizeOptional(input.address),
      clientId,
      passwordHash,
    },
  });

  await recordAuditLog(actor, "CLIENT_CREATED", "Client", client.id, {
    entityName: client.clientId,
  });

  if (matches.length > 0) {
    await logConflictOverride(
      actor,
      "CLIENT",
      client.id,
      name,
      matches,
      input.conflictReason!,
    );
  }

  // Contacts redesign pass (2026-08-07b) — the Client Contacts directory entry is
  // created automatically, in the same request, with no separate action required.
  await syncClientContact(actor, client);

  return {
    client: {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      type: client.type,
      email: client.email,
      phone: client.phone,
      status: client.status,
    },
    temporaryPassword,
  };
}

/**
 * Reset a client's portal password.
 *
 * A new temporary password is generated and stored as a bcrypt hash.
 * The plaintext temporary password is returned once so authorized staff
 * can securely provide it to the client.
 */
export async function resetClientPassword(
  actor: AccessTokenPayload,
  clientId: string,
) {
  const client = await prisma.client.findUnique({
    where: { clientId },
  });

  if (!client) {
    throw new NotFoundError("Client not found");
  }

  const temporaryPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.client.update({
    where: { id: client.id },
    data: { passwordHash },
  });

  await recordAuditLog(
    actor,
    "CLIENT_PASSWORD_RESET",
    "Client",
    client.id,
    { entityName: client.clientId },
  );

  return {
    clientId: client.clientId,
    temporaryPassword,
  };
}

/** SRD Section 3.2 — Associates/Junior Associates only see clients linked to a case they have access to. */
/** Milestone 4 (Version 1.0 completion) — IMPROVEMENTS.md #16 (pagination). Response
 * stays a plain array (see cases.service.ts's listCases for the same pattern and
 * rationale) — metadata rides in response headers, not the JSON body. */
export async function listClients(
  actor: AccessTokenPayload,
  search: string,
  page = 1,
  pageSize = 50,
) {
  const where = {
    deletedAt: null,
    ...clientScopeWhere(actor),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { clientId: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const sanitized = clients.map(({ passwordHash: _passwordHash, ...rest }) => rest);
  return Object.assign(sanitized, { total, page, pageSize });
}

export async function getClient(actor: AccessTokenPayload, clientId: string) {
  await assertClientAccess(actor, clientId);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      cases: {
        include: {
          case: {
            include: {
              advocates: true,
            },
          },
        },
      },
    },
  });

  if (!client) {
    // Already confirmed to exist and be in-scope by assertClientAccess above; this
    // branch only guards a delete-between-requests race and satisfies TypeScript.
    throw new NotFoundError("Client not found");
  }

  const { passwordHash: _passwordHash, cases, ...rest } = client;

  // A client linked to multiple matters may have matters the requesting Associate/Junior
  // Associate has no access to (e.g., handled entirely by a different Advocate) — only
  // surface the ones the actor is actually authorized to see (ARCHITECTURE_REVIEW.md §4).
  const scope = caseScopeWhere(actor);
  const isUnrestricted = Object.keys(scope).length === 0;

  const visibleCases = cases
    .filter(
      (cc) =>
        isUnrestricted ||
        cc.case.partnerId === actor.sub ||
        cc.case.advocates.some((a) => a.userId === actor.sub),
    )
    .map((cc) => ({
      partyRole: cc.partyRole,
      case: {
        id: cc.case.id,
        matterNumber: cc.case.matterNumber,
        title: cc.case.title,
        status: cc.case.status,
      },
    }));

  return { ...rest, cases: visibleCases };
}

export interface UpdateClientInput {
  name?: string;
  type?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Client-module optional-fields pass (2026-08-06) — a field is only touched when
 * the caller actually included it in the request body; when included but blank, it's
 * explicitly cleared to NULL (`normalizeOptional`) rather than left as an empty
 * string, so a client's Type/Email/Phone/Address can be filled in — or cleared back
 * out — at any point after creation, same as they can be left blank at creation.
 */
export async function updateClient(
  actor: AccessTokenPayload,
  clientId: string,
  input: UpdateClientInput,
) {
  const before = await assertClientAccess(actor, clientId);

  const data: {
    name?: string;
    type?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.type !== undefined) data.type = normalizeOptional(input.type);
  if (input.email !== undefined) data.email = normalizeOptional(input.email);
  if (input.phone !== undefined) data.phone = normalizeOptional(input.phone);
  if (input.address !== undefined) data.address = normalizeOptional(input.address);

  const client = await prisma.client.update({
    where: { id: clientId },
    data,
  });

  const changes = diffObjects(before, client, [
    "name",
    "type",
    "email",
    "phone",
    "address",
  ]);

  if (changes) {
    await recordAuditLog(
      actor,
      "CLIENT_UPDATED",
      "Client",
      clientId,
      {
        entityName: client.clientId,
        changes,
      },
    );
  }

  // Contacts redesign pass (2026-08-07b) — keeps the Client Contacts directory entry
  // synchronized on every edit, regardless of which subset of fields actually changed.
  await syncClientContact(actor, client);

  const { passwordHash: _passwordHash, ...rest } = client;
  return rest;
}

/** SRD Section 3.1 — status changes (e.g., blacklisting) are Managing Partner–only (route-gated). */
export async function setClientStatus(
  actor: AccessTokenPayload,
  clientId: string,
  status: ClientStatus,
) {
  const before = await prisma.client.findUnique({
    where: { id: clientId },
  });

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { status },
  });

  await recordAuditLog(actor, "CLIENT_STATUS_CHANGED", "Client", clientId, {
    entityName: client.clientId,
    changes: {
      status: {
        old: before?.status ?? null,
        new: client.status,
      },
    },
  });

  return {
    id: client.id,
    status: client.status,
  };
}

/**
 * Step 2 — Soft Delete & Recycle Bin (SRD Section 27), Managing-Partner-only (route-gated,
 * matching the same significance level as `setClientStatus`). Soft-delete only — the
 * record and all its case links stay intact for restore from the Recycle Bin.
 */
export async function deleteClient(
  actor: AccessTokenPayload,
  clientId: string,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client || client.deletedAt) {
    throw new NotFoundError("Client not found");
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      deletedAt: new Date(),
      deletedById: actor.sub,
    },
  });

  await recordAuditLog(
    actor,
    "CLIENT_DELETED",
    "Client",
    clientId,
    {
      entityName: client.clientId,
    },
  );
}

export interface UpdatePortalPermissionsInput {
  portalCasesEnabled?: boolean;
  portalHearingHistoryEnabled?: boolean;
  portalDocumentsEnabled?: boolean;
}

/**
 * Client Portal Permissions (2026-08-14), Managing-Partner-gated (route-level
 * CLIENTS.MANAGE_PORTAL_ACCESS). Every change is audit-logged with a structured
 * diff; a PATCH that sets a flag to its current value produces no row at all,
 * since diffObjects returns null on a genuine no-op. */
export async function updatePortalPermissions(
  actor: AccessTokenPayload,
  clientId: string,
  input: UpdatePortalPermissionsInput,
) {
  const before = await assertClientAccess(actor, clientId);

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(input.portalCasesEnabled !== undefined
        ? { portalCasesEnabled: input.portalCasesEnabled }
        : {}),
      ...(input.portalHearingHistoryEnabled !== undefined
        ? { portalHearingHistoryEnabled: input.portalHearingHistoryEnabled }
        : {}),
      ...(input.portalDocumentsEnabled !== undefined
        ? { portalDocumentsEnabled: input.portalDocumentsEnabled }
        : {}),
    },
  });

  const changes = diffObjects(before, client, [
    "portalCasesEnabled",
    "portalHearingHistoryEnabled",
    "portalDocumentsEnabled",
  ]);

  if (changes) {
    await recordAuditLog(
      actor,
      "CLIENT_PORTAL_PERMISSION_CHANGED",
      "Client",
      clientId,
      {
        entityName: client.clientId,
        changes,
      },
    );
  }

  const { passwordHash: _passwordHash, ...rest } = client;
  return rest;
}