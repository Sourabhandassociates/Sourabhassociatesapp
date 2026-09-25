import { prisma } from "../../config/prisma";
import { AuthorizedActor } from "../../utils/jwt";
import { caseScopeWhere, clientScopeWhere } from "../../utils/authorization";
import { similarity } from "../../utils/conflictCheck";

/**
 * Milestone 3 (Version 1.0 completion, SRD Section 23 — Global Search). One unified
 * search across Client Name/Client ID, Matter Number/Court Case Number/Cause Title,
 * Document titles, Contacts, and Advocates. Knowledge Base and OCR text are out of
 * scope (both modules are deferred). RBAC is applied per-category rather than at a
 * single gate: Clients/Cases/Documents reuse the exact same row-level scope functions
 * every other module already goes through (`caseScopeWhere`/`clientScopeWhere`), and
 * Contacts is gated on the actor already holding CONTACTS.VIEW — so a search can never
 * surface something the actor couldn't already reach through its own screen.
 *
 * Matching: substring (case-insensitive) for identifier-like fields (Client ID, Matter
 * Number, Court Case Number) where a fuzzy edit-distance comparison wouldn't make sense,
 * plus fuzzy similarity (reusing Advanced Conflict Check's `similarity`, SRD Section
 * 10.2 — "shared logic" per Section 23) for name-like fields, so a typo-level query
 * still finds "Rajesh Kumar" when the user types "Rajes Kumar".
 */
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_TYPE = 15;
const FUZZY_THRESHOLD = 0.6;

export interface SearchResultItem {
  type: "CLIENT" | "CASE" | "DOCUMENT" | "CONTACT" | "ADVOCATE";
  id: string;
  label: string;
  subtitle?: string | null;
  /** The id to navigate to — for Documents this is the parent case, not the document itself. */
  linkId: string;
}

export interface SearchResults {
  clients: SearchResultItem[];
  cases: SearchResultItem[];
  documents: SearchResultItem[];
  contacts: SearchResultItem[];
  advocates: SearchResultItem[];
}

function matchesQuery(fields: (string | null | undefined)[], q: string): boolean {
  const nq = q.toLowerCase();
  return fields.some((f) => {
    if (!f) return false;
    if (f.toLowerCase().includes(nq)) return true;
    return similarity(f, q) >= FUZZY_THRESHOLD;
  });
}

export async function globalSearch(actor: AuthorizedActor, rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim();
  const empty: SearchResults = { clients: [], cases: [], documents: [], contacts: [], advocates: [] };
  if (q.length < MIN_QUERY_LENGTH) return empty;

  await prisma.recentSearch.create({ data: { userId: actor.sub, query: q } });

  const perms = actor.effectivePermissions ?? new Set<string>();

  const [clients, cases, contacts, advocates] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null, ...clientScopeWhere(actor) },
      select: { id: true, clientId: true, name: true },
    }),
    prisma.case.findMany({
      where: { deletedAt: null, ...caseScopeWhere(actor) },
      select: { id: true, matterNumber: true, courtCaseNumber: true, title: true, oppositeParty: true },
    }),
    // Contacts redesign pass (2026-08-07b) — client-linked contacts are excluded;
    // the CLIENT results above already cover that same underlying person/entity, and
    // Client is the single source of truth for it, not this mirrored Contact row.
    perms.has("CONTACTS.VIEW")
      ? prisma.contact.findMany({ where: { deletedAt: null, clientId: null }, select: { id: true, name: true, category: true } })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { in: ["MANAGING_PARTNER", "ASSOCIATE", "JUNIOR_ASSOCIATE"] } },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const matchedClients = clients.filter((c) => matchesQuery([c.name, c.clientId], q)).slice(0, MAX_RESULTS_PER_TYPE);
  const matchedCases = cases
    .filter((c) => matchesQuery([c.matterNumber, c.courtCaseNumber, c.title, c.oppositeParty], q))
    .slice(0, MAX_RESULTS_PER_TYPE);
  const matchedContacts = contacts.filter((c) => matchesQuery([c.name], q)).slice(0, MAX_RESULTS_PER_TYPE);
  const matchedAdvocates = advocates.filter((u) => matchesQuery([u.name], q)).slice(0, MAX_RESULTS_PER_TYPE);

  // Documents only ever come from cases already in the actor's scope (`cases` above),
  // never a separate unscoped query — the same "case access implies document access"
  // rule the Documents module itself already follows (documents.routes.ts).
  const caseIds = cases.map((c) => c.id);
  const documents = caseIds.length
    ? await prisma.document.findMany({
        where: { deletedAt: null, caseId: { in: caseIds }, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true, caseId: true, case: { select: { matterNumber: true } } },
        take: MAX_RESULTS_PER_TYPE,
      })
    : [];

  return {
    clients: matchedClients.map((c) => ({ type: "CLIENT", id: c.id, label: c.name, subtitle: c.clientId, linkId: c.id })),
    // New Case form simplification (2026-08-11) — Case.title is now optional;
    // fall back to the always-present Matter Number as the search result label.
    cases: matchedCases.map((c) => ({ type: "CASE", id: c.id, label: c.title || c.matterNumber, subtitle: c.matterNumber, linkId: c.id })),
    documents: documents.map((d) => ({
      type: "DOCUMENT",
      id: d.id,
      label: d.title,
      // `caseId: { in: caseIds }` above guarantees a real case for every result here
      // (ACCOUNTS module, 2026-08-14 — Document.caseId is nullable in the schema now,
      // for a client-level receipt with no case, but that never matches this query).
      subtitle: d.case?.matterNumber ?? "",
      linkId: d.caseId ?? "",
    })),
    contacts: matchedContacts.map((c) => ({
      type: "CONTACT",
      id: c.id,
      label: c.name,
      subtitle: c.category,
      linkId: c.id,
    })),
    advocates: matchedAdvocates.map((u) => ({ type: "ADVOCATE", id: u.id, label: u.name, subtitle: u.role, linkId: u.id })),
  };
}

export async function listRecentSearches(actor: AuthorizedActor) {
  return prisma.recentSearch.findMany({
    where: { userId: actor.sub },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}
