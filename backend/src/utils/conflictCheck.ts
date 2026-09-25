import { prisma } from "../config/prisma";
import { ConflictCheckError, ForbiddenError } from "./errors";
import { AccessTokenPayload } from "./jwt";

/**
 * Milestone 1 (Version 1.0 completion, SRD Section 10.2 — Advanced Conflict Check).
 * Fuzzy/partial name matching, dependency-free (no NLP library) — good enough for
 * catching typo-level duplicates and partial-name overlaps across a single firm's
 * record volume, which is the actual bar SRD 10.2 sets ("cross-checks entered names
 * ... using fuzzy/partial matching").
 *
 * Scope: checks the entered name against existing Client names, Contact names, and
 * already-used OPPOSITE_PARTY/OPPOSITE_COUNSEL Picklist values — the entities this
 * application actually tracks. Directors/Partners/Shareholders/Company Names named in
 * the SRD's narrative aren't a distinct tracked entity anywhere in this schema.
 */
export interface ConflictMatch {
  type: "CLIENT" | "CONTACT" | "OPPOSITE_PARTY" | "OPPOSITE_COUNSEL";
  id: string;
  label: string;
  confidence: "HIGH" | "MEDIUM";
}

/** Exported for reuse by Global Search (Milestone 3, SRD Section 23 — "shared logic
 * with Advanced Conflict Check") — ranking name-like fields by fuzzy similarity rather
 * than requiring an exact substring match. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) dist[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const longer = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / longer;
}

const HIGH_THRESHOLD = 0.92;
const MEDIUM_THRESHOLD = 0.75;
const MIN_CONTAINMENT_LENGTH = 4;

function evaluate(
  entered: string,
  candidates: { id: string; label: string }[],
  type: ConflictMatch["type"],
  excludeId?: string
): ConflictMatch[] {
  const matches: ConflictMatch[] = [];
  const na = normalize(entered);

  for (const candidate of candidates) {
    if (excludeId && candidate.id === excludeId) continue;
    const nb = normalize(candidate.label);
    if (!nb) continue;

    const sim = similarity(entered, candidate.label);
    const contains =
      na.length >= MIN_CONTAINMENT_LENGTH && nb.length >= MIN_CONTAINMENT_LENGTH && (na.includes(nb) || nb.includes(na));

    if (sim >= HIGH_THRESHOLD) {
      matches.push({ type, id: candidate.id, label: candidate.label, confidence: "HIGH" });
    } else if (sim >= MEDIUM_THRESHOLD || contains) {
      matches.push({ type, id: candidate.id, label: candidate.label, confidence: "MEDIUM" });
    }
  }
  return matches;
}

export interface FindConflictsOptions {
  excludeClientId?: string;
  excludeContactId?: string;
}

export async function findConflicts(name: string, options: FindConflictsOptions = {}): Promise<ConflictMatch[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const [clients, contacts, oppositeParties, oppositeCounsels] = await Promise.all([
    prisma.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    // Contacts redesign pass (2026-08-07b) — client-linked contacts are excluded here;
    // they'd only ever duplicate the CLIENT match above for the same underlying name.
    prisma.contact.findMany({ where: { deletedAt: null, clientId: null }, select: { id: true, name: true } }),
    prisma.picklistValue.findMany({ where: { category: "OPPOSITE_PARTY", isActive: true }, select: { id: true, value: true } }),
    prisma.picklistValue.findMany({ where: { category: "OPPOSITE_COUNSEL", isActive: true }, select: { id: true, value: true } }),
  ]);

  return [
    ...evaluate(trimmed, clients.map((c) => ({ id: c.id, label: c.name })), "CLIENT", options.excludeClientId),
    ...evaluate(trimmed, contacts.map((c) => ({ id: c.id, label: c.name })), "CONTACT", options.excludeContactId),
    ...evaluate(trimmed, oppositeParties.map((p) => ({ id: p.id, label: p.value })), "OPPOSITE_PARTY"),
    ...evaluate(trimmed, oppositeCounsels.map((p) => ({ id: p.id, label: p.value })), "OPPOSITE_COUNSEL"),
  ];
}

export interface ConflictAcknowledgement {
  conflictAcknowledged?: boolean;
  conflictReason?: string;
}

/**
 * The full pre-create gate: find possible matches, and if any exist, enforce the SRD's
 * override rule — "requiring explicit Partner acknowledgment/override with a mandatory
 * logged reason" — before letting the caller proceed. Returns the matches (empty if
 * none) so the caller can write the ConflictCheckLog row itself once the new record's
 * id exists (this function runs before creation, so it never has that id yet).
 */
export async function requireConflictClearance(
  actor: AccessTokenPayload,
  name: string,
  input: ConflictAcknowledgement,
  options: FindConflictsOptions = {}
): Promise<ConflictMatch[]> {
  const matches = await findConflicts(name, options);
  if (matches.length === 0) return matches;

  if (!input.conflictAcknowledged) {
    throw new ConflictCheckError(
      "Possible conflict of interest detected — review the matches before proceeding.",
      matches
    );
  }
  if (actor.role !== "MANAGING_PARTNER") {
    throw new ForbiddenError("Only the Managing Partner can acknowledge/override a conflict-check match");
  }
  if (!input.conflictReason?.trim()) {
    throw new ConflictCheckError("A reason is required to override a possible conflict match.", matches);
  }
  return matches;
}

/** Call after the triggering record is created, only when `matches.length > 0`. */
export async function logConflictOverride(
  actor: AccessTokenPayload,
  triggerType: "CLIENT" | "CONTACT",
  triggerEntityId: string,
  searchedName: string,
  matches: ConflictMatch[],
  reason: string
): Promise<void> {
  await prisma.conflictCheckLog.create({
    data: {
      triggerType,
      triggerEntityId,
      searchedName,
      matches: matches as unknown as object,
      reason: reason.trim(),
      overriddenById: actor.sub,
    },
  });
}
