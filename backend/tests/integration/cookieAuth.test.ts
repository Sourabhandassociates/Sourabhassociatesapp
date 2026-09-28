import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser } from "../helpers/fixtures";

/** supertest/superagent don't consistently type `set-cookie` as an array, so normalize by hand. */
function setCookieHeaders(headers: Record<string, string | string[] | undefined>): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function findSetCookie(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  return setCookieHeaders(headers).find((c) => c.startsWith(`${name}=`));
}

function cookieHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  return findSetCookie(headers, name)?.split(";")[0];
}

describe("Cookie-based refresh tokens (web) vs JSON-body tokens (mobile)", () => {
  it("web login (no platform header) sets an httpOnly refresh cookie and omits refreshToken from the body", async () => {
    const user = await createUser("MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: user.email, password: "Test1234!" });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.accessToken).toBeTruthy();

    const setCookieRaw = findSetCookie(res.headers, "saa_refresh_token");
    expect(setCookieRaw).toBeTruthy();
    expect(setCookieRaw).toContain("HttpOnly");
    expect(setCookieRaw).toContain("Path=/api/auth");
  });

  it("mobile login (X-Client-Platform: mobile) returns refreshToken in the body and sets no cookie", async () => {
    const user = await createUser("MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/auth/login/staff")
      .set("X-Client-Platform", "mobile")
      .send({ email: user.email, password: "Test1234!" });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
    expect(setCookieHeaders(res.headers)).toHaveLength(0);
  });

  it("web refresh works from the cookie alone (no refreshToken in the request body)", async () => {
    const user = await createUser("ASSOCIATE");
    const login = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: user.email, password: "Test1234!" });
    const cookie = cookieHeaderValue(login.headers, "saa_refresh_token")!;
    const payload = JSON.parse(Buffer.from(login.body.accessToken.split(".")[1], "base64").toString());

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .send({ sessionId: payload.sessionId, actorType: "USER" });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
    expect(refreshRes.body.refreshToken).toBeUndefined();
    // Rotation: a fresh cookie should be issued, not the same value reused.
    const newCookie = cookieHeaderValue(refreshRes.headers, "saa_refresh_token");
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(cookie);
  });

  it("web refresh fails with no cookie and no body refreshToken", async () => {
    const user = await createUser("ASSOCIATE");
    const login = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: user.email, password: "Test1234!" });
    const payload = JSON.parse(Buffer.from(login.body.accessToken.split(".")[1], "base64").toString());

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ sessionId: payload.sessionId, actorType: "USER" });
    expect(res.status).toBe(401);
  });

  it("mobile refresh works from the body's refreshToken (no cookie involved)", async () => {
    const user = await createUser("ASSOCIATE");
    const login = await request(app)
      .post("/api/auth/login/staff")
      .set("X-Client-Platform", "mobile")
      .send({ email: user.email, password: "Test1234!" });
    const payload = JSON.parse(Buffer.from(login.body.accessToken.split(".")[1], "base64").toString());

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("X-Client-Platform", "mobile")
      .send({ refreshToken: login.body.refreshToken, sessionId: payload.sessionId, actorType: "USER" });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("logout clears the refresh cookie", async () => {
    const user = await createUser("ASSOCIATE");
    const login = await request(app)
      .post("/api/auth/login/staff")
      .send({ email: user.email, password: "Test1234!" });
    const cookie = cookieHeaderValue(login.headers, "saa_refresh_token")!;

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .set("Cookie", cookie);

    expect(logoutRes.status).toBe(204);
    const clearedCookie = findSetCookie(logoutRes.headers, "saa_refresh_token");
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toMatch(/saa_refresh_token=;/); // cleared to empty value
  });
});
