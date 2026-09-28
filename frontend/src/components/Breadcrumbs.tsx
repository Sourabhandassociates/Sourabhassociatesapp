import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/**
 * Admin Settings -> Utilities reorganization (2026-08-12) — first use of a shared
 * breadcrumb trail anywhere in the app, introduced because Data Import is now nested
 * two levels deep (Admin Settings > Utilities > Data Import). The last item is always
 * the current page and is never a link.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs no-print" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
          {i < items.length - 1 && <span className="breadcrumb-sep"> / </span>}
        </span>
      ))}
    </nav>
  );
}
