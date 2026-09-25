import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("Security headers (Helmet) and CORS", () => {
  it("includes baseline Helmet security headers on every response", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("reflects an allowed origin and sets Access-Control-Allow-Credentials for CORS", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not reflect a disallowed origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
