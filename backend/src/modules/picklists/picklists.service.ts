import { PicklistCategory } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors";
import { recordAuditLog, diffObjects } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";

const CATEGORIES = Object.values(PicklistCategory);

function assertValidCategory(category: string): asserts category is PicklistCategory {
  if (!CATEGORIES.includes(category as PicklistCategory)) {
    throw new BadRequestError(`Unknown picklist category: ${category}`);
  }
}

/**
 * Step 1 revision (Managing Partner review, item 8) — every staff member can read the
 * active values for a category (populating a dropdown); only the Managing Partner can
 * add/rename/deactivate them (item 8: "Managed centrally from Admin Settings").
 */
export async function listValues(category: string, includeInactive = false) {
  assertValidCategory(category);
  return prisma.picklistValue.findMany({
    where: { category, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { value: "asc" },
  });
}

export async function addValue(actor: AccessTokenPayload, category: string, value: string) {
  assertValidCategory(category);
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestError("Value cannot be empty");

  const existing = await prisma.picklistValue.findUnique({
    where: { category_value: { category, value: trimmed } },
  });
  if (existing) {
    if (existing.isActive) throw new ConflictError("This value already exists");
    const reactivated = await prisma.picklistValue.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
    await recordAuditLog(actor, "PICKLIST_VALUE_REACTIVATED", "PicklistValue", reactivated.id, { entityName: trimmed });
    return reactivated;
  }

  const created = await prisma.picklistValue.create({ data: { category, value: trimmed } });
  await recordAuditLog(actor, "PICKLIST_VALUE_ADDED", "PicklistValue", created.id, {
    entityName: trimmed,
    details: category,
  });
  return created;
}

export interface UpdateValueInput {
  value?: string;
  isActive?: boolean;
}

export async function updateValue(actor: AccessTokenPayload, id: string, data: UpdateValueInput) {
  const existing = await prisma.picklistValue.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Picklist value not found");

  const trimmed = data.value?.trim();
  if (data.value !== undefined && !trimmed) throw new BadRequestError("Value cannot be empty");

  const updated = await prisma.picklistValue.update({
    where: { id },
    data: { value: trimmed, isActive: data.isActive },
  });

  const changes = diffObjects(existing, updated, ["value", "isActive"]);
  if (changes) {
    await recordAuditLog(actor, "PICKLIST_VALUE_UPDATED", "PicklistValue", id, {
      entityName: `${existing.category}: ${existing.value}`,
      changes,
    });
  }
  return updated;
}
