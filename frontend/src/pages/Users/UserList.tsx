import { AppLoader } from "../../components/AppLoader";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { api } from "../../api/client";

interface StaffUser {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt?: string;
}

export default function UserList() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const navigate = useNavigate();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: "100%",
      padding: "20px",
      boxSizing: "border-box",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
      marginBottom: "25px",
    },
    heading: {
      fontSize: "26px",
      fontWeight: 700,
      color: "#222",
      margin: 0,
    },
    primaryButton: {
      backgroundColor: "#2563eb",
      color: "#fff",
      border: "none",
      padding: "11px 18px",
      borderRadius: "6px",
      cursor: "pointer",
      fontWeight: 600,
    },
    tableContainer: {
      width: "100%",
      overflowX: "auto",
      backgroundColor: "#fff",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: "650px",
    },
    th: {
      backgroundColor: "#f8fafc",
      color: "#374151",
      padding: "14px 16px",
      textAlign: "left",
      fontSize: "14px",
      borderBottom: "1px solid #e5e7eb",
    },
    td: {
      padding: "14px 16px",
      color: "#374151",
      fontSize: "14px",
      borderBottom: "1px solid #e5e7eb",
    },
    actionContainer: {
      display: "flex",
      gap: "8px",
      alignItems: "center",
    },
    statusButton: {
      backgroundColor: "#64748b",
      color: "#fff",
      border: "none",
      padding: "8px 12px",
      borderRadius: "5px",
      cursor: "pointer",
      fontSize: "13px",
    },
    deleteButton: {
      backgroundColor: "#dc2626",
      color: "#fff",
      border: "none",
      padding: "8px 12px",
      borderRadius: "5px",
      cursor: "pointer",
      fontSize: "13px",
    },
    badge: {
      display: "inline-block",
      padding: "5px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
    },
    activeBadge: {
      backgroundColor: "#dcfce7",
      color: "#15803d",
    },
    inactiveBadge: {
      backgroundColor: "#fee2e2",
      color: "#b91c1c",
    },
    message: {
      padding: "25px",
      textAlign: "center",
      color: "#64748b",
    },
  };

  // Load users
  async function loadUsers() {
    try {
      setLoading(true);

      const res = await api.get("/auth/users");

      console.log("Users API response:", res.data);

      const userData = Array.isArray(res.data)
        ? res.data
        : res.data?.users;

      if (!Array.isArray(userData)) {
        console.error("Unexpected users response:", res.data);
        setUsers([]);
        return;
      }

      // Support both MongoDB _id and normal id
      const normalizedUsers: StaffUser[] = userData.map(
        (user) => ({
          ...user,
          id: String(user.id || user._id || ""),
        })
      );

      setUsers(normalizedUsers);
    } catch (error: unknown) {
      console.error("Load users error:", error);

      if (axios.isAxiosError(error)) {
        alert(
          error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load users."
        );
      } else {
        alert("An unexpected error occurred while loading users.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Enable or disable user
  async function toggleStatus(user: StaffUser) {
    if (!user.id) {
      alert("User ID is missing.");
      return;
    }

    const nextStatus =
      user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      setUpdatingId(user.id);

      await api.patch(
        `/auth/users/${encodeURIComponent(user.id)}/status`,
        { status: nextStatus }
      );

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, status: nextStatus }
            : u
        )
      );

      alert(`User ${nextStatus.toLowerCase()} successfully.`);
    } catch (error: unknown) {
      console.error("Status update error:", error);

      if (axios.isAxiosError(error)) {
        alert(
          error.response?.data?.message ||
          error.response?.data?.error ||
          `Failed to update status. HTTP ${error.response?.status || "error"}`
        );
      } else {
        alert("An unexpected error occurred.");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  // Delete selected user
  async function deleteUser(user: StaffUser) {
    const userId = user.id || user._id;

    if (!userId) {
      console.error("Invalid user:", user);
      alert("User ID is missing. Please check the users API response.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${user.name}?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(userId);

      const deleteUrl = `/auth/users/${encodeURIComponent(userId)}`;

      console.log("Deleting user:", user);
      console.log("Deleting user ID:", userId);
      console.log("DELETE URL:", deleteUrl);

      const response = await api.delete(deleteUrl);

      console.log("Delete response:", response.data);

      // Remove from table only after successful API response
      setUsers((prev) =>
        prev.filter((u) => (u.id || u._id) !== userId)
      );

      alert("User deleted successfully.");
    } catch (error: unknown) {
      console.error("DELETE USER ERROR:", error);

      if (axios.isAxiosError(error)) {
        console.error("HTTP Status:", error.response?.status);
        console.error("Backend Response:", error.response?.data);
        console.error("Request URL:", error.config?.url);

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message;

        alert(
          `Delete failed: ${message}\nHTTP Status: ${
            error.response?.status || "Network Error"
          }`
        );
      } else if (error instanceof Error) {
        alert(`Delete failed: ${error.message}`);
      } else {
        alert("An unexpected error occurred while deleting the user.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.header}>
        <h1 style={styles.heading}>Firm Users</h1>

        <button
          style={styles.primaryButton}
          onClick={() => navigate("/users/new")}
        >
          + New User
        </button>
      </div>

      {/* Users Table */}
      <div style={styles.tableContainer}>
        {loading ? (
          <AppLoader size="lg" />
        ) : users.length === 0 ? (
          <div style={styles.message}>No users found.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr key={u.id || u._id}>
                  <td style={styles.td}>{u.name}</td>

                  <td style={styles.td}>{u.email}</td>

                  <td style={styles.td}>
                    {u.role?.replace(/_/g, " ") || "-"}
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(u.status === "ACTIVE"
                          ? styles.activeBadge
                          : styles.inactiveBadge),
                      }}
                    >
                      {u.status || "UNKNOWN"}
                    </span>
                  </td>

                  <td style={styles.td}>
                    <div style={styles.actionContainer}>
                      <button
                        style={{
                          ...styles.statusButton,
                          opacity: updatingId === u.id ? 0.6 : 1,
                        }}
                        disabled={
                          updatingId === u.id ||
                          deletingId === u.id
                        }
                        onClick={() => toggleStatus(u)}
                      >
                        {updatingId === u.id
                          ? "Updating..."
                          : u.status === "ACTIVE"
                            ? "Disable"
                            : "Enable"}
                      </button>

                      <button
                        style={{
                          ...styles.deleteButton,
                          opacity: deletingId === u.id ? 0.6 : 1,
                          cursor:
                            deletingId === u.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                        disabled={
                          deletingId === u.id ||
                          updatingId === u.id
                        }
                        onClick={() => deleteUser(u)}
                      >
                        {deletingId === u.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
