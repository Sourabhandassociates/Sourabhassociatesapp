import { AppLoader } from "../../components/AppLoader";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { PaginationControls } from "../../components/PaginationControls";

interface Client {
  id: string;
  clientId: string;
  name: string;
  newname:string;
  type: string | null;
  email: string | null;
  status: string;
}

export default function ClientList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestId = useRef(0);
  const navigate = useNavigate();

  async function load(
    q = search,
    p = page,
    ps = pageSize
  ) {
    const currentRequest = ++requestId.current;

    setLoading(true);
    setError("");

    try {
      const res = await api.get("/clients", {
        params: {
          ...(q ? { search: q } : {}),
          page: p,
          pageSize: ps,
        },
      });

      if (currentRequest !== requestId.current) return;

      setClients(res.data);
      setTotal(
        Number(res.headers["x-total-count"] ?? res.data.length)
      );
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      console.error("Failed to load clients:", err);
      setError("Unable to load clients. Please try again.");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <style>
        {`
          @keyframes clientListSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      <div className="page-header">
        <h1>Clients</h1>

        <button
          className="primary"
          onClick={() => navigate("/clients/new")}
        >
          + New Client
        </button>
      </div>

      <input
        placeholder="Search by name or Client ID…"
        value={search}
        onChange={(e) => {
          const value = e.target.value;

          setSearch(value);
          setPage(1);
          load(value, 1, pageSize);
        }}
        style={{ maxWidth: 320 }}
      />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Client ID</th>
              <th>User Name</th>
              <th>Name</th>
              <th>Type</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <div
                    style={{
                      minHeight: 220,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      padding: 30,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        border: "4px solid #e5e7eb",
                        borderTop: "4px solid #2563eb",
                        borderRadius: "50%",
                        animation: "clientListSpin 0.8s linear infinite",
                      }}
                    />

                    <AppLoader size="sm" />

                    
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5}>
                  <div
                    style={{
                      minHeight: 180,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      padding: 24,
                    }}
                  >
                    <p style={{ color: "#dc2626", margin: 0 }}>
                      {error}
                    </p>

                    <button
                      className="primary"
                      onClick={() => load()}
                    >
                      Try Again
                    </button>
                  </div>
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No clients yet.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr
                  key={c.id}
                  className="clickable"
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <td>{c.clientId}</td>
                  <td>{c.name}</td>
                  <td>{c.newname}</td>
                  <td>{c.type ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>
                    <span className={`badge status-${c.status}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => {
          setPage(p);
          load(search, p, pageSize);
        }}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
          load(search, 1, ps);
        }}
      />
    </div>
  );
}
