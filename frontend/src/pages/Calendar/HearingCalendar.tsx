import { AppLoader } from "../../components/AppLoader";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface CalendarCaseDetails {
  id: string;
  caseType?: string | null;
  courtNumber?: string | null;
  courtName?: string | null;
   courtCaseNumber? :string | null ;
  bundleNumber?: string | null;
}

interface CalendarHearing {
  id: string;
  hearingDate: string;
  courtName?: string | null;
  courtHall?: string | null;
  purpose?: string | null;
  status: string;
  case?: {
    id: string;
    matterNumber?: string | null;
    courtCaseNumber?: string | null;
    bundleNumber?: string | null;
    title?: string | null;
    caseType?: string | null;
    courtNumber?: string | null;
    courtName?: string | null;
  } | null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN");
}

function displayValue(...values: (string | null | undefined)[]) {
  return values.find((value) => value?.trim()) ?? "—";
}

export default function HearingCalendar() {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [hearings, setHearings] = useState<CalendarHearing[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  useEffect(() => {
    let cancelled = false;

    async function fetchHearings() {
      setLoading(true);
      setError(null);
      setSelectedDate(null);

      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

      try {
        const res = await api.get("/hearings", {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        });

        if (!cancelled) {
          const responseData = res.data;
          const records: CalendarHearing[] = Array.isArray(responseData)
            ? responseData
            : responseData?.hearings ?? responseData?.data ?? [];

          // Some deployed API instances return a limited nested Case selection
          // even though the hearing query asks Prisma for these fields. Recover
          // missing case metadata from the existing case-detail endpoint.
          const caseIdsToHydrate = Array.from(
            new Set(
              records
                .filter((hearing) => {
                  const caseRecord = hearing.case;
                  return Boolean(
                    caseRecord?.id &&
                    (!caseRecord.caseType ||
                      !caseRecord.courtNumber ||
                      !caseRecord.courtName ||
                      !caseRecord.bundleNumber)
                  );
                })
                .map((hearing) => hearing.case!.id)
            )
          );

          const caseDetails = new Map<string, CalendarCaseDetails>();
          let nextCaseIndex = 0;
          const workerCount = Math.min(4, caseIdsToHydrate.length);
          await Promise.all(
            Array.from({ length: workerCount }, async () => {
              while (nextCaseIndex < caseIdsToHydrate.length) {
                const caseId = caseIdsToHydrate[nextCaseIndex++];
                try {
                  const caseResponse = await api.get<CalendarCaseDetails>(
                    `/cases/${caseId}`
                  );
                  caseDetails.set(caseId, caseResponse.data);
                } catch (caseError) {
                  // Keep the hearing visible even if a case detail request fails.
                  console.warn(`Could not load details for case ${caseId}`, caseError);
                }
              }
            })
          );

          const enrichedRecords = records.map((hearing) => {
            const caseRecord = hearing.case;
            if (!caseRecord?.id) return hearing;
            const details = caseDetails.get(caseRecord.id);
            if (!details) return hearing;

            return {
              ...hearing,
              case: {
                ...caseRecord,
                caseType: caseRecord.caseType ?? details.caseType,
                courtNumber: caseRecord.courtNumber ?? details.courtNumber,
                courtName: caseRecord.courtName ?? details.courtName,
                courtCaseNumber: caseRecord.courtCaseNumber ?? details.courtCaseNumber,
                bundleNumber: caseRecord.bundleNumber ?? details.bundleNumber,
              },
            };
          });

          if (!cancelled) setHearings(enrichedRecords);
        }
      } catch (err) {
        console.error("Failed to fetch hearings:", err);

        if (!cancelled) {
          setHearings([]);
          setError("Failed to load hearings. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchHearings();

    return () => {
      cancelled = true;
    };
  }, [year, month, retryCount]);

  const hearingsByDate = useMemo(() => {
    const map = new Map<string, CalendarHearing[]>();

    hearings.forEach((hearing) => {
      const key = dateKey(new Date(hearing.hearingDate));
      map.set(key, [...(map.get(key) ?? []), hearing]);
    });

    return map;
  }, [hearings]);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(year, month, index + 1)
    ),
  ];

  const selectedHearings = (
    selectedDate
      ? hearingsByDate.get(dateKey(selectedDate)) ?? []
      : []
  )
    .slice()
    .sort((a, b) =>
      displayValue(a.case?.courtNumber).localeCompare(
        displayValue(b.case?.courtNumber)
      )
    );

  return (
    <div>
      <div className="page-header">
        <h1>Hearing Calendar</h1>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <button
            onClick={() => setMonthAnchor(new Date(year, month - 1, 1))}
            disabled={loading}
          >
            &larr; Prev
          </button>

          <h3 style={{ margin: 0 }}>
            {monthAnchor.toLocaleString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>

          <button
            onClick={() => setMonthAnchor(new Date(year, month + 1, 1))}
            disabled={loading}
          >
            Next &rarr;
          </button>
        </div>

        {loading ? (
          <div
            style={{
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: "3px solid var(--color-border-strong)",
                borderTop: "3px solid var(--color-primary)",
                borderRadius: "50%",
                animation: "hearingLoaderSpin 0.8s linear infinite",
              }}
            />

            <style>
              {`
                @keyframes hearingLoaderSpin {
                  to { transform: rotate(360deg); }
                }
              `}
            </style>

            <AppLoader size="md" />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 35 }}>
            <p className="error-text">{error}</p>
            <button
              className="primary"
              onClick={() => setRetryCount((previous) => previous + 1)}
            >
              Try Again
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 6,
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day) => (
                <div
                  key={day}
                  className="muted"
                  style={{
                    textAlign: "center",
                    fontWeight: 600,
                    padding: "8px 0",
                  }}
                >
                  {day}
                </div>
              )
            )}

            {cells.map((date, index) => {
              if (!date) {
                return <div key={`blank-${index}`} />;
              }

              const count =
                hearingsByDate.get(dateKey(date))?.length ?? 0;

              const isSelected =
                selectedDate !== null &&
                dateKey(selectedDate) === dateKey(date);

              return (
                <button
                  key={dateKey(date)}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    minHeight: 64,
                    minWidth: 0,
                    padding: 8,
                    textAlign: "left",
                    border: isSelected
                      ? "2px solid var(--color-primary)"
                      : "1px solid var(--color-border-strong)",
                    borderRadius: "var(--radius-sm)",
                    background:
                      count > 0
                        ? "var(--color-primary-lighter)"
                        : "var(--color-surface)",
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  <div>{date.getDate()}</div>

                  {count > 0 && (
                    <span className="badge" style={{ fontSize: "0.75em" }}>
                      {count} hearing{count > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !error && selectedDate && (
        <div className="card">
          <h3>Hearings on {formatDate(selectedDate)}</h3>

          {selectedHearings.length === 0 ? (
            <p className="muted">No hearings on this date.</p>
          ) : (
            // <div className="table-scroll">
            //   <table>
            //     <thead>
            //       <tr>
            //         <th>Case Type</th>
            //         <th>Case Number</th>
            //         <th>Cause Title</th>
            //         <th>Court Number</th>
            //         <th>Court Complex</th>
            //         <th>Hearing Status</th>
            //       </tr>
            //     </thead>

            //     <tbody>
            //       {selectedHearings.map((hearing) => {
            //         const caseRecord = hearing.case;

            //         return (
            //           <tr key={hearing.id}>
            //             <td>
            //               {displayValue(caseRecord?.caseType)}
            //             </td>

            //             <td>
            //               {caseRecord?.id ? (
            //                 <Link to={`/cases/${caseRecord.id}`}>
            //                   {displayValue(
            //                     caseRecord.matterNumber,
            //                     caseRecord.courtCaseNumber
            //                   )}
            //                 </Link>
            //               ) : (
            //                 "—"
            //               )}
            //             </td>

            //             <td>{displayValue(caseRecord?.title)}</td>

            //             <td>
            //               {displayValue(caseRecord?.courtNumber)}
            //             </td>

            //             <td>
            //               {displayValue(
            //                 caseRecord?.courtName,
            //                 hearing.courtName
            //               )}
            //             </td>

            //             <td>
            //               <span className="badge">
            //                 {hearing.status}
            //               </span>
            //             </td>
            //           </tr>
            //         );
            //       })}
            //     </tbody>
            //   </table>
            // </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Case Type</th>
                    <th>Case Number</th>
                    <th>Bundle Number</th>
                    <th>Court Case Number</th>
                    <th>Cause Title</th>
                    <th>Court Number</th>
                    <th>Court Complex</th>
                    <th>Hearing Status</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedHearings.map((hearing) => {
                    const caseRecord = hearing.case;

                    return (
                      <tr key={hearing.id}>
                        <td>{displayValue(caseRecord?.caseType)}</td>

                        <td>
                          {caseRecord?.id ? (
                            <Link to={`/cases/${caseRecord.id}`}>
                              {displayValue(caseRecord.matterNumber)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td>{displayValue(caseRecord?.bundleNumber)}</td>

                        <td>
                          {displayValue(caseRecord?.courtCaseNumber)}
                        </td>

                        <td>{displayValue(caseRecord?.title)}</td>

                        <td>{displayValue(caseRecord?.courtNumber)}</td>

                        <td>
                          {displayValue(caseRecord?.courtName, hearing.courtName)}
                        </td>

                        <td>
                          <span className="badge">{hearing.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
