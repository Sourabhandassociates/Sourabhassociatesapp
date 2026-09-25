import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { PaginationControls } from "../../components/PaginationControls";

interface Client {
  id: string;
  clientId: string;
  name: string;
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
  const navigate = useNavigate();

  function load(q = search, p = page, ps = pageSize) {
    api.get("/clients", { params: { ...(q ? { search: q } : {}), page: p, pageSize: ps } }).then((res) => {
      setClients(res.data);
      setTotal(Number(res.headers["x-total-count"] ?? res.data.length));
    });
  }

  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="page-header">
        <h1>Clients</h1>
        <button className="primary" onClick={() => navigate("/clients/new")}>
          + New Client
        </button>
      </div>

      <input
        placeholder="Search by name or Client ID…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
          load(e.target.value, 1);
        }}
        style={{ maxWidth: 320 }}
      />

      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Client ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Email</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => navigate(`/clients/${c.id}`)}>
              <td>{c.clientId}</td>
              <td>{c.name}</td>
              <td>{c.type ?? "—"}</td>
              <td>{c.email ?? "—"}</td>
              <td>
                <span className={`badge status-${c.status}`}>{c.status}</span>
              </td>
            </tr>
          ))}
          {clients.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No clients yet.
              </td>
            </tr>
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
          load(search, p);
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
