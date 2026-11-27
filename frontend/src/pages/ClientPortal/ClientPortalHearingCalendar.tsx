import { AppLoader } from "../../components/AppLoader";

import { useMemo, useState } from "react";

export interface ClientHearingCalendarItem {
  id: string;
  hearingDate: string;
  case: {
    matterNumber: string;
    bundleNumber: string | null;
    caseType: string | null;
    courtCaseNumber?: string | null;
    title: string | null;
    courtNumber?: string | null;
    courtName?: string | null;
    stage?: string | null;
    status?: string | null;
  };
}

interface Props {
  hearings: ClientHearingCalendarItem[] | null;
  error?: string | null;
}

function localDateKey(value: string): string | null {
  if (!value) return null;

  // Keep date-only values as-is; they represent a calendar date, not a timestamp.
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
  }

  // For timestamps, use the browser's local timezone so UTC timestamps
  // are shown on the correct local calendar day (for example, India/IST).
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function keyForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function ClientPortalHearingCalendar({
  hearings,
  error,
}: Props) {
  const todayKey = keyForDate(new Date());

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState(todayKey);

  const hearingsByDate = useMemo(() => {
    const grouped = new Map<string, ClientHearingCalendarItem[]>();

    for (const hearing of hearings ?? []) {
      const key = localDateKey(hearing.hearingDate);

      if (!key) continue;

      const current = grouped.get(key) ?? [];
      current.push(hearing);
      grouped.set(key, current);
    }

    return grouped;
  }, [hearings]);

  const firstWeekday = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1
  ).getDay();

  const dayCount = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0
  ).getDate();

  const totalCells = Math.ceil((firstWeekday + dayCount) / 7) * 7;

  const days = Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= dayCount ? day : null;
  });

  const selectedHearings = hearingsByDate.get(selectedDate) ?? [];

  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function moveMonth(amount: number) {
    setVisibleMonth(
      new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + amount,
        1
      )
    );

    setSelectedDate("");
  }

  function goToToday() {
    const today = new Date();

    setVisibleMonth(
      new Date(today.getFullYear(), today.getMonth(), 1)
    );

    setSelectedDate(todayKey);
  }

  return (
    <section
      className="card mb-6"
      aria-label="Client hearing calendar"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <h3
          className="text-xl font-semibold"
          style={{ margin: 0 }}
        >
          Hearing Calendar
        </h3>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            type="button"
            className="secondary"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            ‹
          </button>

          <strong style={{ minWidth: 150, textAlign: "center" }}>
            {monthLabel}
          </strong>

          <button
            type="button"
            className="secondary"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            ›
          </button>

          <button
            type="button"
            className="secondary"
            onClick={goToToday}
          >
            Today
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {hearings === null && !error && (
        <AppLoader size="md" />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          borderTop: "1px solid #e5e7eb",
          borderLeft: "1px solid #e5e7eb",
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
          (label) => (
            <div
              key={label}
              style={{
                padding: "10px 4px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: "#64748b",
                background: "#f8fafc",
                borderRight: "1px solid #e5e7eb",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              {label}
            </div>
          )
        )}

        {days.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`empty-${index}`}
                style={{
                  minHeight: 94,
                  background: "#fafafa",
                  borderRight: "1px solid #e5e7eb",
                  borderBottom: "1px solid #e5e7eb",
                }}
              />
            );
          }

          const date = new Date(
            visibleMonth.getFullYear(),
            visibleMonth.getMonth(),
            day
          );

          const key = keyForDate(date);
          const events = hearingsByDate.get(key) ?? [];
          const selected = selectedDate === key;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(key)}
              aria-pressed={selected}
              style={{
                minWidth: 0,
                minHeight: 94,
                padding: "7px 6px",
                textAlign: "left",
                verticalAlign: "top",
                background: selected ? "#eff6ff" : "#fff",
                border: 0,
                borderRight: "1px solid #e5e7eb",
                borderBottom: "1px solid #e5e7eb",
                outline: selected ? "2px solid #2563eb" : "none",
                outlineOffset: "-2px",
                cursor: "pointer",
                color: "#1f2937",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 25,
                  height: 25,
                  borderRadius: "50%",
                  background: isToday ? "#2563eb" : "transparent",
                  color: isToday ? "#fff" : "#374151",
                  fontWeight: isToday || selected ? 700 : 400,
                  fontSize: 13,
                }}
              >
                {day}
              </span>

              <div
                style={{
                  display: "grid",
                  gap: 3,
                  marginTop: 4,
                }}
              >
                {events.slice(0, 2).map((hearing) => (
                  <span
                    key={hearing.id}
                    title={hearing.case.matterNumber}
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      borderRadius: 3,
                      padding: "2px 4px",
                      background: "#dbeafe",
                      color: "#1d4ed8",
                      fontSize: 10,
                      lineHeight: 1.4,
                    }}
                  >

                    {hearing.case.caseType ?? "N/A"}
                  </span>
                ))}

                {events.length > 2 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#64748b",
                    }}
                  >
                    +{events.length - 2} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ paddingTop: 14 }}>
        <strong style={{ fontSize: 14 }}>
          {selectedDate
            ? dateFromKey(selectedDate).toLocaleDateString(
              undefined,
              {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }
            )
            : "Select a date"}
        </strong>

        {selectedDate && selectedHearings.length === 0 && (
          <p className="muted" style={{ marginTop: 6 }}>
            No hearings on this date.
          </p>
        )}

        {/* {selectedHearings.length > 0 && (
          <div style={{ marginTop: 7 }}>
            {selectedHearings.map((hearing) => (
              <p
                key={hearing.id}
                style={{ margin: "5px 0", fontSize: 13 }}
              >
                 {hearing.case.bundleNumber ?? "N/A"}
                {hearing.case.caseType ?? "N/A"} 
                {hearing.case.courtCaseNumber ?? "N/A"}
                {hearing.case.courtNumber ?? "N/A"}
                {hearing.case.stage ?? "N/A"}
                {hearing.case.title ?? "N/A"}
                {hearing.case.status ?? "N/A"}
                
              </p>
            ))}
          </div>
        )}  */}


        {selectedHearings.length > 0 && (
          <div
            style={{
              marginTop: 7,
              width: "100%",
              overflowX: "auto",
              borderRadius: 12,
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 1100,
                borderCollapse: "separate",
                borderSpacing: 0,
                backgroundColor: "#ffffff",
                borderRadius: 12,
                overflow: "hidden",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f1f3fa" }}>
                  {[
                    "BUNDLE NUMBER",
                    "CASE TYPE",
                    "COURT CASE NUMBER",
                    "COURT NUMBER",
                    "STAGE",
                    "CASE TITLE",
                    "STATUS",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "14px 16px",
                        color: "#64748b",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {selectedHearings.map((hearing) => (
                  <tr key={hearing.id}>
                    <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.bundleNumber ?? "N/A"}
                    </td>

                    <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.caseType ?? "N/A"}
                    </td>

                     <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.courtCaseNumber ?? "N/A"}
                    </td> 
                    

                    <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.courtNumber ?? "N/A"}
                    </td>

                    <td style={{ padding: "15px 16px", color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.stage ?? "N/A"}
                    </td>

                    <td style={{ padding: "15px 16px", color: "#475569", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>
                      {hearing.case.title ?? "N/A"}
                    </td>

                    <td style={{ padding: "15px 16px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 12px",
                          borderRadius: 20,
                          backgroundColor: "#fff1d6",
                          color: "#a66a00",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {hearing.case.status ?? "N/A"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


      </div>
    </section>
  );
}
