import { prisma } from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/errors";
import { recordAuditLog } from "../../utils/auditLog";
import { assertCaseAccess } from "../../utils/authorization";
import { AccessTokenPayload } from "../../utils/jwt";

/** Milestone 4 (Version 1.0 completion, SRD Section 24 — Custom Fields, "add fields to
 * existing entities via a field-builder UI, no code change"). Scoped to Case only for
 * Version 1.0 — see the schema.prisma doc comment on CustomFieldDefinition for why. */
const SUPPORTED_ENTITY_TYPES = ["CASE"];
const SUPPORTED_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN"];

export interface CreateFieldDefinitionInput {
  entityType: string;
  label: string;
  fieldType: string;
}

export async function createFieldDefinition(actor: AccessTokenPayload, input: CreateFieldDefinitionInput) {
  if (!SUPPORTED_ENTITY_TYPES.includes(input.entityType)) {
    throw new BadRequestError(`Unsupported entity type: ${input.entityType}`);
  }
  if (!SUPPORTED_FIELD_TYPES.includes(input.fieldType)) {
    throw new BadRequestError(`Unsupported field type: ${input.fieldType}`);
  }
  const definition = await prisma.customFieldDefinition.create({
    data: { entityType: input.entityType, label: input.label.trim(), fieldType: input.fieldType, createdById: actor.sub },
  });
  await recordAuditLog(actor, "CUSTOM_FIELD_DEFINED", "CustomFieldDefinition", definition.id, {
    entityName: input.label,
    details: input.entityType,
  });
  return definition;
}

export async function listFieldDefinitions(entityType: string) {
  return prisma.customFieldDefinition.findMany({
    where: { entityType, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function deactivateFieldDefinition(actor: AccessTokenPayload, id: string) {
  const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Custom field not found");
  await prisma.customFieldDefinition.update({ where: { id }, data: { isActive: false } });
  await recordAuditLog(actor, "CUSTOM_FIELD_DEACTIVATED", "CustomFieldDefinition", id, { entityName: existing.label });
}

/** Any staff member who can already access the case may view its custom field values
 * — this reuses Case's own row-level access check rather than adding a new one. */
export async function getFieldValuesForCase(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);
  const [definitions, values] = await Promise.all([
    listFieldDefinitions("CASE"),
    prisma.customFieldValue.findMany({ where: { entityId: caseId, definition: { entityType: "CASE", isActive: true } } }),
  ]);
  return definitions.map((def) => ({
    definitionId: def.id,
    label: def.label,
    fieldType: def.fieldType,
    value: values.find((v) => v.definitionId === def.id)?.value ?? null,
  }));
}

export interface SetFieldValueInput {
  definitionId: string;
  value: string;
}

/** Editing a case's custom field values is gated the same as editing the case itself
 * (CASES.EDIT, checked by the caller/route) plus the same row-level case-access check
 * every other case mutation goes through. */
export async function setFieldValuesForCase(actor: AccessTokenPayload, caseId: string, inputs: SetFieldValueInput[]) {
  await assertCaseAccess(actor, caseId);

  const definitionIds = inputs.map((i) => i.definitionId);
  const definitions = await prisma.customFieldDefinition.findMany({
    where: { id: { in: definitionIds }, entityType: "CASE", isActive: true },
  });
  if (definitions.length !== new Set(definitionIds).size) {
    throw new BadRequestError("One or more custom field definitions are invalid or inactive");
  }

  await prisma.$transaction(
    inputs.map((input) =>
      prisma.customFieldValue.upsert({
        where: { definitionId_entityId: { definitionId: input.definitionId, entityId: caseId } },
        create: { definitionId: input.definitionId, entityId: caseId, value: input.value },
        update: { value: input.value },
      })
    )
  );
  await recordAuditLog(actor, "CUSTOM_FIELD_VALUES_UPDATED", "Case", caseId, { details: `${inputs.length} field(s) updated` });
  return getFieldValuesForCase(actor, caseId);
}
