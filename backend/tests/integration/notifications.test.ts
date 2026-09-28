import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createCase, tokenForUser } from "../helpers/fixtures";

describe("Notifications & Reminders (Milestone 3, SRD Section 17, in-app channel)", () => {
  it("TASK_ASSIGNED — assigning a task to someone else notifies them, but not on self-assignment", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Draft reply", priority: "MEDIUM", assignedToId: associate.id });

    const associateNotifications = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    expect(associateNotifications.status).toBe(200);
    expect(associateNotifications.body.some((n: { type: string }) => n.type === "TASK_ASSIGNED")).toBe(true);

    // Self-assigned task (partner assigns to self) — no notification for the actor.
    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "My own task", priority: "LOW", assignedToId: partner.id });
    const partnerNotifications = await request(app).get("/api/notifications").set("Authorization", `Bearer ${partnerToken}`);
    expect(partnerNotifications.body.some((n: { type: string }) => n.type === "TASK_ASSIGNED")).toBe(false);
  });

  it("HEARING_SCHEDULED — notifies the case team excluding the actor who scheduled it", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    await request(app)
      .post(`/api/cases/${testCase.id}/hearings`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ hearingDate: new Date(Date.now() + 86400000).toISOString() });

    const associateNotifications = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    expect(associateNotifications.body.some((n: { type: string }) => n.type === "HEARING_SCHEDULED")).toBe(true);

    const partnerNotifications = await request(app).get("/api/notifications").set("Authorization", `Bearer ${partnerToken}`);
    expect(partnerNotifications.body.some((n: { type: string }) => n.type === "HEARING_SCHEDULED")).toBe(false);
  });

  it("unread-count, mark-read, and mark-all-read behave correctly", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Task A", priority: "MEDIUM", assignedToId: associate.id });
    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Task B", priority: "MEDIUM", assignedToId: associate.id });

    const countRes = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${associateToken}`);
    expect(countRes.body.count).toBe(2);

    const list = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    const firstId = list.body[0].id;
    const markRes = await request(app).patch(`/api/notifications/${firstId}/read`).set("Authorization", `Bearer ${associateToken}`);
    expect(markRes.status).toBe(204);

    const countAfterOne = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${associateToken}`);
    expect(countAfterOne.body.count).toBe(1);

    const markAllRes = await request(app).patch("/api/notifications/read-all").set("Authorization", `Bearer ${associateToken}`);
    expect(markAllRes.status).toBe(204);
    const countAfterAll = await request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${associateToken}`);
    expect(countAfterAll.body.count).toBe(0);
  });

  it("a user can never mark another user's notification as read", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    await request(app)
      .post(`/api/cases/${testCase.id}/tasks`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Task A", priority: "MEDIUM", assignedToId: associate.id });

    const list = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    const notificationId = list.body[0].id;

    const res = await request(app).patch(`/api/notifications/${notificationId}/read`).set("Authorization", `Bearer ${partnerToken}`);
    expect(res.status).toBe(404);
  });
});
