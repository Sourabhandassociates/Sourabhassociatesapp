import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { env } from "../config/env";
import { hashPassword, comparePassword } from "./password";

/**
 * Milestone 4 (Version 1.0 completion, SRD Section 28 — "MFA (mandatory for
 * Partner/Accounts)"). TOTP (RFC 6238) rather than SMS/email OTP — no third-party
 * provider needed (unlike Notifications' Email/SMS channels, Milestone 3), so this is
 * fully implementable in this environment with just an authenticator app on the
 * user's own device.
 */
const ALGORITHM = "aes-256-gcm";

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(env.mfaEncryptionKey).digest();
}

/** AES-256-GCM: the TOTP secret must be *decryptable* to verify a code (unlike a
 * password, which only ever needs comparing), so it's encrypted, not hashed. */
export function encryptSecret(plainSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivHex, authTagHex, dataHex] = encoded.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotpCode(plainSecret: string, code: string): boolean {
  return authenticator.check(code, plainSecret);
}

export async function generateProvisioningQrCode(email: string, plainSecret: string): Promise<string> {
  const uri = authenticator.keyuri(email, "S&A LEGAL", plainSecret);
  return QRCode.toDataURL(uri);
}

/** Ten single-use recovery codes, generated at enrollment and shown to the user
 * exactly once — hashed the same way passwords are (never compared in the clear). */
export async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex"));
  const hashed = await Promise.all(plain.map((code) => hashPassword(code)));
  return { plain, hashed };
}

export async function consumeBackupCode(hashedCodes: string[], candidate: string): Promise<string[] | null> {
  for (const hashed of hashedCodes) {
    // eslint-disable-next-line no-await-in-loop -- backup codes are few (10) and this only runs on the rare fallback path
    if (await comparePassword(candidate, hashed)) {
      return hashedCodes.filter((h) => h !== hashed);
    }
  }
  return null;
}
