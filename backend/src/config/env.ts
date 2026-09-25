import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Fails fast at startup rather than letting a weak/placeholder secret slip into any
 * running environment. 32 chars is a floor (256 bits of maximum entropy for a random
 * hex string) — generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function requireStrongSecret(name: string): string {
  const value = required(name);
  if (value.length < 32) {
    throw new Error(
      `${name} must be at least 32 characters long. Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return value;
}

function parseOrigins(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),

  jwtAccessSecret: requireStrongSecret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requireStrongSecret("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  /** Milestone 4 (Version 1.0 completion, SRD Section 28 — MFA). AES-256-GCM key
   * encrypting each user's TOTP shared secret at rest (utils/mfa.ts) — needs its own
   * key, distinct from the JWT secrets, since it protects a different kind of value
   * (a decryptable secret, not a signature). */
  mfaEncryptionKey: requireStrongSecret("MFA_ENCRYPTION_KEY"),

  clientIdPrefix: process.env.CLIENT_ID_PREFIX ?? "SA-CLI-",
  matterNumberPrefix: process.env.MATTER_NUMBER_PREFIX ?? "SA-MAT-",
  /** Milestone 2 (Version 1.0 completion, SRD Section 16) — Invoice numbering. */
  invoiceNumberPrefix: process.env.INVOICE_NUMBER_PREFIX ?? "SA-INV-",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",

  // SRD Section 31.2 — Web Admin Portal and future mobile apps share one backend;
  // only the Web Admin Portal's origin(s) need CORS (mobile apps don't send an
  // Origin header the way a browser does).
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN, ["http://localhost:5173"]),

  // Refresh-token cookie (web clients only — see utils/cookies.ts)
  cookieSameSite: (process.env.COOKIE_SAME_SITE as "strict" | "lax" | "none") ?? "strict",
  refreshCookieName: "saa_refresh_token",

  rateLimit: {
    // Generous general ceiling — this is abuse/DoS protection, not a feature limit.
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    // Tight ceiling specifically on credential-guessing endpoints.
    authWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  },
};
