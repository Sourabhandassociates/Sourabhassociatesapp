import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";

interface FieldDefinition {
  id: string;
  entityType: string;
  label: string;
  fieldType: string;
  isActive: boolean;
}

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN"];

/** Milestone 4 (Version 1.0 completion, SRD Section 24 — Custom Fields). Scoped to
 * the Case entity only for Version 1.0 (matches customFields.service.ts's
 * SUPPORTED_ENTITY_TYPES) — Managing-Partner-only (CUSTOM_FIELDS.MANAGE). */
export default function CustomFields() {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("TEXT");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/custom-fields/definitions", { params: { entityType: "CASE" } }).then((res) => setDefinitions(res.data));
  }, []);
  useEffect(() => load(), [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return;
    try {
      await api.post("/custom-fields/definitions", { entityType: "CASE", label: label.trim(), fieldType });
      setLabel("");
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create custom field"));
    }
  }

  async function handleDeactivate(id: string, fieldLabel: string) {
    if (!window.confirm(`Remove the "${fieldLabel}" custom field from every case? Existing values are kept but hidden.`)) return;
    await api.delete(`/custom-fields/definitions/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Custom Fields — Case</h1>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        Add extra fields to the Case Overview screen without a code change. Version 1.0 supports Case fields only.
      </p>

      <div className="card">
        <h3>Add Field</h3>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="fieldLabel">Field Label</label>
            <input id="fieldLabel" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div style={{ minWidth: 160 }}>
            <label htmlFor="fieldType">Type</label>
            <select id="fieldType" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" type="submit" disabled={!label.trim()}>
            Add Field
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>Existing Fields</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((d) => (
                <tr key={d.id}>
                  <td>{d.label}</td>
                  <td>{d.fieldType.charAt(0) + d.fieldType.slice(1).toLowerCase()}</td>
                  <td>
                    <button onClick={() => handleDeactivate(d.id, d.label)}>Remove</button>
                  </td>
                </tr>
              ))}
              {definitions.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No custom fields defined yet.
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
