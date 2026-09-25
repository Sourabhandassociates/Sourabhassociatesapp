import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

export default function NewUser() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ASSOCIATE");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/users", { name, email, password, role });
      navigate("/users");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create user"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Firm User</h1>
      </div>
      <form className="card" style={{ maxWidth: 480 }} onSubmit={handleSubmit}>
        <label htmlFor="name">Full Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="password">Temporary Password</label>
        <input
          id="password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        <label htmlFor="role">Role</label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="MANAGING_PARTNER">Managing Partner</option>
          <option value="ASSOCIATE">Advocate — Associate</option>
          <option value="JUNIOR_ASSOCIATE">Advocate — Junior Associate</option>
          <option value="OFFICE_STAFF">Office Staff</option>
          <option value="ACCOUNTS_TEAM">Accounts Team</option>
        </select>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button className="primary" type="submit">
            Create User
          </button>
          <button className="secondary" type="button" onClick={() => navigate("/users")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
