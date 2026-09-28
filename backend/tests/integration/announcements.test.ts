import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, tokenForUser } from "../helpers/fixtures";
import { isWithinDateWindow } from "../../src/modules/announcements/announcements.service";

/**
 * Office Announcements communication-system pass (2026-08-12), simplified by the
 * Announcements simplification pass (2026-08-13, direct Managing Partner instruction):
 * priority/audience/selectedUserIds/startDate/expiryDate are no longer accepted from
 * the caller — every announcement is now unconditionally EVERYONE-audience/
 * NORMAL-priority with no date window, enforced in the service layer. Complements the
 * five pre-existing create/draft/publish/permission tests in adminCustomization.test.ts
 * (left untouched — still valid, unmodified in spirit by this pass) with coverage for
 * notification fan-out, read tracking, and the 24-hour auto-expiry.
 */
describe("Announcements — communication system (2026-08-12, simplified 2026-08-13)", () => {
  it("fans out a Notification to every active staff member except the poster", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const officeStaff = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Firm-wide notice", body: "Everyone should see this." });
    expect(created.status).toBe(201);

    const associateNotifs = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    expect(associateNotifs.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(true);

    const staffNotifs = await request(app).get("/api/notifications").set("Authorization", `Bearer ${officeStaffToken}`);
    expect(staffNotifs.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(true);

    // The poster does not notify themselves.
    const partnerNotifs = await request(app).get("/api/notifications").set("Authorization", `Bearer ${partnerToken}`);
    expect(partnerNotifs.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(false);
  });

  it("ignores priority/audience/selectedUserIds/startDate/expiryDate if a caller sends them — every announcement is EVERYONE/NORMAL with no date window", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        title: "Urgent notice",
        body: "...",
        priority: "CRITICAL",
        audience: "MANAGING_PARTNER",
        selectedUserIds: [partner.id],
        startDate: "2099-01-01T00:00:00.000Z",
        expiryDate: "2020-01-01T00:00:00.000Z",
      });
    expect(created.status).toBe(201);
    expect(created.body.priority).toBe("NORMAL");
    expect(created.body.audience).toBe("EVERYONE");
    expect(created.body.startDate).toBeNull();
    expect(created.body.expiryDate).toBeNull();

    // Reaches every active staff member (EVERYONE), not just the Managing Partner
    // that a targeted audience would have implied, and isn't hidden by the future
    // startDate / past expiryDate that were sent but ignored.
    const associateNotifs = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    expect(associateNotifs.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(true);

    const associateList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${associateToken}`);
    expect(associateList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(true);
  });

  it("does not notify anyone for an Office Staff draft until the Managing Partner publishes it", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const otherStaff = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const otherStaffToken = await tokenForUser(otherStaff.id, "OFFICE_STAFF");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ title: "Draft item", body: "..." });
    expect(created.status).toBe(201);
    expect(created.body.isActive).toBe(false);

    const beforePublish = await request(app).get("/api/notifications").set("Authorization", `Bearer ${otherStaffToken}`);
    expect(beforePublish.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(false);

    const publish = await request(app)
      .patch(`/api/announcements/${created.body.id}/active`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ isActive: true });
    expect(publish.status).toBe(200);

    const afterPublish = await request(app).get("/api/notifications").set("Authorization", `Bearer ${otherStaffToken}`);
    expect(afterPublish.body.some((n: { entityId: string }) => n.entityId === created.body.id)).toBe(true);
  });

  it("GET /:id returns the announcement to any firm user (recipient) and the Managing Partner, but 404s for a non-recipient (unpublished draft)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const published = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "For everyone", body: "..." });

    const recipientGet = await request(app).get(`/api/announcements/${published.body.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(recipientGet.status).toBe(200);
    expect(recipientGet.body.title).toBe("For everyone");

    const mpGet = await request(app).get(`/api/announcements/${published.body.id}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(mpGet.status).toBe(200);

    const draft = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ title: "Unpublished draft", body: "..." });

    const outsiderGet = await request(app).get(`/api/announcements/${draft.body.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(outsiderGet.status).toBe(404);
  });

  it("PATCH /:id/read marks the actor's own notification read with a timestamp, and is a no-op for a non-recipient", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const officeStaff = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Read me", body: "..." });

    // A recipient who never received this announcement (created before this staff
    // member existed) is a no-op — but every current active staff member IS a
    // recipient (EVERYONE audience), so use a freshly-deleted notification instead.
    await prisma.notification.deleteMany({ where: { userId: officeStaff.id, entityId: created.body.id } });
    const noopMark = await request(app).patch(`/api/announcements/${created.body.id}/read`).set("Authorization", `Bearer ${officeStaffToken}`);
    expect(noopMark.status).toBe(204);

    const beforeRead = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    const notifBefore = beforeRead.body.find((n: { entityId: string }) => n.entityId === created.body.id);
    expect(notifBefore.isRead).toBe(false);

    const markRead = await request(app).patch(`/api/announcements/${created.body.id}/read`).set("Authorization", `Bearer ${associateToken}`);
    expect(markRead.status).toBe(204);

    const afterRead = await request(app).get("/api/notifications").set("Authorization", `Bearer ${associateToken}`);
    const notifAfter = afterRead.body.find((n: { entityId: string }) => n.entityId === created.body.id);
    expect(notifAfter.isRead).toBe(true);
    expect(notifAfter.readAt).toBeTruthy();
  });

  it("read tracking is Managing-Partner-only and reports correct totals/read/unread lists", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const reader = await createUser("ASSOCIATE");
    const unread = await createUser("OFFICE_STAFF");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const readerToken = await tokenForUser(reader.id, "ASSOCIATE");
    const unreadToken = await tokenForUser(unread.id, "OFFICE_STAFF");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Track me", body: "..." });

    const forbidden = await request(app).get(`/api/announcements/${created.body.id}/read-tracking`).set("Authorization", `Bearer ${unreadToken}`);
    expect(forbidden.status).toBe(403);

    await request(app).patch(`/api/announcements/${created.body.id}/read`).set("Authorization", `Bearer ${readerToken}`);

    const tracking = await request(app).get(`/api/announcements/${created.body.id}/read-tracking`).set("Authorization", `Bearer ${partnerToken}`);
    expect(tracking.status).toBe(200);
    expect(tracking.body.readCount).toBeGreaterThanOrEqual(1);
    expect(tracking.body.readUsers.some((u: { id: string }) => u.id === reader.id)).toBe(true);
    expect(tracking.body.readUsers[0].readAt).toBeTruthy();
    expect(tracking.body.unreadUsers.some((u: { id: string }) => u.id === unread.id)).toBe(true);
  });
});

/** 24-hour Dashboard auto-expiry pass (2026-08-12), unchanged by the 2026-08-13
 * simplification — every new announcement is created with `startDate`/`expiryDate`
 * null, so its effective expiry is always exactly `createdAt + 24h` (never narrower,
 * never wider). The `isWithinDateWindow` unit tests below still exercise the general
 * function (also relied on for historical announcements that do carry real
 * startDate/expiryDate values from before this pass). */
describe("Announcements — 24-hour Dashboard auto-expiry (2026-08-12)", () => {
  const HOUR = 60 * 60 * 1000;

  it("isWithinDateWindow: true just under 24h old, false just over", () => {
    const createdAt = new Date("2026-08-12T00:00:00.000Z");
    const justUnder = new Date(createdAt.getTime() + 24 * HOUR - 1000);
    const justOver = new Date(createdAt.getTime() + 24 * HOUR + 1000);
    expect(isWithinDateWindow(justUnder, createdAt, null, null)).toBe(true);
    expect(isWithinDateWindow(justOver, createdAt, null, null)).toBe(false);
  });

  it("isWithinDateWindow: an explicit Expiry Date beyond 24h from posting is capped at 24h, never extended", () => {
    const createdAt = new Date("2026-08-12T00:00:00.000Z");
    const oneWeekExpiry = new Date(createdAt.getTime() + 7 * 24 * HOUR);
    const twentyFiveHoursLater = new Date(createdAt.getTime() + 25 * HOUR);
    // Explicit expiry is a week away, but the 24h ceiling still applies.
    expect(isWithinDateWindow(twentyFiveHoursLater, createdAt, null, oneWeekExpiry)).toBe(false);
  });

  it("isWithinDateWindow: an explicit Expiry Date sooner than 24h still narrows the window as before", () => {
    const createdAt = new Date("2026-08-12T00:00:00.000Z");
    const oneHourExpiry = new Date(createdAt.getTime() + 1 * HOUR);
    const twoHoursLater = new Date(createdAt.getTime() + 2 * HOUR);
    expect(isWithinDateWindow(twoHoursLater, createdAt, null, oneHourExpiry)).toBe(false);
  });

  it("an announcement older than 24 hours is excluded from a non-MP's Dashboard list, but still visible (isEffectivelyActive: false) to the Managing Partner", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Yesterday's notice", body: "..." });
    expect(created.status).toBe(201);

    // Backdate createdAt to 25 hours ago — the only way to simulate elapsed time
    // against a server-computed timestamp without a fake-timers dependency this
    // codebase doesn't otherwise use.
    await prisma.announcement.update({
      where: { id: created.body.id },
      data: { createdAt: new Date(Date.now() - 25 * HOUR) },
    });

    const associateList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${associateToken}`);
    expect(associateList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(false);

    const partnerList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${partnerToken}`);
    const mine = partnerList.body.find((a: { id: string }) => a.id === created.body.id);
    expect(mine).toBeTruthy();
    expect(mine.isEffectivelyActive).toBe(false);
  });

  it("an announcement posted less than 24 hours ago is still visible to everyone", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ title: "Fresh notice", body: "..." });
    expect(created.status).toBe(201);

    await prisma.announcement.update({
      where: { id: created.body.id },
      data: { createdAt: new Date(Date.now() - 23 * HOUR) },
    });

    const associateList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${associateToken}`);
    expect(associateList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(true);
  });

  it("the 24-hour ceiling still applies to an Office Staff announcement measured from its original creation time, not from when it was later published", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const officeStaff = await createUser("OFFICE_STAFF");
    const associate = await createUser("ASSOCIATE");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const officeStaffToken = await tokenForUser(officeStaff.id, "OFFICE_STAFF");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const created = await request(app)
      .post("/api/announcements")
      .set("Authorization", `Bearer ${officeStaffToken}`)
      .send({ title: "Old draft", body: "..." });
    expect(created.body.isActive).toBe(false);

    await prisma.announcement.update({
      where: { id: created.body.id },
      data: { createdAt: new Date(Date.now() - 25 * HOUR) },
    });

    const publish = await request(app)
      .patch(`/api/announcements/${created.body.id}/active`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ isActive: true });
    expect(publish.status).toBe(200);

    const associateList = await request(app).get("/api/announcements").set("Authorization", `Bearer ${associateToken}`);
    expect(associateList.body.some((a: { id: string }) => a.id === created.body.id)).toBe(false);
  });
});
