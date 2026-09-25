import { useState } from "react";
import { api } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { AccountsPermissions } from "../../hooks/useAccountsPermissions";
import { CaseAccountsPanel } from "./CaseAccountsPanel";

type Mode = "CLIENT" | "CASE";

interface ClientResult {
  id: string;
  clientId: string;
  name: string;
  phone: string | null;
}
interface CaseResult {
  id: string;
  matterNumber: string;
  courtCaseNumber: string | null;
  title: string | null;
  courtName: string | null;
}

interface ClientSummary {
  client: { id: string; clientId: string; name: string };
  summary: {
    totalProfessionalFees: number;
    totalPaymentsReceived: number;
    totalOutstanding: number;
    totalOverdue: number;
    totalDueSoon: number;
    totalExpenses: number;
    totalInvoiced: number;
    pendingInvoices: number;
  };
  cases: {
    caseId: string;
    matterNumber: string;
    courtCaseNumber: string | null;
    court: string | null;
    caseType: string | null;
    professionalFee: number;
    amountReceived: number;
    outstanding: number;
    overdue: number;
    expenses: number;
  }[];
}

/** ACCOUNTS module (2026-08-14, §9-§11) — the [CLIENT]/[CASE] search toggle at the
 * top of Accounts, usable directly without first navigating to Clients or Cases. */
export function AccountsSearch({ permissions }: { permissions: AccountsPermissions }) {
  const [mode, setMode] = useState<Mode>("CLIENT");
  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [caseResults, setCaseResults] = useState<CaseResult[]>([]);
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  async function runSearch(q: string) {
    setQuery(q);
    setClientSummary(null);
    setSelectedCaseId(null);
    if (q.trim().length < 2) {
      setClientResults([]);
      setCaseResults([]);
      return;
    }
    if (mode === "CLIENT") {
      const res = await api.get<ClientResult[]>("/accounts/clients/search", { params: { q } });
      setClientResults(res.data);
    } else {
      const res = await api.get<CaseResult[]>("/accounts/cases/search", { params: { q } });
      setCaseResults(res.data);
    }
  }

  async function openClient(clientId: string) {
    const res = await api.get<ClientSummary>(`/accounts/clients/${clientId}/summary`);
    setClientSummary(res.data);
    setClientResults([]);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setQuery("");
    setClientResults([]);
    setCaseResults([]);
    setClientSummary(null);
    setSelectedCaseId(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={mode === "CLIENT" ? "" : "secondary"} onClick={() => switchMode("CLIENT")}>
          CLIENT
        </button>
        <button className={mode === "CASE" ? "" : "secondary"} onClick={() => switchMode("CASE")}>
          CASE
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        placeholder={
          mode === "CLIENT" ? "Search by Client Name, Client ID, or Mobile Number" : "Search by Case Number, Matter Number, Client, Opposite Party, or Court"
        }
        style={{ maxWidth: 480, marginBottom: 16 }}
      />

      {mode === "CLIENT" && clientResults.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          {clientResults.map((c) => (
            <p key={c.id} className="clickable" onClick={() => openClient(c.id)} style={{ cursor: "pointer" }}>
              {c.name} ({c.clientId}) {c.phone ? `— ${c.phone}` : ""}
            </p>
          ))}
        </div>
      )}

      {mode === "CASE" && caseResults.length > 0 && !selectedCaseId && (
        <div className="card" style={{ marginBottom: 16 }}>
          {caseResults.map((c) => (
            <p key={c.id} className="clickable" onClick={() => setSelectedCaseId(c.id)} style={{ cursor: "pointer" }}>
              {c.matterNumber} {c.courtCaseNumber ? `(${c.courtCaseNumber})` : ""} {c.title ? `— ${c.title}` : ""}
            </p>
          ))}
        </div>
      )}

      {clientSummary && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>
              {clientSummary.client.name} ({clientSummary.client.clientId})
            </h3>
            <div className="dashboard-grid">
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalProfessionalFees)}</div>
                <div className="label">Total Professional Fees</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalPaymentsReceived)}</div>
                <div className="label">Total Payments Received</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalOutstanding)}</div>
                <div className="label">Total Outstanding</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalOverdue)}</div>
                <div className="label">Total Overdue</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalDueSoon)}</div>
                <div className="label">Total Due Soon</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalExpenses)}</div>
                <div className="label">Total Expenses</div>
              </div>
              <div className="stat-tile">
                <div className="value">{formatCurrency(clientSummary.summary.totalInvoiced)}</div>
                <div className="label">Total Invoiced</div>
              </div>
              <div className="stat-tile">
                <div className="value">{clientSummary.summary.pendingInvoices}</div>
                <div className="label">Pending Invoices</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Client Cases</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Matter #</th>
                    <th>Case #</th>
                    <th>Court</th>
                    <th>Type</th>
                    <th>Fee</th>
                    <th>Received</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                    <th>Expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.cases.map((c) => (
                    <tr key={c.caseId} className="clickable" onClick={() => setSelectedCaseId(c.caseId)} style={{ cursor: "pointer" }}>
                      <td>{c.matterNumber}</td>
                      <td>{c.courtCaseNumber ?? "—"}</td>
                      <td>{c.court ?? "—"}</td>
                      <td>{c.caseType ?? "—"}</td>
                      <td>{formatCurrency(c.professionalFee)}</td>
                      <td>{formatCurrency(c.amountReceived)}</td>
                      <td>{formatCurrency(c.outstanding)}</td>
                      <td>{formatCurrency(c.overdue)}</td>
                      <td>{formatCurrency(c.expenses)}</td>
                    </tr>
                  ))}
                  {clientSummary.cases.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted">
                        No cases linked to this client.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedCaseId && <CaseAccountsPanel caseId={selectedCaseId} permissions={permissions} />}
    </div>
  );
}
