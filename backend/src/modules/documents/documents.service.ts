import path from "path";
import { DocumentConfidentiality } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import {
  assertCaseAccess,
  assertDocumentAccess,
  assertDocumentVersionAccess,
} from "../../utils/authorization";
import { recordAuditLog } from "../../utils/auditLog";
import { notifyCaseTeam } from "../../utils/notify";
import { validateUploadedFile } from "./fileValidation";
import { AccessTokenPayload } from "../../utils/jwt";

export interface CreateDocumentInput {
  title: string;
  category: string;
  confidentiality: DocumentConfidentiality;
}

/** SRD Section 13.1 — upload creates a Document plus its first version (v1). */
export async function uploadDocument(
  actor: AccessTokenPayload,
  caseId: string,
  file: Express.Multer.File,
  data: CreateDocumentInput
) {
  await assertCaseAccess(actor, caseId);
  await validateUploadedFile({ filePath: file.path, declaredMimeType: file.mimetype, actorId: actor.sub });

  const document = await prisma.document.create({
    data: {
      caseId,
      title: data.title,
      category: data.category,
      confidentiality: data.confidentiality,
      createdById: actor.sub,
      versions: {
        create: {
          versionNumber: 1,
          fileName: file.originalname,
          storagePath: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: actor.sub,
        },
      },
    },
    include: { versions: true },
  });

  await recordAuditLog(actor, "DOCUMENT_UPLOADED", "Document", document.id, { entityName: document.title });

  // Milestone 3 (SRD Section 17) — "document upload" trigger.
  await notifyCaseTeam(caseId, "DOCUMENT_UPLOADED", `A new document was uploaded: ${document.title}`, actor.sub);

  return document;
}

/** SRD Section 13.1 — every re-upload creates a new version; prior versions retained. */
export async function addVersion(actor: AccessTokenPayload, documentId: string, file: Express.Multer.File) {
  const document = await assertDocumentAccess(actor, documentId);
  await validateUploadedFile({ filePath: file.path, declaredMimeType: file.mimetype, actorId: actor.sub });

  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      fileName: file.originalname,
      storagePath: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: actor.sub,
    },
  });
  await recordAuditLog(actor, "DOCUMENT_VERSION_ADDED", "Document", documentId, {
    entityName: document.title,
    details: `v${version.versionNumber}: ${file.originalname}`,
  });
  return version;
}

/** Milestone 4 (Version 1.0 completion) — IMPROVEMENTS.md #16 (pagination). Same
 * plain-array-plus-header-metadata pattern as cases.service.ts's listCases. */
export async function listDocumentsForCase(actor: AccessTokenPayload, caseId: string, page = 1, pageSize = 50) {
  await assertCaseAccess(actor, caseId);

  const where = { caseId, deletedAt: null };
  const [total, documents] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return Object.assign(documents, { total, page, pageSize });
}

export async function getDocument(actor: AccessTokenPayload, documentId: string) {
  await assertDocumentAccess(actor, documentId);

  return prisma.document.findUnique({
    where: { id: documentId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function getDownloadInfo(actor: AccessTokenPayload, versionId: string) {
  await assertDocumentVersionAccess(actor, versionId);

  const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
  return {
    filePath: path.join(path.resolve(env.uploadDir), version.storagePath),
    fileName: version.fileName,
  };
}

/** Step 2 — Soft Delete & Recycle Bin (SRD Section 27). Soft-delete only — the document
 * row and every version stay intact on disk and in the DB for the Managing Partner to
 * restore from the Recycle Bin. */
export async function deleteDocument(actor: AccessTokenPayload, documentId: string) {
  const document = await assertDocumentAccess(actor, documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date(), deletedById: actor.sub },
  });
  await recordAuditLog(actor, "DOCUMENT_DELETED", "Document", documentId, { entityName: document.title });
}
