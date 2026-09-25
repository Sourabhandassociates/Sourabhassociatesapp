import { api } from "../api/client";

/** Fetches a file-download endpoint as a blob and triggers a browser download —
 * this codebase has no existing file-download pattern, so this is the one shared
 * helper for it (used by the Cause List's Export PDF/Excel buttons). */
export async function downloadFile(url: string, params: Record<string, unknown>, filename: string): Promise<void> {
  const res = await api.get(url, { params, responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
