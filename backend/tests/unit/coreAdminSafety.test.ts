import { describe, it, expect } from "vitest";
import { assertRoleDefaultChangeAllowed, assertOverrideAllowed } from "../../src/modules/permissions/coreAdminSafety";

describe("Managing Partner Safety — Rule A (role-default change), design doc Section 9.3", () => {
  it("blocks revoking a core-admin permission from the MANAGING_PARTNER role default", () => {
    expect(() => assertRoleDefaultChangeAllowed("MANAGING_PARTNER", true, false)).toThrow(/cannot be removed/);
  });

  it("allows granting a core-admin permission to MANAGING_PARTNER (only revoking is blocked)", () => {
    expect(() => assertRoleDefaultChangeAllowed("MANAGING_PARTNER", true, true)).not.toThrow();
  });

  it("allows revoking a core-admin permission from a non-Managing-Partner role", () => {
    expect(() => assertRoleDefaultChangeAllowed("ASSOCIATE", true, false)).not.toThrow();
  });

  it("allows revoking a non-core-admin permission from MANAGING_PARTNER", () => {
    expect(() => assertRoleDefaultChangeAllowed("MANAGING_PARTNER", false, false)).not.toThrow();
  });
});

describe("Managing Partner Safety — Rule B (override), design doc Section 9.3", () => {
  it("blocks a REVOKE override of a core-admin permission targeting a MANAGING_PARTNER user", () => {
    expect(() => assertOverrideAllowed("MANAGING_PARTNER", true, "REVOKE")).toThrow(/cannot be revoked/);
  });

  it("allows a GRANT override of a core-admin permission targeting a MANAGING_PARTNER user", () => {
    expect(() => assertOverrideAllowed("MANAGING_PARTNER", true, "GRANT")).not.toThrow();
  });

  it("allows a REVOKE override of a core-admin permission targeting a non-Managing-Partner user", () => {
    expect(() => assertOverrideAllowed("ASSOCIATE", true, "REVOKE")).not.toThrow();
  });

  it("allows a REVOKE override of a non-core-admin permission targeting a MANAGING_PARTNER user", () => {
    expect(() => assertOverrideAllowed("MANAGING_PARTNER", false, "REVOKE")).not.toThrow();
  });
});
