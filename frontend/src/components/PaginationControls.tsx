interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Milestone 4 (Version 1.0 completion, IMPROVEMENTS.md #16) — reads the
 * X-Total-Count/X-Page/X-Page-Size response headers list endpoints now send
 * alongside their (unchanged) plain-array body. */
export function PaginationControls({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
      <span className="muted">
        {rangeStart}–{rangeEnd} of {total}
      </span>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
      <label htmlFor="paginationPageSize" className="muted">
        Per page
      </label>
      <select
        id="paginationPageSize"
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        style={{ maxWidth: 90 }}
      >
        {[25, 50, 100, 200].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
