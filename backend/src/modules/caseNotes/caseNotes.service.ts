import { NoteVisibility } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { assertCaseAccess } from "../../utils/authorization";
import { recordAuditLog } from "../../utils/auditLog";
import { AccessTokenPayload } from "../../utils/jwt";

export interface AddCaseNoteInput {
  content: string;
  visibility?: NoteVisibility;
}

/**
 * SRD Section 7/4 — Case Notes/Diary: hearing proceedings, adjudication updates, client
 * discussions, internal strategy, observations. Append-only (no update/delete service
 * function exists) — a diary is a historical record, not a document to revise.
 */
export async function addCaseNote(actor: AccessTokenPayload, caseId: string, data: AddCaseNoteInput) {
  await assertCaseAccess(actor, caseId);

  const note = await prisma.caseNote.create({
    data: {
      caseId,
      authorId: actor.sub,
      content: data.content,
      visibility: data.visibility,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  await recordAuditLog(actor, "CASE_NOTE_ADDED", "CaseNote", note.id, { details: `Case ${caseId}` });
  return note;
}

export async function listCaseNotes(actor: AccessTokenPayload, caseId: string) {
  await assertCaseAccess(actor, caseId);

  return prisma.caseNote.findMany({
    where: { caseId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
