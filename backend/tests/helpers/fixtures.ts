import { prisma } from "../../src/config/prisma";
import { hashPassword } from "../../src/utils/password";
import { signAccessToken, ActorType } from "../../src/utils/jwt";
import { generateClientId, generateMatterNumber } from "../../src/utils/idGenerator";

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}@test.local`;
}

export type StaffRole =
  "MANAGING_PARTNER" | "ASSOCIATE" | "JUNIOR_ASSOCIATE" | "OFFICE_STAFF" | "ACCOUNTS_TEAM";

export async function createUser(role: StaffRole, name = `Test ${role}`) {
  const passwordHash = await hashPassword("Test1234!");
  return prisma.user.create({
    data: { name, email: unique(role.toLowerCase()), passwordHash, role, status: "ACTIVE" },
  });
}

export async function createClient(name = "Test Client") {
  const passwordHash = await hashPassword("Test1234!");
  const clientId = await generateClientId();
  return prisma.client.create({
    data: { name, type: "INDIVIDUAL", clientId, passwordHash, status: "ACTIVE" },
  });
}

interface CreateCaseOptions {
  partnerId: string;
  advocateIds?: string[];
  clientIds?: string[];
}

export async function createCase({ partnerId, advocateIds = [], clientIds = [] }: CreateCaseOptions) {
  const matterNumber = await generateMatterNumber();
  return prisma.case.create({
    data: {
      matterNumber,
      title: "Test Matter",
      practiceArea: "Test",
      partnerId,
      advocates: { create: advocateIds.map((userId) => ({ userId })) },
      clients: { create: clientIds.map((clientId) => ({ clientId, partyRole: "Plaintiff" })) },
    },
  });
}

/**
 * Signs a real access token via the same code path production uses, plus a real
 * (but otherwise unused) session row — requireAuth only verifies the JWT itself,
 * but creating a matching session keeps fixtures realistic and future-proof for
 * any middleware that starts checking session state too.
 */
export async function tokenForUser(userId: string, role: StaffRole): Promise<string> {
  const session = await prisma.userSession.create({
    data: { userId, deviceInfo: "vitest", refreshTokenHash: "unused-in-tests" },
  });
  return signAccessToken({ sub: userId, actorType: "USER" as ActorType, role, sessionId: session.id });
}

export async function tokenForClient(clientId: string): Promise<string> {
  const session = await prisma.clientSession.create({
    data: { clientId, deviceInfo: "vitest", refreshTokenHash: "unused-in-tests" },
  });
  return signAccessToken({
    sub: clientId,
    actorType: "CLIENT" as ActorType,
    role: "CLIENT",
    sessionId: session.id,
  });
}

export async function createTask(caseId: string, assignedToId: string, assignedById: string) {
  return prisma.task.create({
    data: { caseId, title: "Test Task", assignedToId, assignedById },
  });
}

/** ACCOUNTS module (2026-08-14). */
export async function createProfessionalFee(
  clientId: string,
  createdById: string,
  opts?: { caseId?: string; amount?: number; dueDate?: Date | null }
) {
  return prisma.professionalFee.create({
    data: {
      clientId,
      caseId: opts?.caseId,
      amount: opts?.amount ?? 100_000,
      createdById,
      dueDate: opts?.dueDate,
    },
  });
}

export async function createAccountsPayment(
  clientId: string,
  recordedById: string,
  opts?: { caseId?: string; feeId?: string; amount?: number; paymentDate?: Date; mode?: string }
) {
  return prisma.accountsPayment.create({
    data: {
      clientId,
      caseId: opts?.caseId,
      feeId: opts?.feeId,
      amount: opts?.amount ?? 10_000,
      paymentDate: opts?.paymentDate,
      mode: (opts?.mode as never) ?? "CASH",
      recordedById,
    },
  });
}

export async function createDocument(
  caseId: string,
  createdById: string,
  opts?: { confidentiality?: "INTERNAL" | "CLIENT_VISIBLE" }
) {
  return prisma.document.create({
    data: {
      caseId,
      title: "Test Document",
      category: "Pleadings",
      confidentiality: opts?.confidentiality ?? "INTERNAL",
      createdById,
      versions: {
        create: {
          versionNumber: 1,
          fileName: "test.txt",
          storagePath: "does-not-exist-on-disk.txt",
          mimeType: "text/plain",
          sizeBytes: 3,
          uploadedById: createdById,
        },
      },
    },
    include: { versions: true },
  });
}
