import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { downloadFile } from "../../utils/downloadFile";

type RangePreset = "TODAY" | "TOMORROW" | "NEXT_7_DAYS";
type GroupBy = "NONE" | "COURT" | "DATE";

interface CauseListRow {
  id: string;
  caseId: string;
  matterNumber: string;
  causeTitle: string;
  clientNames: string[];
  courtName: string | null;
  courtHall: string | null;
  hearingDate: string;
  hearingPurpose: string | null;
  caseStage: string | null;
  advocates: { id: string; name: string }[];
  hearingStatus: "SCHEDULED" | "COMPLETED";
  nextHearingDate: string | null;
}

const RANGE_LABELS: Record<RangePreset, string> = {
  TODAY: "Today",
  TOMORROW: "Tomorrow",
  NEXT_7_DAYS: "Next 7 Days",
};

/**
 * Cause List filter simplification (2026-08-11) — a direct Managing Partner
 * correction reducing this screen to exactly three date filters (Today/Tomorrow/
 * Next 7 Days). Every other filter previously here (Court, Court Hall, Advocate,
 * Case Stage, Hearing Status, Search, the Firm/My/Employee "whose list" toggle,
 * This Week/Custom date presets) is removed from this screen only — the backend
 * `/hearings/cause-list` API still accepts all of them (used by `causeList.test.ts`
 * and available to any future caller), this screen just no longer sends them, so
 * every request implicitly gets the API's own default scope (MINE — each user
 * always sees their own hearings) with no other narrowing applied. Court-wise/
 * Date-wise grouping and Print/Export are unchanged — they organize or export the
 * already-date-filtered rows rather than filtering by an attribute, so they were
 * not in scope for removal.
 */
export default function CauseList() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("TODAY");
  const [groupBy, setGroupBy] = useState<GroupBy>("NONE");

  const [rows, setRows] = useState<CauseListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentParams() {
    return { rangePreset };
  }

  function load() {
    setLoading(true);
    setError(null);
    api
      .get("/hearings/cause-list", { params: currentParams() })
      .then((res) => setRows(res.data.rows))
      .catch((err) => setError(err.response?.data?.error ?? "Failed to load the Cause List"))
      .finally(() => setLoading(false));
  }

  // Reloads automatically whenever the selected date filter changes.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset]);

  const groups = useMemo(() => {
    if (groupBy === "NONE") return [{ label: null as string | null, rows }];
    const buckets = new Map<string, CauseListRow[]>();
    for (const row of rows) {
      const key = groupBy === "COURT" ? (row.courtName ?? "Unspecified Court") : row.hearingDate.slice(0, 10);
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupRows]) => ({ label, rows: groupRows }));
  }, [rows, groupBy]);

  async function handleExport(kind: "pdf" | "excel") {
    await downloadFile(
      `/hearings/cause-list/export/${kind}`,
      { ...currentParams(), groupBy },
      `cause-list.${kind === "pdf" ? "pdf" : "xlsx"}`
    );
  }

  return (
    <div>
      <div className="page-header no-print">
        <h1>Cause List</h1>
      </div>

      <div className="card no-print">
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div>
            <label>Date Range</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(RANGE_LABELS) as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={rangePreset === preset ? "primary" : "secondary"}
                  aria-pressed={rangePreset === preset}
                  onClick={() => setRangePreset(preset)}
                >
                  {RANGE_LABELS[preset]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span className="muted">Group by:</span>
          {(["NONE", "COURT", "DATE"] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              className={groupBy === g ? "primary" : "secondary"}
              onClick={() => setGroupBy(g)}
            >
              {g === "NONE" ? "No Grouping" : g === "COURT" ? "Court-wise" : "Date-wise"}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={() => window.print()}>
            Print Cause List
          </button>
          <button type="button" className="secondary" onClick={() => handleExport("pdf")}>
            Export PDF
          </button>
          <button type="button" className="secondary" onClick={() => handleExport("excel")}>
            Export Excel
          </button>
        </div>
      </div>

      {error && (
        <p className="error-text no-print">{error}</p>
      )}

      <div className="cause-list-print-area">
        <div className="print-only print-header" style={{ display: "none" }}>
          <img src="/logo.png" alt="S&A LEGAL" />
          <h3>S&amp;A LEGAL — Cause List</h3>
        </div>
        {loading && <p className="muted no-print">Loading…</p>}
        {!loading && rows.length === 0 && <p className="muted">No hearings match the selected filter.</p>}
        {groups.map((group, gi) => (
          <div className="card" key={gi}>
            {group.label && <h3>{group.label}</h3>}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Case Number</th>
                    <th>Cause Title</th>
                    <th>Client</th>
                    <th>Court</th>
                    <th>Court Hall/No.</th>
                    <th>Hearing Time</th>
                    <th>Purpose</th>
                    <th>Stage</th>
                    <th>Advocate(s)</th>
                    <th>Status</th>
                    <th>Next Hearing</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/cases/${row.caseId}`}>{row.matterNumber}</Link>
                      </td>
                      <td>{row.causeTitle}</td>
                      <td>{row.clientNames.join(", ") || "—"}</td>
                      <td>{row.courtName ?? "—"}</td>
                      <td>{row.courtHall ?? "—"}</td>
                      <td>{new Date(row.hearingDate).toLocaleString()}</td>
                      <td>{row.hearingPurpose ?? "—"}</td>
                      <td>{row.caseStage ?? "—"}</td>
                      <td>{row.advocates.map((a) => a.name).join(", ")}</td>
                      <td>
                        <span className="badge">{row.hearingStatus}</span>
                      </td>
                      <td>{row.nextHearingDate ? new Date(row.nextHearingDate).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
