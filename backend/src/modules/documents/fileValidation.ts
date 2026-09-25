import fs from "fs/promises";
import { BadRequestError } from "../../utils/errors";
import { logSecurityEvent } from "../../utils/securityLogger";

// Standard EICAR antivirus test string (not real malware — every AV product recognizes
// it by design, used industry-wide to verify a scan path actually triggers on something).
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

// Executable magic bytes that should never appear inside a document upload (the
// allowlist only accepts pdf/png/jpeg/tiff/doc/docx) — catches an executable renamed
// with a document extension, which is exactly the case the .doc branch below can't
// verify via MIME/magic-byte comparison alone.
const EXECUTABLE_SIGNATURES: { name: string; bytes: Buffer }[] = [
  { name: "Windows PE (.exe/.dll)", bytes: Buffer.from("MZ", "latin1") },
  { name: "Linux ELF binary", bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
  { name: "Mach-O binary (32-bit)", bytes: Buffer.from([0xfe, 0xed, 0xfa, 0xce]) },
  { name: "Mach-O binary (64-bit)", bytes: Buffer.from([0xfe, 0xed, 0xfa, 0xcf]) },
  { name: "shell script", bytes: Buffer.from("#!", "latin1") },
];

/**
 * Malware-scan integration point. No third-party AV engine is wired up in this pass —
 * that needs infrastructure (e.g. a ClamAV daemon, or a cloud scanning API) that isn't
 * provisioned yet, and standing one up is out of scope for an application-code security
 * pass. In the meantime this does real, dependency-free detection rather than a no-op
 * stub: the industry-standard EICAR test signature (so the scan path is actually
 * verifiable end-to-end without needing real malware), plus a magic-byte heuristic for
 * executable content disguised as a document. Every uploaded file already flows through
 * this exact function before its Document/DocumentVersion row is created, so wiring in a
 * real AV engine later is a one-line change here — not a new integration point that has
 * to be threaded through the upload path from scratch.
 */
export async function scanForMalware(buffer: Buffer): Promise<{ clean: boolean; reason?: string }> {
  if (buffer.includes(EICAR_SIGNATURE, 0, "latin1")) {
    return { clean: false, reason: "EICAR antivirus test signature detected" };
  }

  for (const signature of EXECUTABLE_SIGNATURES) {
    if (buffer.length >= signature.bytes.length && buffer.subarray(0, signature.bytes.length).equals(signature.bytes)) {
      return { clean: false, reason: `Executable content detected (${signature.name}) inside a document upload` };
    }
  }

  return { clean: true };
}

/**
 * Minimal, dependency-free magic-byte verification for exactly the formats
 * storage.ts's allowlist accepts. Written in-house rather than pulling in a
 * third-party sniffing library: the only maintained options for this are pure-ESM
 * (e.g. `file-type` 21+), which this project's CommonJS TypeScript build can't resolve
 * types for without a much broader (and riskier) module-resolution change project-wide
 * — a handful of well-documented magic numbers is little enough surface to own directly
 * and verify exactly.
 */
function detectMimeType(buffer: Buffer): string | undefined {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 4 &&
    (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || // little-endian "II*\0"
      buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) // big-endian "MM\0*"
  ) {
    return "image/tiff";
  }
  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && // ZIP local file header ("PK\x03\x04")
    buffer.includes("word/document.xml") // distinguishes a .docx from a plain .zip or other OOXML (xlsx/pptx)
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return undefined;
}

interface ValidateArgs {
  filePath: string;
  declaredMimeType: string;
  actorId: string;
}

/**
 * Verifies the file's actual content matches what it claims to be, rather than trusting
 * the client-supplied extension/MIME type alone (storage.ts's fileFilter is spoofable —
 * renaming a script to "brief.pdf" with a forged Content-Type is trivial). Throws and
 * deletes the file from disk if verification fails, so a rejected upload never leaves
 * an orphaned file or a Document/DocumentVersion row pointing at one.
 */
export async function validateUploadedFile({
  filePath,
  declaredMimeType,
  actorId,
}: ValidateArgs): Promise<void> {
  async function reject(reason: string): Promise<never> {
    await fs.unlink(filePath).catch(() => undefined);
    logSecurityEvent("FILE_UPLOAD_REJECTED", { message: reason, actorId, declaredMimeType });
    throw new BadRequestError(reason);
  }

  const buffer = await fs.readFile(filePath);

  // Legacy .doc (an OLE2/CFB container) isn't reliably distinguishable from other
  // OLE2-based formats (xls, ppt) by its leading bytes alone — the extension +
  // declared-MIME allowlist in storage.ts's fileFilter is the control for that one
  // specific format. Every other allowed type gets full magic-byte verification below.
  // The malware scan below still runs regardless — skipping the type check isn't a
  // reason to skip scanning the content too.
  if (declaredMimeType !== "application/msword") {
    const detected = detectMimeType(buffer);
    if (!detected || detected !== declaredMimeType) {
      await reject(
        `File content does not match its declared type (expected ${declaredMimeType}, detected ${detected ?? "unrecognized"}) — it may have been renamed or is corrupted.`
      );
    }
  }

  const scan = await scanForMalware(buffer);
  if (!scan.clean) {
    await reject(`File failed malware scan: ${scan.reason ?? "unknown reason"}`);
  }
}
