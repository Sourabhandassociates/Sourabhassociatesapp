import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { formatCurrency } from "../../../utils/currency";
import { useAccountsPermissions } from "../../../hooks/useAccountsPermissions";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  issueDate: string;
  paymentStatus: string;
  client: { id: string; name: string; clientId: string };
  case: { id: string; matterNumber: string } | null;
}

/** ACCOUNTS module (2026-08-14, §23) — a thin list wrapper reusing the existing,
 * unmodified /invoices/:id and /invoices/new pages rather than rebuilding invoice
 * detail/creation from scratch. Adds Delete for DRAFT invoices (the new §23 edit/
 * delete capability) — editing itself happens on the InvoiceDetail page. */
export function InvoicesPanel() {
  const { permissions } = useAccountsPermissions();
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const reload = useCallback(() => {
    api.get<InvoiceRow[]>("/accounts/invoices").then((res) => setRows(res.data));
  }, []);
  useEffect(() => reload(), [reload]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this draft invoice? This cannot be undone.")) return;
    await api.delete(`/invoices/${id}`);
    reload();
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/invoices/new">
          <button>New Invoice</button>
        </Link>
      </div>
      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Case</th>
                <th>Issue Date</th>
                <th>Total</th>
                <th>Status</th>
                {permissions.deleteInvoice && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="clickable">
                  <td>
                    <Link to={`/invoices/${i.id}`}>{i.invoiceNumber}</Link>
                  </td>
                  <td>
                    {i.client.name} ({i.client.clientId})
                  </td>
                  <td>{i.case?.matterNumber ?? "—"}</td>
                  <td>{new Date(i.issueDate).toLocaleDateString()}</td>
                  <td>{formatCurrency(i.total)}</td>
                  <td>
                    <span className={`badge payment-status-${i.paymentStatus}`}>{i.paymentStatus}</span>
                  </td>
                  {permissions.deleteInvoice && (
                    <td>
                      {i.status === "DRAFT" && (
                        <button className="secondary" onClick={() => handleDelete(i.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
