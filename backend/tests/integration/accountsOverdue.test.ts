import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createUser, createClient, createCase, createProfessionalFee, createAccountsPayment, tokenForUser } from "../helpers/fixtures";

/**
 * ACCOUNTS module (2026-08-14) — §5/§6/§7/§8/§13 worked examples, verbatim from the
 * Managing Partner's spec. Managing Partner always holds ACCOUNTS.VIEW by default
 * (core-admin), so these use an MP token throughout.
 */

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Overdue/Due Soon are no longer dashboard cards (Accounts Overview completion
 * pass, 2026-08-15, §1) — Overdue now lives only inside dashboard.breakdown
 * (feeding Profit internally, never displayed as its own card) and Due Soon only
 * via its own unmodified GET /accounts/due-soon drill-down list. Both are asserted
 * directly below rather than against the removed top-level dashboard.body.overdue/
 * dueSoon fields; the underlying isOverdue/isDueSoon math itself (accountsQueries.ts)
 * is completely untouched by that pass.
 */
describe("Accounts Overdue/Due Soon — §5 worked example (before vs. after due date)", () => {
  it("Fee 100,000 due in 30 days, no payments: Outstanding=100000, Overdue=0, DueSoon=0 (outside the 7-day window)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 100_000, dueDate: daysFromNow(30) });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(100_000);
    expect(dashboard.body.breakdown.overdue).toBe(0);
    const dueSoon = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoon.body).toHaveLength(0);
  });

  it("Fee 100,000 due in 3 days, no payments: appears in Due Soon, not Overdue", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 100_000, dueDate: daysFromNow(3) });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(100_000);
    expect(dashboard.body.breakdown.overdue).toBe(0);
    const dueSoon = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoon.body).toHaveLength(1);
    expect(dueSoon.body[0].outstanding).toBe(100_000);
  });

  it("Fee 100,000 with a due date 1 day in the past, no payments: Outstanding=100000, Overdue=100000, DueSoon=0", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 100_000, dueDate: daysFromNow(-1) });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(100_000);
    expect(dashboard.body.breakdown.overdue).toBe(100_000);
    const dueSoon = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoon.body).toHaveLength(0);
  });

  it("a fee with no due date at all is never overdue or due-soon, regardless of payment state", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 50_000, dueDate: null });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(50_000);
    expect(dashboard.body.breakdown.overdue).toBe(0);
    const dueSoon = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoon.body).toHaveLength(0);
  });
});

describe("Accounts Overdue — §13 worked example (partial payments only leave the remainder overdue)", () => {
  it("Fee 100,000, payments 10k+20k+15k=45k, due date passed: Overdue=55000, never the original 100000", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 100_000, dueDate: daysFromNow(-1) });
    await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 10_000 });
    await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 20_000 });
    await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 15_000 });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(55_000);
    expect(dashboard.body.breakdown.overdue).toBe(55_000);
    expect(dashboard.body.received).toBe(45_000);
  });

  it("a fully-paid fee (outstanding=0) past its due date is never counted as overdue", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 50_000, dueDate: daysFromNow(-5) });
    await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 50_000 });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.outstanding).toBe(0);
    expect(dashboard.body.breakdown.overdue).toBe(0);
  });

  it("Overdue and Due Soon are mutually exclusive for the same fee — never both true", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 10_000, dueDate: daysFromNow(-1) });
    await createProfessionalFee(client.id, partner.id, { amount: 20_000, dueDate: daysFromNow(3) });
    await createProfessionalFee(client.id, partner.id, { amount: 30_000, dueDate: daysFromNow(30) });

    const overdue = await request(app).get("/api/accounts/overdue").set("Authorization", `Bearer ${token}`);
    const dueSoon = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    const overdueIds = new Set(overdue.body.map((r: { feeId: string }) => r.feeId));
    const dueSoonIds = new Set(dueSoon.body.map((r: { feeId: string }) => r.feeId));
    for (const id of overdueIds) expect(dueSoonIds.has(id)).toBe(false);
    expect(overdue.body).toHaveLength(1);
    expect(dueSoon.body).toHaveLength(1);
  });
});

describe("Accounts §7 — per-client Overdue Total excludes a not-yet-due second case", () => {
  it("Client A: Case 1 overdue 50,000, Case 2 outstanding 30,000 but not yet due — the client's Overdue Total is only 50,000", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient("Client A");
    const case1 = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const case2 = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    await createProfessionalFee(client.id, partner.id, { caseId: case1.id, amount: 50_000, dueDate: daysFromNow(-2) });
    await createProfessionalFee(client.id, partner.id, { caseId: case2.id, amount: 30_000, dueDate: daysFromNow(60) });

    const summary = await request(app).get(`/api/accounts/clients/${client.id}/summary`).set("Authorization", `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.totalOverdue).toBe(50_000);
    expect(summary.body.summary.totalOutstanding).toBe(80_000);

    const case1Row = summary.body.cases.find((c: { caseId: string }) => c.caseId === case1.id);
    const case2Row = summary.body.cases.find((c: { caseId: string }) => c.caseId === case2.id);
    expect(case1Row.overdue).toBe(50_000);
    expect(case2Row.overdue).toBe(0);
  });
});

describe("Accounts §15/§16 — client-level and case-level-unallocated payments never reduce a fee's outstanding", () => {
  it("a client-level payment (no case) counts in Received but not in Outstanding for any fee", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { amount: 20_000, dueDate: daysFromNow(10) });
    await createAccountsPayment(client.id, partner.id, { amount: 5_000 }); // client-level, no case, no fee

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.received).toBe(5_000);
    expect(dashboard.body.outstanding).toBe(20_000); // unaffected by the unallocated payment
  });

  it("a case-level payment not linked to a specific fee counts toward the case's total received but not that fee's outstanding", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { caseId: testCase.id, amount: 40_000, dueDate: daysFromNow(10) });
    await createAccountsPayment(client.id, partner.id, { caseId: testCase.id, amount: 15_000 }); // case-level, no feeId

    const caseData = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseData.status).toBe(200);
    // Total Received counts every payment against the case (§16), including one not
    // linked to a specific fee — but Outstanding is untouched, since only fee-linked
    // payments ever reduce a fee's outstanding (§15's structural guarantee).
    expect(caseData.body.financialSummary.totalReceived).toBe(15_000);
    expect(caseData.body.financialSummary.outstanding).toBe(40_000);
    expect(caseData.body.payments).toHaveLength(1);
    expect(caseData.body.payments[0].amount).toBe(15_000);
  });
});
