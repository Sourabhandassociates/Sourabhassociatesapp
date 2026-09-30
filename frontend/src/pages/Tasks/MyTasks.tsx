import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  case: { id: string; matterNumber: string; title: string };
}

export default function MyTasks() {
  const [tasks, setTasks] = useState<MyTask[]>([]);

  function load() {
    api.get("/tasks/my").then((res) => setTasks(res.data));
  }
  useEffect(() => load(), []);

  async function updateStatus(id: string, status: string) {
    await api.patch(`/tasks/${id}`, { status });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Tasks</h1>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Matter</th>
              <th>Priority</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                </td>
                <td>
                  <Link to={`/cases/${t.case.id}`}>{t.case.matterNumber}</Link>
                </td>
                <td>{t.priority}</td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td>
                  <select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)}>
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No tasks assigned to you.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
