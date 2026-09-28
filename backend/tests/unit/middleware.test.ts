import { describe, it, expect, vi } from "vitest";
import { Request, Response } from "express";
import { requireAuth } from "../../src/middleware/auth";
import { requireRole, requireStaff, requireClient } from "../../src/middleware/rbac";
import { signAccessToken } from "../../src/utils/jwt";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header (not Bearer)", () => {
    const req = { headers: { authorization: "Basic abc123" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid/garbage token", () => {
    const req = { headers: { authorization: "Bearer not-a-real-jwt" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a validly signed token and attaches req.actor", () => {
    const token = signAccessToken({
      sub: "user-1",
      actorType: "USER",
      role: "ASSOCIATE",
      sessionId: "session-1",
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.actor).toMatchObject({ sub: "user-1", role: "ASSOCIATE", actorType: "USER" });
  });
});

describe("requireRole", () => {
  it("rejects when req.actor is missing entirely", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("MANAGING_PARTNER")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an actor whose role is not in the allowed list", () => {
    const req = {
      actor: { sub: "u1", actorType: "USER", role: "JUNIOR_ASSOCIATE", sessionId: "s1" },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("MANAGING_PARTNER", "ASSOCIATE")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows an actor whose role is in the allowed list", () => {
    const req = { actor: { sub: "u1", actorType: "USER", role: "ASSOCIATE", sessionId: "s1" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("MANAGING_PARTNER", "ASSOCIATE")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireStaff / requireClient", () => {
  it("requireStaff rejects a CLIENT actor", () => {
    const req = { actor: { sub: "c1", actorType: "CLIENT", role: "CLIENT", sessionId: "s1" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireStaff(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireStaff allows a USER actor", () => {
    const req = { actor: { sub: "u1", actorType: "USER", role: "OFFICE_STAFF", sessionId: "s1" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireStaff(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("requireClient rejects a USER actor", () => {
    const req = {
      actor: { sub: "u1", actorType: "USER", role: "MANAGING_PARTNER", sessionId: "s1" },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireClient allows a CLIENT actor", () => {
    const req = { actor: { sub: "c1", actorType: "CLIENT", role: "CLIENT", sessionId: "s1" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireClient(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
