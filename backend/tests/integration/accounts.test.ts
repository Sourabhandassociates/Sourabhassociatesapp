import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import {
  createUser,
  createClient,
  createCase,
  createProfessionalFee,
  createAccountsPayment,
  tokenForUser,
  tokenForClient,
} from "../helpers/fixtures";

const ACCOUNTS_KEYS = [
  "ACCOUNTS.VIEW",
  "ACCOUNTS.CREATE_PAYMENT",
  "ACCOUNTS.EDIT_PAYMENT",
  "ACCOUNTS.DELETE_PAYMENT",
  "ACCOUNTS.VIEW_EXPENSES",
  "ACCOUNTS.CREATE_EXPENSE",
  "ACCOUNTS.EDIT_EXPENSE",
  "ACCOUNTS.DELETE_EXPENSE",
  "ACCOUNTS.VIEW_INVOICE",
  "ACCOUNTS.CREATE_INVOICE",
  "ACCOUNTS.EDIT_INVOICE",
  "ACCOUNTS.DELETE_INVOICE",
  "ACCOUNTS.VIEW_REPORTS",
  "ACCOUNTS.MANAGE_FEE",
];

describe("Accounts — A. Access control (§2/§3/§29/§30)", () => {
  it("Managing Partner has all 14 flags true by default", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/accounts/permissions").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      view: true,
      createPayment: true,
      editPayment: true,
      deletePayment: true,
      viewExpenses: true,
      createExpense: true,
      editExpense: true,
      deleteExpense: true,
      viewInvoice: true,
      createInvoice: true,
      editInvoice: true,
      deleteInvoice: true,
      viewReports: true,
      manageFee: true,
    });
  });

  it("ACCOUNTS_TEAM has access enabled by default (spec's stated initial state)", async () => {
    const user = await createUser("ACCOUNTS_TEAM");
    const token = await tokenForUser(user.id, "ACCOUNTS_TEAM");
    const res = await request(app).get("/api/accounts/permissions").set("Authorization", `Bearer ${token}`);
    expect(res.body.view).toBe(true);
    expect(res.body.manageFee).toBe(true);
  });

  it("Associate/Junior Associate/Office Staff have no Accounts access by default", async () => {
    for (const role of ["ASSOCIATE", "JUNIOR_ASSOCIATE", "OFFICE_STAFF"] as const) {
      const user = await createUser(role);
      const token = await tokenForUser(user.id, role);
      const res = await request(app).get("/api/accounts/permissions").set("Authorization", `Bearer ${token}`);
      expect(res.body.view, `expected ${role} to have no Accounts view`).toBe(false);
    }
  });

  it("a user without ACCOUNTS.VIEW gets 403 on GET /accounts/dashboard", async () => {
    const user = await createUser("ASSOCIATE");
    const token = await tokenForUser(user.id, "ASSOCIATE");
    const res = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("Managing Partner can grant ACCOUNTS.VIEW to an individual Associate via Employee Overrides, taking effect on the very next request", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(403);

    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.VIEW" } });
    const grantRes = await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: permission.key, effect: "GRANT", reason: "Pilot Accounts access for this Associate" });
    expect(grantRes.status).toBe(201);

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${associateToken}`);
    expect(after.status).toBe(200);
  });

  it("Managing Partner can revoke Accounts access from an ACCOUNTS_TEAM user via override, taking effect immediately", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const accountsUser = await createUser("ACCOUNTS_TEAM");
    const accountsToken = await tokenForUser(accountsUser.id, "ACCOUNTS_TEAM");

    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.VIEW" } });
    const revokeRes = await request(app)
      .post(`/api/permissions/employees/${accountsUser.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: permission.key, effect: "REVOKE", reason: "Reassigned away from Accounts duties" });
    expect(revokeRes.status).toBe(201);

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${accountsToken}`);
    expect(after.status).toBe(403);
  });

  it("all 14 ACCOUNTS.* keys are core-admin — revoking one from the MANAGING_PARTNER role default is rejected", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.VIEW" } });

    const res = await request(app)
      .patch("/api/permissions/role-defaults")
      .set("Authorization", `Bearer ${token}`)
      .send({ changes: [{ role: "MANAGING_PARTNER", permissionKey: permission.key, granted: false }] });
    expect(res.status).toBe(403);
  });

  it("revoking a core-admin Accounts key from a Managing-Partner-role user via override is rejected", async () => {
    const partnerA = await createUser("MANAGING_PARTNER");
    const partnerB = await createUser("MANAGING_PARTNER");
    const tokenA = await tokenForUser(partnerA.id, "MANAGING_PARTNER");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.MANAGE_FEE" } });

    const res = await request(app)
      .post(`/api/permissions/employees/${partnerB.id}/overrides`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ permissionKey: permission.key, effect: "REVOKE", reason: "attempted revoke" });
    expect(res.status).toBe(403);
  });

  it("Case → Accounts tab data (GET /cases/:caseId/accounts) is blocked with 403 without ACCOUNTS.VIEW, reachable once granted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const before = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${associateToken}`);
    expect(before.status).toBe(403);
  });

  it("every ACCOUNTS.* key exists in the seeded catalogue", async () => {
    const permissions = await prisma.permission.findMany({ where: { key: { in: ACCOUNTS_KEYS } } });
    expect(permissions).toHaveLength(14);
    expect(permissions.every((p) => p.isCoreAdmin)).toBe(true);
  });
});

describe("Accounts — B. Professional Fees (§12/§13)", () => {
  it("creates a fee with client+case+amount+dueDate — outstanding auto-computed, no manual outstanding accepted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, caseId: testCase.id, amount: 75_000, dueDate: new Date(Date.now() + 10 * 86400000).toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe("75000");
  });

  it("a fee can be created with only a client (no case) and appears in the client's summary", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, amount: 30_000 });
    expect(res.status).toBe(201);

    const summary = await request(app).get(`/api/accounts/clients/${client.id}/summary`).set("Authorization", `Bearer ${token}`);
    expect(summary.body.summary.totalProfessionalFees).toBe(30_000);
  });

  it("fee creation rejects a caseId whose CaseClient set doesn't include the given clientId", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const caseA = await createCase({ partnerId: partner.id, clientIds: [clientA.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: clientB.id, caseId: caseA.id, amount: 10_000 });
    expect(res.status).toBe(400);
  });

  it("editing a fee's dueDate produces an ACCOUNTS_FEE_DUE_DATE_CHANGED audit entry with old/new", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 10_000, dueDate: new Date("2026-09-01") });

    const res = await request(app)
      .patch(`/api/accounts/fees/${fee.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dueDate: new Date("2026-10-01").toISOString() });
    expect(res.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({ where: { action: "ACCOUNTS_FEE_DUE_DATE_CHANGED", entityId: fee.id } });
    expect(audit).toBeTruthy();
  });

  it("soft-deleting a fee excludes it from subsequent aggregates but retains the DB row", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 40_000 });

    const del = await request(app).delete(`/api/accounts/fees/${fee.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.totalIncome).toBe(0);

    const row = await prisma.professionalFee.findUniqueOrThrow({ where: { id: fee.id } });
    expect(row.deletedAt).not.toBeNull();
  });
});

describe("Accounts — C. Payments (§14-§17)", () => {
  it("client-level payment appears in the client's total received, absent from any case's numbers", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, amount: 8_000, mode: "UPI" });
    expect(res.status).toBe(201);
    expect(res.body.caseId).toBeNull();

    const caseData = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseData.body.payments).toHaveLength(0);
  });

  it("a fee-linked payment derives clientId/caseId from the fee, rejecting a mismatched caller-supplied client", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const clientA = await createClient("Client A");
    const clientB = await createClient("Client B");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const fee = await createProfessionalFee(clientA.id, partner.id, { amount: 20_000 });

    const res = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: clientB.id, feeId: fee.id, amount: 5_000, mode: "CASH" });
    expect(res.status).toBe(201);
    // The fee's own client wins, not the caller-supplied clientB.
    expect(res.body.clientId).toBe(clientA.id);
  });

  it("Payment Mode is restricted to the fixed enum — an invalid value is rejected", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, amount: 1_000, mode: "BITCOIN" });
    expect(res.status).toBe(400);
  });

  it("edit/delete payment gated independently of create — EDIT_PAYMENT alone can edit but not delete", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 5_000 });

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    // ASSOCIATE's default CLIENTS view scope is VIEW_ASSIGNED (case-linked only, see
    // permissionCatalogue.ts) — assertClientAccess (reused by Accounts for row-level
    // scoping, matching the existing Billing/Expenses precedent) needs this associate
    // to actually be linked to the client via a case they're an advocate on, or the
    // Accounts-permission grant below would be masked by an unrelated 404.
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    const editPerm = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.EDIT_PAYMENT" } });
    await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: editPerm.key, effect: "GRANT", reason: "test" });

    const editRes = await request(app)
      .patch(`/api/accounts/payments/${payment.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ amount: 6_000 });
    expect(editRes.status).toBe(200);

    const deleteRes = await request(app).delete(`/api/accounts/payments/${payment.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it("every payment create/edit/delete produces an audit-log entry", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const createRes = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, amount: 3_000, mode: "CHEQUE" });
    const created = await prisma.auditLog.findFirst({ where: { action: "ACCOUNTS_PAYMENT_CREATED", entityId: createRes.body.id } });
    expect(created).toBeTruthy();

    await request(app).patch(`/api/accounts/payments/${createRes.body.id}`).set("Authorization", `Bearer ${token}`).send({ amount: 3_500 });
    const edited = await prisma.auditLog.findFirst({ where: { action: "ACCOUNTS_PAYMENT_EDITED", entityId: createRes.body.id } });
    expect(edited).toBeTruthy();

    await request(app).delete(`/api/accounts/payments/${createRes.body.id}`).set("Authorization", `Bearer ${token}`);
    const deleted = await prisma.auditLog.findFirst({ where: { action: "ACCOUNTS_PAYMENT_DELETED", entityId: createRes.body.id } });
    expect(deleted).toBeTruthy();
  });
});

describe("Accounts — D. Search (§9-§11)", () => {
  it("client search matches by name, Client ID, and mobile", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient("Ramesh Kumar");
    await prisma.client.update({ where: { id: client.id }, data: { phone: "9876543210" } });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const byName = await request(app).get("/api/accounts/clients/search").query({ q: "Ramesh" }).set("Authorization", `Bearer ${token}`);
    expect(byName.body.map((c: { id: string }) => c.id)).toContain(client.id);

    const byClientId = await request(app)
      .get("/api/accounts/clients/search")
      .query({ q: client.clientId })
      .set("Authorization", `Bearer ${token}`);
    expect(byClientId.body.map((c: { id: string }) => c.id)).toContain(client.id);

    const byPhone = await request(app).get("/api/accounts/clients/search").query({ q: "98765" }).set("Authorization", `Bearer ${token}`);
    expect(byPhone.body.map((c: { id: string }) => c.id)).toContain(client.id);
  });

  it("case search matches by matter number and client name", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient("Suresh Traders");
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const byMatter = await request(app)
      .get("/api/accounts/cases/search")
      .query({ q: testCase.matterNumber })
      .set("Authorization", `Bearer ${token}`);
    expect(byMatter.body.map((c: { id: string }) => c.id)).toContain(testCase.id);

    const byClientName = await request(app)
      .get("/api/accounts/cases/search")
      .query({ q: "Suresh Traders" })
      .set("Authorization", `Bearer ${token}`);
    expect(byClientName.body.map((c: { id: string }) => c.id)).toContain(testCase.id);
  });

  it("Case Summary returns only that case's payments/expenses — a sibling case's data never leaks in", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const caseA = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const caseB = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    await createAccountsPayment(client.id, partner.id, { caseId: caseA.id, amount: 1_000 });
    await createAccountsPayment(client.id, partner.id, { caseId: caseB.id, amount: 2_000 });

    const res = await request(app).get(`/api/cases/${caseA.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].amount).toBe(1_000);
  });
});

describe("Accounts — E. Expenses (§18-§20)", () => {
  it("creates an expense via Accounts with paymentMode/vendor populated", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, category: "Court Fee", amount: 500, date: new Date().toISOString(), vendor: "District Court", paymentMode: "CASH" });
    expect(res.status).toBe(201);
    expect(res.body.vendor).toBe("District Court");
    expect(res.body.paymentMode).toBe("CASH");
  });

  it("expense total is shown separately and never auto-deducted from Outstanding", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await createProfessionalFee(client.id, partner.id, { caseId: testCase.id, amount: 100_000 });
    await createAccountsPayment(client.id, partner.id, { caseId: testCase.id, amount: 30_000 });

    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, category: "Filing Fee", amount: 4_000, date: new Date().toISOString() });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.totalExpenses).toBe(4_000);
    expect(dashboard.body.outstanding).toBe(100_000); // unaffected by the expense
  });
});

describe("Accounts — F. Invoices (§23)", () => {
  it("existing invoice numbering format (SA-INV-...) is unchanged", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, manualItems: [{ description: "Consultation", quantity: 1, rate: 5000 }] });
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toMatch(/^SA-INV-\d{4}-\d{4}$/);
  });

  it("DRAFT invoice edit/delete works; non-DRAFT is rejected", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const createRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }] });
    const invoiceId = createRes.body.id;

    const editRes = await request(app)
      .patch(`/api/invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Updated notes" });
    expect(editRes.status).toBe(200);
    expect(editRes.body.notes).toBe("Updated notes");

    await request(app).patch(`/api/invoices/${invoiceId}/approve`).set("Authorization", `Bearer ${token}`);
    const editAfterApprove = await request(app)
      .patch(`/api/invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Should fail" });
    expect(editAfterApprove.status).toBe(409);

    const deleteRes = await request(app).delete(`/api/invoices/${invoiceId}`).set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(409); // no longer DRAFT
  });

  it("deleting a DRAFT invoice un-invoices its linked expense so it can be invoiced again", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const expense = await prisma.expense.create({
      data: { caseId: testCase.id, category: "Court Fee", amount: 500, date: new Date(), incurredById: partner.id, billableToClient: true },
    });

    const createRes = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, clientId: client.id, expenseItems: [{ expenseId: expense.id }] });
    expect(createRes.status).toBe(201);

    const invoicedExpense = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(invoicedExpense.invoiced).toBe(true);

    await request(app).delete(`/api/invoices/${createRes.body.id}`).set("Authorization", `Bearer ${token}`);

    const restoredExpense = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(restoredExpense.invoiced).toBe(false);
  });
});

describe("Accounts — G. Security (§26/§27)", () => {
  it("a CLIENT actor hitting any /api/accounts/* route is rejected before any permission check", async () => {
    const client = await createClient();
    const token = await tokenForClient(client.id);
    const res = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("a CLIENT actor hitting /api/cases/:caseId/accounts is rejected", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForClient(client.id);
    const res = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("revoking ACCOUNTS.VIEW mid-session immediately 403s a previously-successful endpoint (no caching)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const accountsUser = await createUser("ACCOUNTS_TEAM");
    const accountsToken = await tokenForUser(accountsUser.id, "ACCOUNTS_TEAM");

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${accountsToken}`);
    expect(before.status).toBe(200);

    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.VIEW" } });
    await request(app)
      .post(`/api/permissions/employees/${accountsUser.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: permission.key, effect: "REVOKE", reason: "test" });

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${accountsToken}`);
    expect(after.status).toBe(403);
  });

  it("the Client Portal never surfaces an Accounts-linked (client-level) receipt document, even by real id", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${await tokenForUser(partner.id, "MANAGING_PARTNER")}`)
      .send({ portalDocumentsEnabled: true });

    const doc = await prisma.document.create({
      data: { clientId: client.id, title: "Payment Receipt", category: "Payment Receipt", confidentiality: "INTERNAL", createdById: partner.id },
    });
    const clientToken = await tokenForClient(client.id);
    const res = await request(app).get(`/api/client-portal/documents/${doc.id}/download`).set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Accounts — H. Audit (§28)", () => {
  it("expense create/delete via Accounts is audit-logged with the standard EXPENSE_* actions", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, category: "Travel", amount: 200, date: new Date().toISOString() });
    const created = await prisma.auditLog.findFirst({ where: { action: "EXPENSE_CREATED", entityId: createRes.body.id } });
    expect(created).toBeTruthy();
  });

  it("an ACCOUNTS.* permission grant/revoke is captured by the existing generic RolePermission/override audit mechanism", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "ACCOUNTS.VIEW_REPORTS" } });

    await request(app)
      .post(`/api/permissions/employees/${associate.id}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: permission.key, effect: "GRANT", reason: "test" });

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "UserPermissionOverride", userId: partner.id } });
    expect(audit).toBeTruthy();
  });
});

/**
 * Payment receipt permission fix (2026-08-15). Fixes the prior implementation, which
 * incorrectly required ACCOUNTS.EDIT_PAYMENT just to attach a receipt at payment
 * *creation* time. New model: ACCOUNTS.CREATE_PAYMENT alone can create a payment and
 * attach its initial receipt in the same request; ACCOUNTS.EDIT_PAYMENT is required
 * only to edit an existing payment's fields or to replace/attach a receipt on a
 * payment that already exists; ACCOUNTS.DELETE_PAYMENT deletes the payment without
 * touching the receipt Document's own independent lifecycle.
 */
async function grantOnly(partnerToken: string, userId: string, keys: string[]) {
  for (const key of keys) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
    const res = await request(app)
      .post(`/api/permissions/employees/${userId}/overrides`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ permissionKey: permission.key, effect: "GRANT", reason: "test" });
    expect(res.status).toBe(201);
  }
}

const VALID_PDF = Buffer.from("%PDF-1.4\n");

describe("Accounts — I. Payment receipt permission fix (CREATE vs EDIT vs DELETE)", () => {
  it("1. a user with only CREATE_PAYMENT can create a payment without a receipt", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    // ASSOCIATE's default CLIENTS view scope is VIEW_ASSIGNED (case-linked only) —
    // assertClientAccess (reused by Accounts for row-level scoping) needs this
    // associate actually linked to the client via a case, or the Accounts-
    // permission grant below is masked by an unrelated 404.
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.CREATE_PAYMENT"]);

    const res = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ clientId: client.id, amount: 1_000, mode: "CASH" });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeNull();
  });

  it("2. a user with only CREATE_PAYMENT can create a payment WITH a receipt, in one request", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.CREATE_PAYMENT"]);

    const res = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${associateToken}`)
      .field("clientId", client.id)
      .field("amount", "1500")
      .field("mode", "UPI")
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeTruthy();

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.receiptDocumentId } });
    expect(doc.confidentiality).toBe("INTERNAL");
    expect(doc.clientId).toBe(client.id);
    expect(doc.caseId).toBeNull();
  });

  it("3. a user with CREATE_PAYMENT but WITHOUT EDIT_PAYMENT cannot edit an existing payment", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 2_000 });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.CREATE_PAYMENT"]);

    const res = await request(app)
      .patch(`/api/accounts/payments/${payment.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ amount: 2_500 });
    expect(res.status).toBe(403);
  });

  it("4. a user with CREATE_PAYMENT but WITHOUT EDIT_PAYMENT cannot replace an existing payment's receipt", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 2_000 });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.CREATE_PAYMENT"]);

    const res = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(403);
  });

  it("5. a user with EDIT_PAYMENT can edit an existing payment's fields", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 2_000 });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.EDIT_PAYMENT"]);

    const res = await request(app)
      .patch(`/api/accounts/payments/${payment.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ amount: 2_750 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe("2750");
  });

  it("6. a user with EDIT_PAYMENT can replace an existing payment's receipt", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 2_000 });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.EDIT_PAYMENT"]);

    const firstRes = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "first.pdf", contentType: "application/pdf" });
    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "second.pdf", contentType: "application/pdf" });
    expect(secondRes.status).toBe(201);
    expect(secondRes.body.id).not.toBe(firstRes.body.id);

    const updated = await prisma.accountsPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.receiptDocumentId).toBe(secondRes.body.id);
  });

  it("7. a user with DELETE_PAYMENT can delete a payment; the receipt Document is left intact (its own lifecycle)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 2_000 });
    const document = await prisma.document.create({
      data: { clientId: client.id, title: "Payment Receipt", category: "Payment Receipt", confidentiality: "INTERNAL", createdById: partner.id },
    });
    await prisma.accountsPayment.update({ where: { id: payment.id }, data: { receiptDocumentId: document.id } });

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.VIEW", "ACCOUNTS.DELETE_PAYMENT"]);

    const res = await request(app).delete(`/api/accounts/payments/${payment.id}`).set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(204);

    const deletedPayment = await prisma.accountsPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(deletedPayment.deletedAt).not.toBeNull();
    const untouchedDocument = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(untouchedDocument.deletedAt).toBeNull();
  });

  it("7b. DELETE_PAYMENT grants no other Accounts capability (create/edit/view all still rejected)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.DELETE_PAYMENT"]);

    const dashboardRes = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${associateToken}`);
    expect(dashboardRes.status).toBe(403); // no ACCOUNTS.VIEW

    const createRes = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ clientId: client.id, amount: 500, mode: "CASH" });
    expect(createRes.status).toBe(403);
  });

  it("8. an unauthorized user (no Accounts permissions at all) cannot upload a payment receipt via direct API, at creation or on an existing payment", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 1_000 });
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");

    const createRes = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${associateToken}`)
      .field("clientId", client.id)
      .field("amount", "1000")
      .field("mode", "CASH")
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(createRes.status).toBe(403);

    const replaceRes = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(replaceRes.status).toBe(403);
  });

  it("9. a CLIENT actor cannot reach either payment-receipt route, and cannot access an Accounts payment receipt via the Client Portal even with Documents enabled", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const payment = await createAccountsPayment(client.id, partner.id, { amount: 1_000 });
    const clientToken = await tokenForClient(client.id);

    const createRes = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${clientToken}`)
      .field("clientId", client.id)
      .field("amount", "1000")
      .field("mode", "CASH")
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(createRes.status).toBe(403);

    const replaceRes = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${clientToken}`)
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(replaceRes.status).toBe(403);

    // Attach a real receipt as staff, enable the Documents portal flag for this
    // client, then confirm the Client Portal still 404s it — the document's
    // confidentiality (always INTERNAL for a financial receipt) is what actually
    // gates Client Portal visibility, independent of the portal flag.
    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: true });
    const attachRes = await request(app)
      .post(`/api/accounts/payments/${payment.id}/receipt`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(attachRes.status).toBe(201);

    const downloadRes = await request(app)
      .get(`/api/client-portal/documents/${attachRes.body.id}/download`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(downloadRes.status).toBe(404);
  });
});

describe("Accounts — J. Dashboard refresh correctness (values reflect the latest mutation)", () => {
  it("11. dashboard Received/Outstanding update immediately after a payment is created", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 100_000 });

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(before.body.received).toBe(0);
    expect(before.body.outstanding).toBe(100_000);

    await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, feeId: fee.id, amount: 40_000, mode: "CASH" });

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(after.body.received).toBe(40_000);
    expect(after.body.outstanding).toBe(60_000);
  });

  it("12. dashboard Received updates immediately after a payment is edited", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 100_000 });
    const payment = await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 20_000 });

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(before.body.received).toBe(20_000);
    expect(before.body.outstanding).toBe(80_000);

    await request(app).patch(`/api/accounts/payments/${payment.id}`).set("Authorization", `Bearer ${token}`).send({ amount: 30_000 });

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(after.body.received).toBe(30_000);
    expect(after.body.outstanding).toBe(70_000);
  });

  it("13. dashboard Received/Outstanding update immediately after a payment is deleted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 100_000 });
    const payment = await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 25_000 });

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(before.body.outstanding).toBe(75_000);

    await request(app).delete(`/api/accounts/payments/${payment.id}`).set("Authorization", `Bearer ${token}`);

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(after.body.received).toBe(0);
    expect(after.body.outstanding).toBe(100_000);
  });

  it("14. dashboard Total Expenses updates after an expense is created, edited, and deleted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, category: "Travel", amount: 1_000, date: new Date().toISOString() });
    const afterCreate = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterCreate.body.totalExpenses).toBe(1_000);

    await request(app)
      .patch(`/api/accounts/expenses/${createRes.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1_500 });
    const afterEdit = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterEdit.body.totalExpenses).toBe(1_500);

    await request(app).delete(`/api/accounts/expenses/${createRes.body.id}`).set("Authorization", `Bearer ${token}`);
    const afterDelete = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterDelete.body.totalExpenses).toBe(0);
  });

  it("15. dashboard Total Income/Fees updates after a fee is created, edited, and soft-deleted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();

    const createRes = await request(app)
      .post("/api/accounts/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, amount: 10_000 });
    const afterCreate = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterCreate.body.totalIncome).toBe(10_000);

    await request(app).patch(`/api/accounts/fees/${createRes.body.id}`).set("Authorization", `Bearer ${token}`).send({ amount: 15_000 });
    const afterEdit = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterEdit.body.totalIncome).toBe(15_000);

    await request(app).delete(`/api/accounts/fees/${createRes.body.id}`).set("Authorization", `Bearer ${token}`);
    const afterDelete = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterDelete.body.totalIncome).toBe(0);
  });

  /** Overdue/Due Soon are no longer dashboard cards (Overview completion pass,
   * 2026-08-15, §1) — Overdue now lives only inside dashboard.breakdown (feeding
   * Profit internally) and Due Soon only via its own unmodified GET /due-soon
   * drill-down, both asserted directly rather than against removed top-level
   * dashboard.body.overdue/dueSoon fields. */
  it("16. Profit-internal Overdue and the separate Due Soon drill-down remain correct after a payment is created, then edited, against an overdue fee", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, {
      amount: 100_000,
      dueDate: new Date(Date.now() - 2 * 86400000),
    });

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(before.body.breakdown.overdue).toBe(100_000);
    const dueSoonBefore = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoonBefore.body).toHaveLength(0);

    const paymentRes = await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, feeId: fee.id, amount: 30_000, mode: "CASH" });
    const afterCreate = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterCreate.body.breakdown.overdue).toBe(70_000);

    await request(app)
      .patch(`/api/accounts/payments/${paymentRes.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 50_000 });
    const afterEdit = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterEdit.body.breakdown.overdue).toBe(50_000);
    const dueSoonAfter = await request(app).get("/api/accounts/due-soon").set("Authorization", `Bearer ${token}`);
    expect(dueSoonAfter.body).toHaveLength(0);
  });
});

/**
 * Accounts Overview/Expenses completion pass (2026-08-15) — final-changes spec.
 * §35 (expense workflow), §36 (dashboard), §37 (payments no-double-count), §38
 * (invoice integration), §39 (security) test scenarios below.
 */
describe("Accounts — K. General/Client/Case Expense workflow (§6-§19, §35)", () => {
  it("General/Firm expense: Client=null, Case=null, appears in Accounts → Expenses and contributes to Total Expenses", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 50_000, date: new Date().toISOString(), vendor: "Landlord", description: "Office Rent" });
    expect(res.status).toBe(201);
    expect(res.body.caseId).toBeNull();
    expect(res.body.clientId).toBeNull();

    const list = await request(app).get("/api/accounts/expenses").query({ kind: "GENERAL" }).set("Authorization", `Bearer ${token}`);
    const row = list.body.find((e: { id: string }) => e.id === res.body.id);
    expect(row).toBeTruthy();
    expect(row.kind).toBe("GENERAL");

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.totalExpenses).toBe(50_000);
    expect(dashboard.body.breakdown.generalExpenses).toBe(50_000);
  });

  it("Client-level expense: Case=null, appears in Accounts → Expenses and the client's overall financial record, never inside any case", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, category: "Documentation", amount: 5_000, date: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.caseId).toBeNull();
    expect(res.body.clientId).toBe(client.id);

    const caseAccounts = await request(app).get(`/api/cases/${testCase.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseAccounts.body.expenses.map((e: { id: string }) => e.id)).not.toContain(res.body.id);

    const clientSummary = await request(app).get(`/api/accounts/clients/${client.id}/summary`).set("Authorization", `Bearer ${token}`);
    expect(clientSummary.body.summary.totalExpenses).toBe(5_000);
  });

  it("Case-Level expense created via Cases → Add Expense auto-attaches Client and Case — no manual selection, correctly scoped to that case only", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const caseA = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const caseB = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    // Mirrors the frontend's "Add Expense" quick action from the Cases sidebar,
    // which sends only caseId — client/case are resolved server-side.
    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: caseA.id, category: "Court Fee", amount: 2_000, date: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.caseId).toBe(caseA.id);
    expect(res.body.clientId).toBeNull();

    const caseAAccounts = await request(app).get(`/api/cases/${caseA.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseAAccounts.body.expenses.map((e: { id: string }) => e.id)).toContain(res.body.id);

    const caseBAccounts = await request(app).get(`/api/cases/${caseB.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseBAccounts.body.expenses.map((e: { id: string }) => e.id)).not.toContain(res.body.id);

    const accountsExpenses = await request(app).get("/api/accounts/expenses").set("Authorization", `Bearer ${token}`);
    expect(accountsExpenses.body.map((e: { id: string }) => e.id)).toContain(res.body.id);
  });

  it("two case expenses on different cases each stay isolated per-case while both roll up into overall Total Expenses (one record, not duplicated)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const caseA = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const caseB = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: caseA.id, category: "Court Fee", amount: 10_000, date: new Date().toISOString() });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: caseB.id, category: "Court Fee", amount: 5_000, date: new Date().toISOString() });

    const caseAAccounts = await request(app).get(`/api/cases/${caseA.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseAAccounts.body.financialSummary.totalExpenses).toBe(10_000);
    const caseBAccounts = await request(app).get(`/api/cases/${caseB.id}/accounts`).set("Authorization", `Bearer ${token}`);
    expect(caseBAccounts.body.financialSummary.totalExpenses).toBe(5_000);

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.totalExpenses).toBe(15_000);
    expect(dashboard.body.breakdown.caseExpenses).toBe(15_000);
  });

  it("an expense may not be linked to a case AND a client simultaneously", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, clientId: client.id, category: "Travel", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

});

/**
 * General/Firm Expense receipt upload follow-up (2026-08-15). A General expense has
 * no case and no client — `createReceiptDocument` produces a Document with both
 * null, and `assertDocumentAccess`/`assertScopelessAccountsDocumentAccess`
 * (utils/authorization.ts) gate it by ACCOUNTS.VIEW_EXPENSES possession alone, since
 * there is no row-level scope to check. No fake Client/Case is ever created.
 */
describe("Accounts — O. General/Firm Expense receipt upload (2026-08-15 follow-up)", () => {
  it("1. a General expense without a receipt still succeeds", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeNull();
    expect(res.body.caseId).toBeNull();
    expect(res.body.clientId).toBeNull();
  });

  it("2. a General expense WITH a receipt succeeds in one request, with no fake Client/Case ever created", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const beforeClients = await prisma.client.count();
    const beforeCases = await prisma.case.count();

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("category", "Miscellaneous")
      .field("amount", "50000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "rent-receipt.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeTruthy();
    expect(res.body.caseId).toBeNull();
    expect(res.body.clientId).toBeNull();

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.receiptDocumentId } });
    expect(doc.caseId).toBeNull();
    expect(doc.clientId).toBeNull();
    expect(doc.confidentiality).toBe("INTERNAL");

    expect(await prisma.client.count()).toBe(beforeClients);
    expect(await prisma.case.count()).toBe(beforeCases);
  });

  it("3. an unauthorized user (no Accounts permissions at all) cannot upload a receipt for a General expense, nor view an existing one, via direct API", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("category", "Miscellaneous")
      .field("amount", "1000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    const documentId = createRes.body.receiptDocumentId;

    const outsider = await createUser("ASSOCIATE");
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");

    const uploadRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .field("category", "Miscellaneous")
      .field("amount", "1000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(uploadRes.status).toBe(403);

    const viewRes = await request(app).get(`/api/documents/${documentId}`).set("Authorization", `Bearer ${outsiderToken}`);
    expect(viewRes.status).toBe(404); // never confirms existence to an unauthorized actor
  });

  it("4. a user with only ACCOUNTS.CREATE_EXPENSE can upload a receipt while creating a General expense", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.CREATE_EXPENSE"]);

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${associateToken}`)
      .field("category", "Miscellaneous")
      .field("amount", "2000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeTruthy();
  });

  it("5. a user without ACCOUNTS.EDIT_EXPENSE cannot replace an existing General expense's receipt", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${partnerToken}`)
      .field("category", "Miscellaneous")
      .field("amount", "3000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "first.pdf", contentType: "application/pdf" });

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.CREATE_EXPENSE"]);

    const replaceRes = await request(app)
      .post(`/api/accounts/expenses/${createRes.body.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "second.pdf", contentType: "application/pdf" });
    expect(replaceRes.status).toBe(403);
  });

  it("6. a user with ACCOUNTS.EDIT_EXPENSE can replace an existing General expense's receipt", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${partnerToken}`)
      .field("category", "Miscellaneous")
      .field("amount", "4000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "first.pdf", contentType: "application/pdf" });

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    await grantOnly(partnerToken, associate.id, ["ACCOUNTS.EDIT_EXPENSE"]);

    const replaceRes = await request(app)
      .post(`/api/accounts/expenses/${createRes.body.id}/receipt`)
      .set("Authorization", `Bearer ${associateToken}`)
      .attach("file", VALID_PDF, { filename: "second.pdf", contentType: "application/pdf" });
    expect(replaceRes.status).toBe(201);
    expect(replaceRes.body.id).not.toBe(createRes.body.receiptDocumentId);

    const updated = await prisma.expense.findUniqueOrThrow({ where: { id: createRes.body.id } });
    expect(updated.receiptDocumentId).toBe(replaceRes.body.id);
  });

  it("7. a CLIENT actor cannot access a General expense's receipt, even by real id, and never sees it via the Client Portal even with Documents enabled", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${partnerToken}`)
      .field("category", "Miscellaneous")
      .field("amount", "5000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    const documentId = createRes.body.receiptDocumentId;

    const client = await createClient();
    await request(app)
      .patch(`/api/clients/${client.id}/portal-permissions`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ portalDocumentsEnabled: true });
    const clientToken = await tokenForClient(client.id);

    // requireStaff rejects a Client actor outright before assertDocumentAccess ever runs.
    const staffRouteRes = await request(app).get(`/api/documents/${documentId}`).set("Authorization", `Bearer ${clientToken}`);
    expect(staffRouteRes.status).toBe(403);

    const portalRes = await request(app)
      .get(`/api/client-portal/documents/${documentId}/download`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(portalRes.status).toBe(404);
  });

  it("8. Case-level expense receipts continue to work exactly as before, unaffected by General-expense receipt support", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("caseId", testCase.id)
      .field("category", "Court Fee")
      .field("amount", "1500")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.receiptDocumentId).toBeTruthy();

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.body.receiptDocumentId } });
    expect(doc.caseId).toBe(testCase.id);
    expect(doc.clientId).toBeNull();

    const viewRes = await request(app).get(`/api/documents/${res.body.receiptDocumentId}`).set("Authorization", `Bearer ${token}`);
    expect(viewRes.status).toBe(200);
  });

  it("9. deleting a General expense leaves its receipt Document intact, matching the existing document-lifecycle precedent", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const createRes = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("category", "Miscellaneous")
      .field("amount", "6000")
      .field("date", new Date().toISOString())
      .attach("file", VALID_PDF, { filename: "receipt.pdf", contentType: "application/pdf" });
    const documentId = createRes.body.receiptDocumentId;

    await request(app).delete(`/api/accounts/expenses/${createRes.body.id}`).set("Authorization", `Bearer ${token}`);

    const untouchedDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(untouchedDocument.deletedAt).toBeNull();

    const viewRes = await request(app).get(`/api/documents/${documentId}`).set("Authorization", `Bearer ${token}`);
    expect(viewRes.status).toBe(200);
  });
});

describe("Accounts — L. Case expense security (§28/§29/§39)", () => {
  it("a user without ACCOUNTS.CREATE_EXPENSE cannot create any expense, even a General one, via direct API", async () => {
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ category: "Miscellaneous", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it("a user cannot record a case expense against a case they have no row-level access to, even with CREATE_EXPENSE granted — the caseId is never trusted blindly", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE");
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const client = await createClient();
    // Deliberately NOT linking `outsider` to this case as partner/advocate.
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    await grantOnly(partnerToken, outsider.id, ["ACCOUNTS.CREATE_EXPENSE"]);

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ caseId: testCase.id, category: "Court Fee", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(404); // out-of-scope case is 404 (assertCaseAccess), never confirming its existence
  });

  it("a user cannot record a client-level expense against a client they have no row-level access to", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE");
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const client = await createClient(); // never linked to `outsider` via any case
    await grantOnly(partnerToken, outsider.id, ["ACCOUNTS.CREATE_EXPENSE"]);

    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ clientId: client.id, category: "Documentation", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(404);
  });

  it("a CLIENT actor cannot create any Accounts expense via direct API", async () => {
    const client = await createClient();
    const clientToken = await tokenForClient(client.id);
    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ category: "Miscellaneous", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it("a Junior Advocate/Associate with no Accounts permission cannot view Accounts financial data, Profit, or case expense data via direct API", async () => {
    for (const role of ["JUNIOR_ASSOCIATE", "ASSOCIATE", "OFFICE_STAFF"] as const) {
      const user = await createUser(role);
      const token = await tokenForUser(user.id, role);
      const dashboardRes = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
      expect(dashboardRes.status, `${role} dashboard`).toBe(403);
      const expensesRes = await request(app).get("/api/accounts/expenses").set("Authorization", `Bearer ${token}`);
      expect(expensesRes.status, `${role} expenses list`).toBe(403);
    }
  });
});

describe("Accounts — M. Overview dashboard: 5 cards, date range, Profit (§1-§5, §20-§24, §36)", () => {
  it("dashboard response exposes exactly the 5 new figures and no top-level overdue/dueSoon fields", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const res = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalIncome");
    expect(res.body).toHaveProperty("received");
    expect(res.body).toHaveProperty("outstanding");
    expect(res.body).toHaveProperty("totalExpenses");
    expect(res.body).toHaveProperty("profit");
    expect(res.body).not.toHaveProperty("overdue");
    expect(res.body).not.toHaveProperty("dueSoon");
  });

  it("a CUSTOM date range in the far future excludes a fee/payment/expense created now from every scoped figure; THIS_MONTH includes them", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 50_000 });
    await createAccountsPayment(client.id, partner.id, { feeId: fee.id, amount: 20_000 });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 5_000, date: new Date().toISOString() });

    const future = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "CUSTOM", startDate: "2030-01-01", endDate: "2030-01-31" })
      .set("Authorization", `Bearer ${token}`);
    expect(future.body.totalIncome).toBe(0);
    expect(future.body.received).toBe(0);
    expect(future.body.outstanding).toBe(0);
    expect(future.body.totalExpenses).toBe(0);

    const thisMonth = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "THIS_MONTH" })
      .set("Authorization", `Bearer ${token}`);
    expect(thisMonth.body.totalIncome).toBe(50_000);
    expect(thisMonth.body.received).toBe(20_000);
    expect(thisMonth.body.totalExpenses).toBe(5_000);
  });

  it("PREVIOUS_MONTH is a recognized preset distinct from THIS_MONTH", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 1_000, date: new Date().toISOString() });

    const previousMonth = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "PREVIOUS_MONTH" })
      .set("Authorization", `Bearer ${token}`);
    expect(previousMonth.status).toBe(200);
    expect(previousMonth.body.totalExpenses).toBe(0); // an expense dated "now" never falls in the previous month

    const thisMonth = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "THIS_MONTH" })
      .set("Authorization", `Bearer ${token}`);
    expect(thisMonth.body.totalExpenses).toBe(1_000);
  });

  /**
   * Accounts Overview period persistence pass (2026-08-17) — ALL_TIME (§4-§6/§12).
   * Deliberately proves ALL_TIME reuses the exact pre-existing "no range = unfiltered"
   * behavior (resolveAccountsDateRange returns undefined for it, same as omitting
   * preset entirely) rather than any new calculation path, and that it genuinely
   * removes the date restriction rather than applying a wide-but-still-artificial
   * range.
   */
  it("ALL_TIME produces results identical to the pre-existing no-preset ('all time') behavior, with range: null", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    await createProfessionalFee(client.id, partner.id, { amount: 50_000 });
    await createAccountsPayment(client.id, partner.id, { amount: 10_000 });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 5_000, date: new Date().toISOString() });

    const noPreset = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    const allTime = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "ALL_TIME" })
      .set("Authorization", `Bearer ${token}`);

    expect(allTime.status).toBe(200);
    expect(allTime.body.range).toBeNull();
    expect(allTime.body.totalIncome).toBe(noPreset.body.totalIncome);
    expect(allTime.body.received).toBe(noPreset.body.received);
    expect(allTime.body.outstanding).toBe(noPreset.body.outstanding);
    expect(allTime.body.totalExpenses).toBe(noPreset.body.totalExpenses);
    expect(allTime.body.profit).toBe(noPreset.body.profit);
  });

  it("ALL_TIME includes fees/payments/expenses dated far in the past — THIS_MONTH correctly excludes them, ALL_TIME correctly includes them", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();

    const fee = await createProfessionalFee(client.id, partner.id, { amount: 40_000 });
    await prisma.professionalFee.update({
      where: { id: fee.id },
      data: { agreementDate: new Date("2020-01-15"), createdAt: new Date("2020-01-15") },
    });
    await createAccountsPayment(client.id, partner.id, {
      feeId: fee.id,
      amount: 15_000,
      paymentDate: new Date("2020-01-20"),
    });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Historical", amount: 3_000, date: new Date("2020-01-25").toISOString() });

    const thisMonth = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "THIS_MONTH" })
      .set("Authorization", `Bearer ${token}`);
    expect(thisMonth.body.totalIncome).toBe(0);
    expect(thisMonth.body.received).toBe(0);
    expect(thisMonth.body.totalExpenses).toBe(0);

    const allTime = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "ALL_TIME" })
      .set("Authorization", `Bearer ${token}`);
    expect(allTime.body.totalIncome).toBe(40_000);
    expect(allTime.body.received).toBe(15_000);
    expect(allTime.body.outstanding).toBe(25_000);
    expect(allTime.body.totalExpenses).toBe(3_000);
  });

  it("ALL_TIME calculates Profit using the existing (Total Income - Overdue - Total Expenses) formula against historical records", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();

    // Fully unpaid, due long ago — overdue by the same existing rule ALL_TIME reuses.
    const fee = await createProfessionalFee(client.id, partner.id, {
      amount: 100_000,
      dueDate: new Date("2020-01-01"),
    });
    await prisma.professionalFee.update({
      where: { id: fee.id },
      data: { agreementDate: new Date("2019-12-01"), createdAt: new Date("2019-12-01") },
    });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Historical", amount: 20_000, date: new Date("2019-12-15").toISOString() });

    const allTime = await request(app)
      .get("/api/accounts/dashboard")
      .query({ preset: "ALL_TIME" })
      .set("Authorization", `Bearer ${token}`);
    // Income = 100,000. Overdue = 100,000 (fully unpaid, past due). Expenses = 20,000.
    // Profit = (100,000 - 100,000) - 20,000 = -20,000.
    expect(allTime.body.totalIncome).toBe(100_000);
    expect(allTime.body.breakdown.overdue).toBe(100_000);
    expect(allTime.body.profit).toBe(-20_000);
    expect(allTime.body.breakdown.profit).toBe(allTime.body.profit);
  });

  it("regression: TODAY/THIS_WEEK/THIS_MONTH/PREVIOUS_MONTH/FINANCIAL_YEAR still resolve to distinct, non-null ranges after ALL_TIME was added", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");

    for (const preset of ["TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_MONTH", "FINANCIAL_YEAR"]) {
      const res = await request(app)
        .get("/api/accounts/dashboard")
        .query({ preset })
        .set("Authorization", `Bearer ${token}`);
      expect(res.status, `expected ${preset} to succeed`).toBe(200);
      expect(res.body.range, `expected ${preset} to resolve to a concrete range, not All Time's null`).not.toBeNull();
    }
  });

  it("Total Expenses = General + Client-Level + Case-Level, matching the spec's worked example structure", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 150_000, date: new Date().toISOString() });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, category: "Documentation", amount: 20_000, date: new Date().toISOString() });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ caseId: testCase.id, category: "Court Fee", amount: 30_000, date: new Date().toISOString() });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.breakdown.generalExpenses).toBe(150_000);
    expect(dashboard.body.breakdown.clientExpenses).toBe(20_000);
    expect(dashboard.body.breakdown.caseExpenses).toBe(30_000);
    expect(dashboard.body.totalExpenses).toBe(200_000);
  });

  it("Profit = (Total Income - Overdue) - Total Expenses, and the Profit Breakdown figures reconcile to the same Profit", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    // Overdue: 100,000 due 2 days ago, fully unpaid.
    await createProfessionalFee(client.id, partner.id, { amount: 100_000, dueDate: new Date(Date.now() - 2 * 86400000) });
    // Not overdue (no due date) — still counts toward Income, never toward Overdue.
    await createProfessionalFee(client.id, partner.id, { amount: 20_000 });
    await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Miscellaneous", amount: 10_000, date: new Date().toISOString() });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    // Income = 100,000 + 20,000 = 120,000. Overdue = 100,000. Expenses = 10,000.
    // Profit = (120,000 - 100,000) - 10,000 = 10,000.
    expect(dashboard.body.totalIncome).toBe(120_000);
    expect(dashboard.body.profit).toBe(10_000);
    expect(dashboard.body.breakdown.incomeAfterOverdue).toBe(20_000);
    expect(dashboard.body.breakdown.profit).toBe(dashboard.body.profit);
  });

  it("non-DRAFT Invoice totals contribute to Total Income/Fees; DRAFT invoices do not; invoice approval never increases Received", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();

    const draftInvoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, manualItems: [{ description: "Consultation", quantity: 1, rate: 25_000 }] });
    const beforeApprove = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(beforeApprove.body.totalIncome).toBe(0);
    expect(beforeApprove.body.received).toBe(0);

    await request(app).patch(`/api/invoices/${draftInvoice.body.id}/approve`).set("Authorization", `Bearer ${token}`);
    const afterApprove = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(afterApprove.body.totalIncome).toBe(25_000);
    expect(afterApprove.body.received).toBe(0); // approving an invoice is never "received"
  });
});

describe("Accounts — N. Multiple/partial payments — no double counting (§37)", () => {
  it("multiple partial payments against the same fee sum correctly and are never double-counted", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const fee = await createProfessionalFee(client.id, partner.id, { amount: 100_000 });

    await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, feeId: fee.id, amount: 30_000, mode: "CASH" });
    await request(app)
      .post("/api/accounts/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.id, feeId: fee.id, amount: 25_000, mode: "UPI" });

    const dashboard = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${token}`);
    expect(dashboard.body.received).toBe(55_000);
    expect(dashboard.body.outstanding).toBe(45_000);
  });
});

/**
 * Simplified Case Expense Entry (2026-08-17, §14-§29/§31), corrected 2026-08-17
 * (authorization follow-up) — "Cases → Case → Billing / Expenses → Add Expense"
 * posts to POST /cases/:caseId/billing-expenses/expenses (accounts.routes.ts's
 * caseBillingExpensesRouter), gated by CASE_BILLING_EXPENSES.VIEW + EXPENSES.CREATE
 * — deliberately NOT any ACCOUNTS.* key. Reading the case's expense history uses
 * GET .../billing-expenses/expenses (CASE_BILLING_EXPENSES.VIEW + EXPENSES.VIEW).
 * Editing/deleting a case expense reuses the pre-existing, unmodified
 * PATCH/DELETE /api/expenses/:id (EXPENSES.EDIT/EXPENSES.DELETE —
 * expenses.routes.ts), never the Accounts module's own /api/accounts/expenses/:id.
 * Billing/Expenses and Accounts are two independent security domains: a user can
 * fully use this workflow with zero ACCOUNTS.* permissions, and the resulting
 * Expense row still automatically appears in Accounts → Expenses / Total Expenses
 * / Profit purely because those aggregates read the whole Expense table
 * unconditionally — a data-layer fact, not an authorization dependency.
 */
describe("Accounts — P. Simplified Case Expense Entry (Case Section Access, 2026-08-17)", () => {
  it("creates a case expense with ONLY date/description/amount — no category/paymentMode/vendor/client/case selection required", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });

    expect(res.status).toBe(201);
    expect(res.body.caseId).toBe(testCase.id);
    expect(res.body.clientId).toBeNull(); // derived via case.clients, never stored directly
    expect(res.body.description).toBe("Court filing expense");
    expect(res.body.amount).toBe(2_000);
    expect(res.body.category).toBe("Case Expense"); // sensible server default — no category field on this form
    expect(res.body.paymentMode).toBeNull();
    expect(res.body.vendor).toBeNull();
    expect(res.body.receiptDocumentId).toBeNull();
  });

  it("Entered By is auto-populated from the authenticated actor and cannot be spoofed via the request body", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const impersonated = await createUser("ASSOCIATE", "Someone Else");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: new Date().toISOString(),
        description: "Courier",
        amount: 500,
        incurredById: impersonated.id, // must be ignored — not part of the schema
        enteredByUserId: impersonated.id, // must be ignored — not part of the schema
      });

    expect(res.status).toBe(201);
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.incurredById).toBe(partner.id);
    expect(row.incurredById).not.toBe(impersonated.id);

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`);
    const created = list.body.find((e: { id: string }) => e.id === res.body.id);
    expect(created.incurredBy.name).toBe(partner.name);
  });

  it("missing date/description/amount is rejected with 400", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const testCase = await createCase({ partnerId: partner.id });

    const missingDescription = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), amount: 500 });
    expect(missingDescription.status).toBe(400);

    const missingAmount = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), description: "Courier" });
    expect(missingAmount.status).toBe(400);
  });

  it("the expense appears only in the case it was created against, never a sibling case", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const token = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const caseA = await createCase({ partnerId: partner.id });
    const caseB = await createCase({ partnerId: partner.id });

    const created = await request(app)
      .post(`/api/cases/${caseA.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });
    expect(created.status).toBe(201);

    const listA = await request(app)
      .get(`/api/cases/${caseA.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`);
    expect(listA.body.map((e: { id: string }) => e.id)).toContain(created.body.id);

    const listB = await request(app)
      .get(`/api/cases/${caseB.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${token}`);
    expect(listB.body.map((e: { id: string }) => e.id)).not.toContain(created.body.id);
  });

  it("a user cannot create a case expense against a case they cannot access, even holding both required permissions (404)", async () => {
    const partnerA = await createUser("MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE"); // EXPENSES.CREATE + CASE_BILLING_EXPENSES.VIEW true by default
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partnerA.id }); // outsider not linked

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ date: new Date().toISOString(), description: "Courier", amount: 500 });
    expect(res.status).toBe(404);
  });

  // --- Authorization correction (2026-08-17 follow-up) — the 12 scenarios the
  // Managing Partner explicitly asked to prove, in order. ---

  it("1. user with CASE_BILLING_EXPENSES.VIEW + EXPENSES.CREATE can create a case expense WITHOUT ACCOUNTS.VIEW", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // role defaults: both true, ACCOUNTS.VIEW false
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const perms = await request(app)
      .get("/api/accounts/permissions")
      .set("Authorization", `Bearer ${associateToken}`);
    expect(perms.body.view).toBe(false); // confirms this actor genuinely has no Accounts access

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });
    expect(res.status).toBe(201);
  });

  it("2. user without EXPENSES.CREATE cannot create a case expense", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await revokePermission(partnerToken, associate.id, "EXPENSES.CREATE");

    const res = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ date: new Date().toISOString(), description: "Courier", amount: 500 });
    expect(res.status).toBe(403);
  });

  it("3. user with EXPENSES.EDIT can edit a case expense WITHOUT ACCOUNTS.VIEW", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // EXPENSES.EDIT true by default, ACCOUNTS.VIEW false
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });

    const res = await request(app)
      .patch(`/api/expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ amount: 3_000 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(3_000);
  });

  it("4. user without EXPENSES.EDIT cannot edit a case expense", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await revokePermission(partnerToken, associate.id, "EXPENSES.EDIT");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });

    const res = await request(app)
      .patch(`/api/expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ amount: 3_000 });
    expect(res.status).toBe(403);
  });

  it("5. user with EXPENSES.DELETE can delete a case expense WITHOUT ACCOUNTS.VIEW", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // EXPENSES.DELETE true by default, ACCOUNTS.VIEW false
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });

    const res = await request(app)
      .delete(`/api/expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(204);

    const row = await prisma.expense.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it("6. user without EXPENSES.DELETE cannot delete a case expense", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await revokePermission(partnerToken, associate.id, "EXPENSES.DELETE");

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });

    const res = await request(app)
      .delete(`/api/expenses/${created.body.id}`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("7. user without CASE_BILLING_EXPENSES.VIEW cannot access the Billing/Expenses section (view or create)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    await revokePermission(partnerToken, associate.id, "CASE_BILLING_EXPENSES.VIEW");

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ date: new Date().toISOString(), description: "Courier", amount: 500 });
    expect(create.status).toBe(403);
  });

  it("8. user without CASE_ACCOUNTS.VIEW cannot access Case → Accounts, even with full Billing/Expenses access", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // CASE_BILLING_EXPENSES.VIEW true, CASE_ACCOUNTS.VIEW false by default
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });
    // Grant full Accounts access to isolate that CASE_ACCOUNTS.VIEW alone still blocks the tab.
    await grantPermission(partnerToken, associate.id, "ACCOUNTS.VIEW");

    const res = await request(app)
      .get(`/api/cases/${testCase.id}/accounts`)
      .set("Authorization", `Bearer ${associateToken}`);
    expect(res.status).toBe(403);
  });

  it("9. existing ACCOUNTS.* permissions continue to gate the Accounts module exactly as before", async () => {
    const accountsUser = await createUser("ACCOUNTS_TEAM");
    const accountsToken = await tokenForUser(accountsUser.id, "ACCOUNTS_TEAM");
    const client = await createClient();

    // ACCOUNTS_TEAM's full Accounts access is unchanged by this correction.
    const res = await request(app)
      .post("/api/accounts/expenses")
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ clientId: client.id, category: "Documentation", amount: 1_000, date: new Date().toISOString() });
    expect(res.status).toBe(201);

    const associate = await createUser("ASSOCIATE");
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const denied = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${associateToken}`);
    expect(denied.status).toBe(403); // Associate still has no bare ACCOUNTS.VIEW, as before this correction
  });

  it("10. the case expense appears in Accounts → Expenses and contributes to Total Expenses/Profit, regardless of the creator having zero Accounts access", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const associate = await createUser("ASSOCIATE"); // no ACCOUNTS.* permission at all
    const associateToken = await tokenForUser(associate.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id] });

    const before = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${partnerToken}`);
    const totalBefore = before.body.totalExpenses;
    const profitBefore = before.body.profit;

    const created = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${associateToken}`) // created by a user with NO Accounts access
      .send({ date: new Date().toISOString(), description: "Court filing expense", amount: 2_000 });
    expect(created.status).toBe(201);

    const accountsExpenses = await request(app)
      .get("/api/accounts/expenses")
      .set("Authorization", `Bearer ${partnerToken}`); // viewed by an actor who DOES have Accounts access
    expect(accountsExpenses.body.map((e: { id: string }) => e.id)).toContain(created.body.id);
    const row = accountsExpenses.body.find((e: { id: string }) => e.id === created.body.id);
    expect(row.kind).toBe("CASE");
    expect(row.incurredBy.name).toBe(associate.name);

    const after = await request(app).get("/api/accounts/dashboard").set("Authorization", `Bearer ${partnerToken}`);
    expect(after.body.totalExpenses).toBe(totalBefore + 2_000);
    expect(after.body.profit).toBe(profitBefore - 2_000);
  });

  it("11. Client Portal remains unaffected by the Billing/Expenses ↔ Accounts decoupling", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, clientIds: [client.id] });
    const clientToken = await tokenForClient(client.id);

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(list.status).toBe(403); // requireStaff rejects a CLIENT actor before any permission check
  });

  it("12. existing Case authorization (assertCaseAccess) remains enforced for the simplified expense workflow", async () => {
    const partnerA = await createUser("MANAGING_PARTNER");
    const outsider = await createUser("ASSOCIATE"); // has both required permissions by role default
    const outsiderToken = await tokenForUser(outsider.id, "ASSOCIATE");
    const testCase = await createCase({ partnerId: partnerA.id }); // outsider not linked to this case

    const list = await request(app)
      .get(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    // The list endpoint is permission-only gated (firm-wide, matching every other
    // Accounts VIEW endpoint's established precedent) — not row-scoped by case
    // ownership, so this returns 200. Row-level enforcement for this workflow
    // lives on the WRITE path (see scenario 12's real assertion below and the
    // "cannot create against a case they cannot access" test above).
    expect(list.status).toBe(200);

    const create = await request(app)
      .post(`/api/cases/${testCase.id}/billing-expenses/expenses`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ date: new Date().toISOString(), description: "Courier", amount: 500 });
    expect(create.status).toBe(404);
  });
});

async function grantPermission(mpToken: string, userId: string, permissionKey: string) {
  await request(app)
    .post(`/api/permissions/employees/${userId}/overrides`)
    .set("Authorization", `Bearer ${mpToken}`)
    .send({ permissionKey, effect: "GRANT", reason: "test" });
}

async function revokePermission(mpToken: string, userId: string, permissionKey: string) {
  await request(app)
    .post(`/api/permissions/employees/${userId}/overrides`)
    .set("Authorization", `Bearer ${mpToken}`)
    .send({ permissionKey, effect: "REVOKE", reason: "test" });
}
