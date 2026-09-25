import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, createTask, tokenForUser } from "../helpers/fixtures";

/**
 * Step 3 M2 completion — PATCH /api/tasks/:id's body-aware permission check
 * (tasks.service.ts's requiredTaskActions/assertTaskActionsAllowed). Distinct from
 * tasks.test.ts's existing PATCH coverage, which already proves the default-role
 * behavior is unchanged (Associates/Partners/Junior Associates all retain
 * TASKS.EDIT/CHANGE_STATUS/ASSIGN by default) — these tests specifically exercise
 * the edge case that motivated this change: a role whose default denies the broad
 * permission, acting on a task it was personally assigned.
 */
async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE");
  // A second Associate, on the same case, who never becomes the task's assignee in
  // any test below — so `associate`'s access to `notOwnTask` comes purely from case
  // advocacy, never the own-assignee bypass, keeping the two code paths cleanly
  // separated in these tests.
  const otherAssignee = await createUser("ASSOCIATE", "Other Assignee");
  // Accounts Team: TASKS.EDIT/CHANGE_STATUS/ASSIGN all deny by default (design doc
  // §3.6), but TASKS.VIEW_OWN is granted to every role — the exact combination this
  // fix has to get right.
  const accountsMember = await createUser("ACCOUNTS_TEAM");
  const client = await createClient();
  const testCase = await createCase({
    partnerId: partner.id,
    advocateIds: [associate.id, otherAssignee.id],
    clientIds: [client.id],
  });
  const ownTask = await createTask(testCase.id, accountsMember.id, partner.id);
  const notOwnTask = await createTask(testCase.id, otherAssignee.id, partner.id);

  return {
    case: testCase,
    ownTask,
    notOwnTask,
    partner,
    associate,
    otherAssignee,
    accountsMember,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    accountsToken: await tokenForUser(accountsMember.id, "ACCOUNTS_TEAM"),
  };
}

describe("PATCH /api/tasks/:id — own-assignee workflow preserved under permission-based authorization", () => {
  it("Accounts Team (TASKS.EDIT/CHANGE_STATUS/ASSIGN all denied by default) can still update a task assigned to them", async () => {
    const { ownTask, accountsToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${ownTask.id}`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ priority: "URGENT" });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe("URGENT");
  });

  it("Accounts Team can change the status of a task assigned to them", async () => {
    const { ownTask, accountsToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${ownTask.id}`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  it("Accounts Team can reassign a task assigned to them — matches today's exact pre-Step-3 behavior", async () => {
    const { ownTask, accountsToken, associate } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${ownTask.id}`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ assignedToId: associate.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(associate.id);
  });

  it("Accounts Team is blocked from editing a task NOT assigned to them, even with firm-wide case view access", async () => {
    const { notOwnTask, accountsToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ priority: "URGENT" });
    // Accounts Team holds CASES.VIEW_ALL (Milestone 2, SRD Section 3.5 — read-only
    // case metadata access needed for invoicing), so row-level scoping finds the
    // task's case; the request still 403s at the action-permission layer since
    // TASKS.EDIT is denied by default for this role and it isn't the task's own
    // assignee — proving the permission layer, not row-level scoping, is what
    // blocks this specific action.
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/tasks/:id — permission overrides distinguish edit / status / reassign", () => {
  it("revoking TASKS.EDIT via override blocks a field edit on a case-scoped (non-own) task but leaves status changes and reassignment untouched", async () => {
    const { notOwnTask, associate, associateToken, partner } = await setup();
    const editPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "TASKS.EDIT" } });
    await prisma.userPermissionOverride.create({
      data: {
        userId: associate.id,
        permissionId: editPermission.id,
        effect: "REVOKE",
        reason: "Testing action-specific permission distinction",
        setById: partner.id,
      },
    });

    const editRes = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ priority: "URGENT" });
    expect(editRes.status).toBe(403);

    const statusRes = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(statusRes.status).toBe(200);
  });

  it("revoking TASKS.ASSIGN via override blocks reassignment specifically, while TASKS.EDIT still allows a field edit in the same test", async () => {
    const { notOwnTask, associate, associateToken, partner } = await setup();
    const assignPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "TASKS.ASSIGN" } });
    await prisma.userPermissionOverride.create({
      data: {
        userId: associate.id,
        permissionId: assignPermission.id,
        effect: "REVOKE",
        reason: "Testing action-specific permission distinction",
        setById: partner.id,
      },
    });

    const reassignRes = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: partner.id });
    expect(reassignRes.status).toBe(403);

    const editRes = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ description: "Updated description" });
    expect(editRes.status).toBe(200);
  });

  it("a request combining a field edit and a status change requires both permissions — revoking just one blocks the whole request", async () => {
    const { notOwnTask, associate, associateToken, partner } = await setup();
    const statusPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "TASKS.CHANGE_STATUS" } });
    await prisma.userPermissionOverride.create({
      data: {
        userId: associate.id,
        permissionId: statusPermission.id,
        effect: "REVOKE",
        reason: "Testing combined-action requests",
        setById: partner.id,
      },
    });

    const res = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ priority: "URGENT", status: "IN_PROGRESS" });
    expect(res.status).toBe(403);

    // Confirm nothing was partially applied — the whole request was rejected before
    // any prisma.task.update call, not applied-then-rolled-back.
    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: notOwnTask.id } });
    expect(unchanged.priority).not.toBe("URGENT");
    expect(unchanged.status).not.toBe("IN_PROGRESS");
  });

  it("granting TASKS.ASSIGN via override to a role that denies it by default allows reassignment of a task the grantee doesn't own", async () => {
    const { notOwnTask, accountsMember, accountsToken, partner } = await setup();
    // Accounts Team holds CASES.VIEW_ALL (Milestone 2), so row-level scoping already
    // finds notOwnTask's case — this test isolates the action-permission layer: a
    // GRANT override on a role that denies TASKS.ASSIGN by default should enable
    // reassignment of a task the grantee doesn't own, independent of the own-task
    // bypass tested above.
    const assignPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "TASKS.ASSIGN" } });
    await prisma.userPermissionOverride.create({
      data: {
        userId: accountsMember.id,
        permissionId: assignPermission.id,
        effect: "GRANT",
        reason: "Testing GRANT override enabling a denied-by-default action",
        setById: partner.id,
      },
    });

    const res = await request(app)
      .patch(`/api/tasks/${notOwnTask.id}`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ assignedToId: partner.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(partner.id);
  });
});
