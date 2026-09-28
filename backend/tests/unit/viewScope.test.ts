import { describe, it, expect } from "vitest";
import { resolveViewScope } from "../../src/modules/permissions/viewScope";
import { AuthorizedActor } from "../../src/utils/jwt";

function actorWith(keys: string[]): AuthorizedActor {
  return { sub: "u1", actorType: "USER", role: "ASSOCIATE", sessionId: "s1", effectivePermissions: new Set(keys) };
}

describe("resolveViewScope (Step 3 M2 — design doc Section 4)", () => {
  it("returns ALL when the module's VIEW_ALL permission is granted", () => {
    expect(resolveViewScope(actorWith(["CASES.VIEW_ALL"]), "CASES")).toBe("ALL");
  });

  it("returns ASSIGNED when only VIEW_ASSIGNED is granted", () => {
    expect(resolveViewScope(actorWith(["CASES.VIEW_ASSIGNED"]), "CASES")).toBe("ASSIGNED");
  });

  it("returns OWN when only VIEW_OWN is granted", () => {
    expect(resolveViewScope(actorWith(["TASKS.VIEW_OWN"]), "TASKS")).toBe("OWN");
  });

  it("returns NONE when none of the triad is granted", () => {
    expect(resolveViewScope(actorWith(["CASES.CREATE"]), "CASES")).toBe("NONE");
  });

  it("prefers ALL over ASSIGNED over OWN when more than one is (defensively) granted", () => {
    expect(resolveViewScope(actorWith(["CASES.VIEW_ALL", "CASES.VIEW_ASSIGNED"]), "CASES")).toBe("ALL");
    expect(resolveViewScope(actorWith(["TASKS.VIEW_ASSIGNED", "TASKS.VIEW_OWN"]), "TASKS")).toBe("ASSIGNED");
  });

  it("is scoped strictly per module — a grant on one module never leaks into another", () => {
    expect(resolveViewScope(actorWith(["CASES.VIEW_ALL"]), "CLIENTS")).toBe("NONE");
  });

  it("treats a missing effectivePermissions set as granting nothing (fail-closed)", () => {
    const actor: AuthorizedActor = { sub: "u1", actorType: "USER", role: "ASSOCIATE", sessionId: "s1" };
    expect(resolveViewScope(actor, "CASES")).toBe("NONE");
  });
});
