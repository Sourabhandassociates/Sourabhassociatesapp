import { prisma } from "../config/prisma";
import { env } from "../config/env";

/**
 * Atomically increments a named counter and returns the new value.
 * Backs Client ID (Section 11.1) and Matter Number (Section 10.1) generation.
 */
async function nextSequence(key: string): Promise<number> {
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

/** SRD Section 11.1: SA-CLI-000001, sequential, never reused, immutable. */
export async function generateClientId(): Promise<string> {
  const n = await nextSequence("CLIENT_ID");
  return `${env.clientIdPrefix}${String(n).padStart(6, "0")}`;
}

/** SRD Section 10.1: SA-MAT-2026-0001, prefix + year + sequence, resets sequence each calendar year. */
export async function generateMatterNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const n = await nextSequence(`MATTER_NUMBER_${year}`);
  return `${env.matterNumberPrefix}${year}-${String(n).padStart(4, "0")}`;
}

/** Milestone 2 (Version 1.0 completion, SRD Section 16): SA-INV-2026-0001, same
 * prefix + year + sequence shape as Matter Number. */
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const n = await nextSequence(`INVOICE_NUMBER_${year}`);
  return `${env.invoiceNumberPrefix}${year}-${String(n).padStart(4, "0")}`;
}
