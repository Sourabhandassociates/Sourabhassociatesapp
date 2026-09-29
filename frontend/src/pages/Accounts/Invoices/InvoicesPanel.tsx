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
  client: {
    id: string;
    name: string;
    clientId: string;
  };
  case: {
    id: string;
    matterNumber: string;
  } | null;
}

export function InvoicesPanel() {
  const { permissions } = useAccountsPermissions();
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const reload = useCallback(() => {
    api
      .get<InvoiceRow[]>("/accounts/invoices")
      .then((res) => setRows(res.data))
      .catch((err) => {
        console.error("Failed to load invoices:", err);
        setRows([]);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this draft invoice? This cannot be undone.")) {
      return;
    }

    try {
      await api.delete(`/invoices/${id}`);
      reload();
    } catch (err) {
      console.error("Failed to delete invoice:", err);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/invoices/new">
          <button type="button">New Invoice</button>
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
              {rows.map((invoice) => (
                <tr key={invoice.id} className="clickable">
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>
                      {invoice.invoiceNumber}
                    </Link>
                  </td>

                  <td>
                    {invoice.client.name} ({invoice.client.clientId})
                  </td>

                  <td>
                    {invoice.case?.matterNumber ?? "—"}
                  </td>

                  <td>
                    {new Date(invoice.issueDate).toLocaleDateString()}
                  </td>

                  <td>{formatCurrency(invoice.total)}</td>

                  <td>
                    <span
                      className={`badge payment-status-${invoice.paymentStatus}`}
                    >
                      {invoice.paymentStatus}
                    </span>
                  </td>

                  {permissions.deleteInvoice && (
                    <td>
                      {invoice.status === "DRAFT" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleDelete(invoice.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={permissions.deleteInvoice ? 7 : 6}
                    className="muted"
                  >
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