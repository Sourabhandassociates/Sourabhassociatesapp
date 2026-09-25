import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";

interface PicklistValue {
  id: string;
  value: string;
}

/**
 * Step 1 revision (Managing Partner review, item 8) — a searchable dropdown backed by
 * a PicklistValue category, reused everywhere a field would otherwise be free text
 * (Court, Judge, Case Stage, Practice Area, Case Type, Opposite Counsel, Opposite
 * Party, Department, Hearing Purpose) so the same spelling is reused across the app.
 * Only the Managing Partner can add a new value inline (mirrors the backend's
 * MANAGING_PARTNER-only POST /api/picklists/:category restriction) — everyone else
 * must pick from the existing curated list.
 */
export function SearchableSelect({
  category,
  value,
  onChange,
  placeholder,
  id,
  required,
}: {
  category: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
}) {
  const { auth } = useAuth();
  const canAdd = auth?.role === "MANAGING_PARTNER";

  const [options, setOptions] = useState<PicklistValue[]>([]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>();

  const loadOptions = useCallback(() => {
    api.get(`/picklists/${category}`).then((res) => setOptions(res.data));
  }, [category]);
  useEffect(() => loadOptions(), [loadOptions]);
  useEffect(() => setQuery(value), [value]);

  const filtered = options.filter((o) => o.value.toLowerCase().includes(query.trim().toLowerCase()));
  const exactMatch = options.some((o) => o.value.toLowerCase() === query.trim().toLowerCase());

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setQuery(optionValue);
    setOpen(false);
  }

  async function addNewValue() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await api.post(`/picklists/${category}`, { value: trimmed });
      loadOptions();
      selectOption(trimmed);
    } catch {
      // The value may already exist (race with another admin) — select it anyway if so.
      selectOption(trimmed);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        value={query}
        placeholder={placeholder}
        required={required}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            zIndex: 10,
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            marginTop: 2,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {filtered.map((o) => (
            <div key={o.id} className="searchable-select-option" onClick={() => selectOption(o.value)}>
              {o.value}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: "8px 12px" }}>
              No matches.
            </div>
          )}
          {canAdd && query.trim() && !exactMatch && (
            <div
              onClick={addNewValue}
              className="muted searchable-select-option"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              {adding ? "Adding…" : `+ Add "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
