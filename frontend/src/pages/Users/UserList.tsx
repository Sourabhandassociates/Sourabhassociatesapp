import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export default function UserList() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const navigate = useNavigate();

  function load() {
    api.get("/auth/users").then((res) => setUsers(res.data));
  }
  useEffect(() => load(), []);

  async function toggleStatus(user: StaffUser) {
    const next = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await api.patch(`/auth/users/${user.id}/status`, { status: next });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Firm Users</h1>
        <button className="primary" onClick={() => navigate("/users/new")}>
          + New User
        </button>
      </div>
      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role.replaceAll("_", " ")}</td>
              <td>
                <span className={`badge status-${u.status}`}>{u.status}</span>
              </td>
              <td>
                <button className="secondary" onClick={() => toggleStatus(u)}>
                  {u.status === "ACTIVE" ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
