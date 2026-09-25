import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

/**
 * The app's real authRateLimit/generalRateLimit (middleware/rateLimit.ts) are
 * deliberately disabled under NODE_ENV=test (the automated suite makes dozens of
 * rapid requests by design — that's not abuse, it's the point). This test builds an
 * isolated Express app using the same express-rate-limit configuration/handler shape
 * to verify the *behavior* our middleware relies on, independent of that test-mode skip.
 */
describe("rate limiting behavior (isolated from the app's test-mode skip)", () => {
  it("returns 429 with a JSON error after exceeding the configured limit", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: "Too many requests. Please try again later." }),
    });
    app.get("/probe", limiter, (_req, res) => res.json({ ok: true }));

    await request(app).get("/probe").expect(200);
    await request(app).get("/probe").expect(200);
    const blocked = await request(app).get("/probe");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Too many requests");
  });
});
