import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, createTask, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE", "Assigned Associate");
  const junior = await createUser("JUNIOR_ASSOCIATE", "Assigned Junior");
  const outsider = await createUser("ASSOCIATE", "Outsider Associate");
  const client = await createClient();
  const testCase = await createCase({
    partnerId: partner.id,
    advocateIds: [associate.id, junior.id],
    clientIds: [client.id],
  });
  const task = await createTask(testCase.id, junior.id, associate.id);

  return {
    case: testCase,
    task,
    associate,
    junior,
    outsider,
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    juniorToken: await tokenForUser(junior.id, "JUNIOR_ASSOCIATE"),
    outsiderToken: await tokenForUser(outsider.id, "ASSOCIATE"),
  };
}

describe("Task endpoints are scoped to case access (regression: previously unchecked entirely)", () => {
  it("GET /api/cases/:caseId/tasks — 404s for an unrelated Associate", async () => {
    const { case: testCase, outsiderToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/cases/:caseId/tasks — succeeds for an assigned Advocate", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .get(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /api/cases/:caseId/tasks — 404s for an unrelated Associate", async () => {
    const { case: testCase, junior, outsiderToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ title: "Sneaky Task", assignedToId: junior.id });
    expect(res.status).toBe(404);
  });

  it("POST /api/cases/:caseId/tasks — rejects an assignedToId that isn't an active staff member", async () => {
    const { case: testCase, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Bad Assignee", assignedToId: "does-not-exist" });
    expect(res.status).toBe(400);
  });

  it("POST /api/cases/:caseId/tasks — succeeds for an assigned Advocate", async () => {
    const { case: testCase, junior, associateToken } = await setup();
    const res = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "New Task", assignedToId: junior.id });
    expect(res.status).toBe(201);
  });

  it("GET /api/tasks/my — only ever returns the caller's own tasks", async () => {
    const { juniorToken } = await setup();
    const res = await request(app).get("/api/tasks/my").set("Authorization", `Bearer ${juniorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("PATCH /api/tasks/:id — CRITICAL REGRESSION CHECK: previously had zero access control; an unrelated Associate must now be blocked", async () => {
    const { task, outsiderToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/tasks/:id — the task's own assignee can update it even without being a case advocate elsewhere", async () => {
    const { task, juniorToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  it("PATCH /api/tasks/:id — a Partner/assigned-Advocate with case access can update a task they weren't assigned", async () => {
    const { task, associateToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ priority: "URGENT" });
    expect(res.status).toBe(200);
  });

  it("PATCH /api/tasks/:id — rejects reassigning to a non-existent user", async () => {
    const { task, associateToken } = await setup();
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: "does-not-exist" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks/all (Managing Partner Dashboard, SRD Section 18.1)", () => {
  it("is rejected for non-Managing-Partner roles", async () => {
    const { associateToken } = await setup();
    const res = await request(app).get("/api/tasks/all").set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("returns every task firm-wide, not just the caller's own, for the Managing Partner", async () => {
    const { case: testCase } = await setup();
    const partner = await createUser("MANAGING_PARTNER", "Second Partner Viewer");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app).get("/api/tasks/all").set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const task = res.body.find((t: { caseId: string }) => t.caseId === testCase.id);
    expect(task).toBeDefined();
    expect(task.assignedTo.name).toBeDefined();
    expect(typeof task.isOverdue).toBe("boolean");
  });
});

describe("Task reassignment (Step 1 revision, item 1)", () => {
  it("PATCH /api/tasks/:id — reassigning to a different employee updates assignedToId and writes an audit log entry", async () => {
    const { task, junior, associateToken } = await setup();
    const newAssignee = await createUser("ASSOCIATE", "New Assignee");

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: newAssignee.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(newAssignee.id);

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Task", entityId: task.id, action: "TASK_REASSIGNED" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].details).toContain(junior.name);
    expect(entries[0].details).toContain(newAssignee.name);
    expect(entries[0].userId).not.toBeNull();
  });

  it("PATCH /api/tasks/:id — resubmitting the same assignee does not write a reassignment audit entry", async () => {
    const { task, junior, associateToken } = await setup();
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: junior.id, priority: "HIGH" });

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Task", entityId: task.id, action: "TASK_REASSIGNED" },
    });
    expect(entries).toHaveLength(0);
  });

  it("PATCH /api/tasks/:id — marking a task COMPLETED sets completedAt, moving it back clears completedAt", async () => {
    const { task, associateToken } = await setup();
    const completed = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "COMPLETED" });
    expect(completed.body.completedAt).not.toBeNull();

    const reopened = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(reopened.body.completedAt).toBeNull();
  });
});

describe("GET /api/tasks/audit/:userId — Employee Task Audit (Step 1 revision, item 3)", () => {
  it("is rejected for non-Managing-Partner roles", async () => {
    const { junior, associateToken } = await setup();
    const res = await request(app)
      .get(`/api/tasks/audit/${junior.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("returns the employee's tasks with completion/overdue stats", async () => {
    const { junior, task } = await setup();
    const partner = await createUser("MANAGING_PARTNER", "Auditing Partner");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .get(`/api/tasks/audit/${junior.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.some((t: { id: string }) => t.id === task.id)).toBe(true);
    expect(res.body.stats.total).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.stats.completionRate).toBe("number");
    expect(typeof res.body.stats.onTimeRate).toBe("number");
  });

  it("search filters to matching task/matter titles only", async () => {
    const { junior } = await setup();
    const partner = await createUser("MANAGING_PARTNER", "Auditing Partner 2");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .get(`/api/tasks/audit/${junior.id}`)
      .query({ search: "no-such-task-title-xyz" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(0);
    expect(res.body.stats.total).toBe(0);
  });

  it("includes totalActiveCases and currentCases, excluding Closed/Archived cases", async () => {
    const { junior, case: activeCase } = await setup();
    const partner = await createUser("MANAGING_PARTNER", "Auditing Partner 3");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");

    // The setup() case defaults to INTAKE (not ACTIVE), so bump it to ACTIVE to
    // exercise the totalActiveCases count specifically.
    await prisma.case.update({ where: { id: activeCase.id }, data: { status: "ACTIVE" } });

    const closedCase = await createCase({ partnerId: partner.id, advocateIds: [junior.id] });
    await prisma.case.update({ where: { id: closedCase.id }, data: { status: "CLOSED" } });

    const res = await request(app)
      .get(`/api/tasks/audit/${junior.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.totalActiveCases).toBe(1);
    expect(res.body.currentCases.some((c: { id: string }) => c.id === activeCase.id)).toBe(true);
    expect(res.body.currentCases.some((c: { id: string }) => c.id === closedCase.id)).toBe(false);
  });
});

describe("Task History (Step 1 second revision, item 1)", () => {
  it("GET /api/tasks/:id — 404s for an unrelated Associate", async () => {
    const { task, outsiderToken } = await setup();
    const res = await request(app).get(`/api/tasks/${task.id}`).set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/tasks/:id — records TASK_CREATED, TASK_REASSIGNED, and TASK_STATUS_CHANGED in order", async () => {
    const { case: testCase, junior, associateToken } = await setup();
    const newAssignee = await createUser("ASSOCIATE", "Second Assignee");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Draft written statement", assignedToId: junior.id });
    const taskId = created.body.id;

    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: newAssignee.id });
    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "COMPLETED" });
    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ status: "IN_PROGRESS" });

    const res = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe("Draft written statement");

    const actions = res.body.history.map((h: { action: string }) => h.action);
    expect(actions).toEqual([
      "TASK_CREATED",
      "TASK_REASSIGNED",
      "TASK_STATUS_CHANGED",
      "TASK_STATUS_CHANGED",
    ]);
    expect(res.body.history[0].details).toContain(junior.name);
    expect(res.body.history[3].details).toContain("reopened");
    expect(res.body.history.every((h: { user: { id: string } | null }) => h.user !== null)).toBe(true);
  });
});

describe("Firm-wide audit trail expansion (2026-08-13) — plain-field TASK_UPDATED", () => {
  it("logs TASK_UPDATED with a structured diff for a plain title/description edit, without double-logging alongside reassignment/status-change", async () => {
    const { case: testCase, junior, associateToken } = await setup();

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Original Title", assignedToId: junior.id });
    const taskId = created.body.id;

    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Revised Title", description: "Added detail" });
    expect(res.status).toBe(200);

    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "Task", entityId: taskId, action: "TASK_UPDATED" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.changes).toMatchObject({
      title: { old: "Original Title", new: "Revised Title" },
      description: { old: null, new: "Added detail" },
    });

    // Confirm no TASK_REASSIGNED/TASK_STATUS_CHANGED fired for this plain-field-only edit.
    const otherEntries = await prisma.auditLog.count({
      where: { entityType: "Task", entityId: taskId, action: { in: ["TASK_REASSIGNED", "TASK_STATUS_CHANGED"] } },
    });
    expect(otherEntries).toBe(0);
  });

  it("a reassignment PATCH does not also produce a TASK_UPDATED entry", async () => {
    const { case: testCase, junior, associateToken } = await setup();
    const newAssignee = await createUser("ASSOCIATE", "Reassignment Target");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ title: "Reassignment-only task", assignedToId: junior.id });
    const taskId = created.body.id;

    await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ assignedToId: newAssignee.id });

    const updatedEntry = await prisma.auditLog.findFirst({
      where: { entityType: "Task", entityId: taskId, action: "TASK_UPDATED" },
    });
    expect(updatedEntry).toBeNull();
  });
});
