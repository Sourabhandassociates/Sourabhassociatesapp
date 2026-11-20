import type { CSSProperties } from "react";

/** Shared, accessible loading indicator used throughout the application. */
export function AppLoader({
  size = "md",
  label = "Loading",
  inline = false,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  inline?: boolean;
}) {
  const dimensions = size === "sm" ? 16 : size === "lg" ? 38 : 26;
  const style: CSSProperties = {
    width: dimensions,
    height: dimensions,
    borderWidth: size === "sm" ? 2 : 3,
  };

  return (
    <span
      className={`app-loader${inline ? " app-loader-inline" : ""}`}
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="app-loader-spinner" style={style} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
