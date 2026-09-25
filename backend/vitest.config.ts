import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Loaded here (config evaluation happens before any test file is imported) so
// config/env.ts sees the TEST database/secrets, never the dev ones.
const testEnv = dotenv.config({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    env: testEnv,
    setupFiles: ["./tests/setup.ts"],
    // Bumped from 20000 (2026-08-06) — a couple of bcrypt/TOTP-heavy MFA tests were
    // observed timing out under full-suite CPU contention (30+ min runs) despite
    // taking ~12-13s in isolation; this is test-infra headroom, not a slower app.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Tests truncate a shared database between each other — run everything in
    // one process/one file at a time so truncation from one test can never
    // race with another test still reading/writing the same tables.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
