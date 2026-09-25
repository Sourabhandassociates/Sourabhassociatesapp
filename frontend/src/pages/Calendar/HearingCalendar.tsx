import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

/** New Case form simplification (2026-08-11) — case title is now optional. */
interface CalendarHearing {
  id: string;
  hearingDate: string;
  courtName: string | null;
  purpose: string | null;
  status: string;
  case: { id: string; matterNumber: string; title: string | null };
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** SRD Section 15 — Hearing Calendar: per-date hearing count, click a date to see that day's list. */
export default function HearingCalendar() {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [hearings, setHearings] = useState<CalendarHearing[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  useEffect(() => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    api
      .get("/hearings", { params: { startDate: startDate.toISOString(), endDate: endDate.toISOString() } })
      .then((res) => setHearings(res.data));
    setSelectedDate(null);
  }, [year, month]);

  const hearingsByDate = useMemo(() => {
    const map = new Map<string, CalendarHearing[]>();
    for (const h of hearings) {
      const key = dateKey(new Date(h.hearingDate));
      map.set(key, [...(map.get(key) ?? []), h]);
    }
    return map;
  }, [hearings]);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  /** Step 1 revision (item 7) — sorted by Court Number, then Case Number. */
  const selectedHearings = (selectedDate ? (hearingsByDate.get(dateKey(selectedDate)) ?? []) : [])
    .slice()
    .sort((a, b) => {
      const courtCompare = (a.courtName ?? "").localeCompare(b.courtName ?? "");
      return courtCompare !== 0 ? courtCompare : a.case.matterNumber.localeCompare(b.case.matterNumber);
    });

  return (
    <div>
      <div className="page-header">
        <h1>Hearing Calendar</h1>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => setMonthAnchor(new Date(year, month - 1, 1))}>&larr; Prev</button>
          <h3 style={{ margin: 0 }}>
            {monthAnchor.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </h3>
          <button onClick={() => setMonthAnchor(new Date(year, month + 1, 1))}>Next &rarr;</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="muted" style={{ textAlign: "center", fontWeight: 600 }}>
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`blank-${i}`} />;
            const count = hearingsByDate.get(dateKey(d))?.length ?? 0;
            const isSelected = selectedDate && dateKey(selectedDate) === dateKey(d);
            return (
              <button
                key={dateKey(d)}
                onClick={() => setSelectedDate(d)}
                style={{
                  minHeight: 64,
                  minWidth: 0,
                  padding: 8,
                  textAlign: "left",
                  border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sm)",
                  background: count > 0 ? "var(--color-primary-lighter)" : "var(--color-surface)",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                <div>{d.getDate()}</div>
                {count > 0 && (
                  <span className="badge" style={{ fontSize: "0.75em" }}>
                    {count} hearing{count > 1 ? "s" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card">
          <h3>Hearings on {selectedDate.toLocaleDateString()}</h3>
          {selectedHearings.length === 0 && <p className="muted">No hearings on this date.</p>}
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Case Number</th>
                <th>Cause Title</th>
                <th>Court Number</th>
                <th>Hearing Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedHearings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link to={`/cases/${h.case.id}`}>{h.case.matterNumber}</Link>
                  </td>
                  <td>{h.case.title ?? "—"}</td>
                  <td>{h.courtName ?? "—"}</td>
                  <td>
                    <span className="badge">{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
