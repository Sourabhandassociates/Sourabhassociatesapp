import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

interface SearchResultItem {
  type: "CLIENT" | "CASE" | "DOCUMENT" | "CONTACT" | "ADVOCATE";
  id: string;
  label: string;
  subtitle?: string | null;
  linkId: string;
}

interface SearchResults {
  clients: SearchResultItem[];
  cases: SearchResultItem[];
  documents: SearchResultItem[];
  contacts: SearchResultItem[];
  advocates: SearchResultItem[];
}

interface RecentSearch {
  id: string;
  query: string;
  createdAt: string;
}

function linkFor(item: SearchResultItem): string {
  switch (item.type) {
    case "CLIENT":
      return `/clients/${item.linkId}`;
    case "CASE":
    case "DOCUMENT":
      return `/cases/${item.linkId}`;
    case "CONTACT":
      // Contacts redesign pass (2026-08-07b) — Global Search's CONTACT results are
      // always the manually-managed (non-client) list; a client-linked contact's own
      // name is already found via the CLIENT category above.
      return `/contacts/${item.linkId}`;
    default:
      return "#";
  }
}

function ResultSection({ title, items }: { title: string; items: SearchResultItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h3>
        {title} ({items.length})
      </h3>
      <ul className="search-result-list">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            {item.type === "ADVOCATE" ? (
              <span>
                {item.label}
                {item.subtitle && <span className="muted"> — {item.subtitle}</span>}
              </span>
            ) : (
              <Link to={linkFor(item)}>
                {item.label}
                {item.subtitle && <span className="muted"> — {item.subtitle}</span>}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** SRD Section 23 — Global Search. Unified search across Clients, Cases, Documents,
 * Contacts, and Advocates, grouped by entity type, RBAC-scoped server-side. */
export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    if (q.trim().length >= 2) {
      api.get<SearchResults>("/search", { params: { q } }).then((res) => setResults(res.data));
    } else {
      setResults(null);
    }
  }, [q]);

  useEffect(() => {
    api.get<RecentSearch[]>("/search/recent").then((res) => setRecent(res.data));
  }, [q]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams(input.trim() ? { q: input.trim() } : {});
  }

  const totalResults = results
    ? results.clients.length + results.cases.length + results.documents.length + results.contacts.length + results.advocates.length
    : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Global Search</h1>
      </div>

      <form onSubmit={onSubmit} className="form-grid" style={{ maxWidth: 480 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search clients, matters, documents, contacts, advocates…"
          autoFocus
        />
        <button type="submit" className="primary">
          Search
        </button>
      </form>

      {q.trim().length < 2 && recent.length > 0 && (
        <div className="card">
          <h3>Recent Searches</h3>
          <ul className="search-result-list">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="link-button" onClick={() => setSearchParams({ q: r.query })}>
                  {r.query}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q.trim().length >= 2 && results && (
        <>
          {totalResults === 0 && <p className="muted">No results for &quot;{q}&quot;.</p>}
          <ResultSection title="Clients" items={results.clients} />
          <ResultSection title="Cases" items={results.cases} />
          <ResultSection title="Documents" items={results.documents} />
          <ResultSection title="Contacts" items={results.contacts} />
          <ResultSection title="Advocates" items={results.advocates} />
        </>
      )}
    </div>
  );
}
