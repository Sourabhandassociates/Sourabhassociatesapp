import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { createUser, createClient, createCase, tokenForUser } from "../helpers/fixtures";

async function setup() {
  const partner = await createUser("MANAGING_PARTNER");
  const associate = await createUser("ASSOCIATE");
  const accounts = await createUser("ACCOUNTS_TEAM");
  const client = await createClient("Invoice Test Client");
  const testCase = await createCase({ partnerId: partner.id, advocateIds: [associate.id], clientIds: [client.id] });
  return {
    partner,
    associate,
    accounts,
    client,
    case: testCase,
    partnerToken: await tokenForUser(partner.id, "MANAGING_PARTNER"),
    associateToken: await tokenForUser(associate.id, "ASSOCIATE"),
    accountsToken: await tokenForUser(accounts.id, "ACCOUNTS_TEAM"),
  };
}

describe("Billing & Invoicing (Milestone 2, SRD Section 16.1)", () => {
  it("creates a draft invoice aggregating a time log + an expense, marking both invoiced", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 4, description: "Research" });
    const expense = await request(app)
      .post(`/api/cases/${testCase.id}/expenses`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ category: "Travel", amount: 300, date: new Date().toISOString() });

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }],
        expenseItems: [{ expenseId: expense.body.id }],
      });

    expect(invoice.status).toBe(201);
    expect(invoice.body.status).toBe("DRAFT");
    expect(invoice.body.total).toBe(4 * 100 + 300);
    expect(invoice.body.invoiceNumber).toMatch(/^SA-INV-\d{4}-\d{4}$/);

    const updatedLog = await prisma.timeLog.findUnique({ where: { id: timeLog.body.id } });
    expect(updatedLog?.invoiced).toBe(true);
    const updatedExpense = await prisma.expense.findUnique({ where: { id: expense.body.id } });
    expect(updatedExpense?.invoiced).toBe(true);
  });

  it("rejects invoicing the same time log twice", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });

    await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 50 }] });

    const second = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 50 }] });
    expect(second.status).toBe(400);
  });

  it("an Associate can draft an invoice but cannot list/view invoices (SRD's two-row distinction)", async () => {
    const { case: testCase, client, associateToken, partnerToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });

    const draft = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }] });
    expect(draft.status).toBe(201);

    const list = await request(app).get("/api/invoices").set("Authorization", `Bearer ${associateToken}`);
    expect(list.status).toBe(403);
  });

  it("Managing Partner approves then sends a draft invoice; Accounts Team can view and record payment", async () => {
    const { case: testCase, client, partnerToken, accountsToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 2 });
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 200 }] });

    const approve = await request(app)
      .patch(`/api/invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe("APPROVED");

    const send = await request(app)
      .patch(`/api/invoices/${invoice.body.id}/send`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(send.status).toBe(200);
    expect(send.body.status).toBe("SENT");

    const view = await request(app).get(`/api/invoices/${invoice.body.id}`).set("Authorization", `Bearer ${accountsToken}`);
    expect(view.status).toBe(200);

    const partial = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ amount: 150, method: "Bank Transfer" });
    expect(partial.status).toBe(201);

    const afterPartial = await request(app).get(`/api/invoices/${invoice.body.id}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(afterPartial.body.status).toBe("PARTIALLY_PAID");
    expect(afterPartial.body.paymentStatus).toBe("PARTIALLY_PAID");

    const final = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ amount: 250 });
    expect(final.status).toBe(201);

    const afterFinal = await request(app).get(`/api/invoices/${invoice.body.id}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(afterFinal.body.status).toBe("PAID");
    expect(afterFinal.body.paymentStatus).toBe("PAID");
  });

  it("rejects a payment that exceeds the remaining balance", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }] });
    await request(app).patch(`/api/invoices/${invoice.body.id}/approve`).set("Authorization", `Bearer ${partnerToken}`);

    const overpay = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ amount: 999 });
    expect(overpay.status).toBe(400);
  });

  it("rejects approving a non-draft invoice and sending a non-approved invoice", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }] });

    const sendBeforeApprove = await request(app)
      .patch(`/api/invoices/${invoice.body.id}/send`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(sendBeforeApprove.status).toBe(400);

    await request(app).patch(`/api/invoices/${invoice.body.id}/approve`).set("Authorization", `Bearer ${partnerToken}`);
    const approveAgain = await request(app)
      .patch(`/api/invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(approveAgain.status).toBe(400);
  });

  it("rejects a Junior Associate approving/sending/recording payment (BILLING.APPROVE/RECORD_PAYMENT defaults false)", async () => {
    const partner = await createUser("MANAGING_PARTNER");
    const junior = await createUser("JUNIOR_ASSOCIATE");
    const client = await createClient();
    const testCase = await createCase({ partnerId: partner.id, advocateIds: [junior.id], clientIds: [client.id] });
    const partnerToken = await tokenForUser(partner.id, "MANAGING_PARTNER");
    const juniorToken = await tokenForUser(junior.id, "JUNIOR_ASSOCIATE");

    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }] });

    const approve = await request(app)
      .patch(`/api/invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${juniorToken}`);
    expect(approve.status).toBe(403);

    const payment = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${juniorToken}`)
      .send({ amount: 10 });
    expect(payment.status).toBe(403);
  });
});

describe("Billing bug fix (2026-08-06) — invoice creation with no unbilled time/expenses", () => {
  it("creates a draft invoice from a manual line item alone, when the case has no unbilled time logs or expenses", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        manualItems: [{ description: "Fixed-fee retainer", quantity: 1, rate: 25000 }],
      });
    expect(invoice.status).toBe(201);
    expect(invoice.body.status).toBe("DRAFT");
    expect(invoice.body.total).toBe(25000);
    expect(invoice.body.lineItems).toHaveLength(1);
  });

  it("still rejects a completely empty invoice (no time logs, expenses, or manual items)", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id });
    expect(invoice.status).toBe(400);
  });
});

describe("Payment-status derivation and filtering (billing bug-fix pass, 2026-08-06)", () => {
  it("derives PENDING for a freshly-drafted invoice with no due date", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 100 }] });
    expect(invoice.body.paymentStatus).toBe("PENDING");
  });

  it("derives OVERDUE once the due date has passed and the invoice isn't fully paid, and never OVERDUE once PAID", async () => {
    const { case: testCase, client, partnerToken, accountsToken } = await setup();
    const pastDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        dueDate: pastDueDate,
        manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }],
      });
    expect(invoice.body.paymentStatus).toBe("OVERDUE");

    await request(app).patch(`/api/invoices/${invoice.body.id}/approve`).set("Authorization", `Bearer ${partnerToken}`);
    const afterApprove = await request(app)
      .get(`/api/invoices/${invoice.body.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(afterApprove.body.paymentStatus).toBe("OVERDUE");

    const partial = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ amount: 400 });
    expect(partial.status).toBe(201);
    const afterPartial = await request(app)
      .get(`/api/invoices/${invoice.body.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(afterPartial.body.status).toBe("PARTIALLY_PAID");
    expect(afterPartial.body.paymentStatus).toBe("OVERDUE");

    const final = await request(app)
      .post(`/api/invoices/${invoice.body.id}/payments`)
      .set("Authorization", `Bearer ${accountsToken}`)
      .send({ amount: 600 });
    expect(final.status).toBe(201);
    const afterFinal = await request(app)
      .get(`/api/invoices/${invoice.body.id}`)
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(afterFinal.body.status).toBe("PAID");
    expect(afterFinal.body.paymentStatus).toBe("PAID");
  });

  it("filters the invoice list by paymentStatus, combining with the existing status filter", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const pastDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const pending = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, manualItems: [{ description: "A", quantity: 1, rate: 100 }] });
    const overdue = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        dueDate: pastDueDate,
        manualItems: [{ description: "B", quantity: 1, rate: 200 }],
      });

    const pendingOnly = await request(app)
      .get("/api/invoices")
      .query({ caseId: testCase.id, paymentStatus: "PENDING" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(pendingOnly.body.map((i: { id: string }) => i.id)).toEqual([pending.body.id]);

    const overdueOnly = await request(app)
      .get("/api/invoices")
      .query({ caseId: testCase.id, paymentStatus: "OVERDUE" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(overdueOnly.body.map((i: { id: string }) => i.id)).toEqual([overdue.body.id]);

    // Combines with the existing lifecycle-status filter (AND, not OR).
    const draftAndOverdue = await request(app)
      .get("/api/invoices")
      .query({ caseId: testCase.id, status: "DRAFT", paymentStatus: "OVERDUE" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(draftAndOverdue.body.map((i: { id: string }) => i.id)).toEqual([overdue.body.id]);

    const approvedAndOverdue = await request(app)
      .get("/api/invoices")
      .query({ caseId: testCase.id, status: "APPROVED", paymentStatus: "OVERDUE" })
      .set("Authorization", `Bearer ${partnerToken}`);
    expect(approvedAndOverdue.body).toHaveLength(0);
  });
});

describe("Invoice-module completion (2026-08-06) — general (case-less) invoices, tax & discount", () => {
  it("creates a general invoice with no caseId, billed directly to a client", async () => {
    const { client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ clientId: client.id, manualItems: [{ description: "Consultation fee", quantity: 1, rate: 5000 }] });

    expect(invoice.status).toBe(201);
    expect(invoice.body.case).toBeNull();
    expect(invoice.body.total).toBe(5000);

    const fetched = await request(app).get(`/api/invoices/${invoice.body.id}`).set("Authorization", `Bearer ${partnerToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.case).toBeNull();
  });

  it("rejects a general invoice that references time logs or expenses (those require a case)", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const timeLog = await request(app)
      .post(`/api/cases/${testCase.id}/time-logs`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ date: new Date().toISOString(), hours: 1 });

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ clientId: client.id, timeLogItems: [{ timeLogId: timeLog.body.id, rate: 100 }] });
    expect(invoice.status).toBe(400);
  });

  it("rejects a general invoice for a client the actor can't access, same as the case-scoped path", async () => {
    const { partnerToken } = await setup();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ clientId: "not-a-real-client-id", manualItems: [{ description: "Fee", quantity: 1, rate: 100 }] });
    // assertClientAccess (utils/authorization.ts) treats a nonexistent/out-of-scope
    // client as NotFoundError, same as the case-scoped path's client-link check would
    // for an inaccessible case.
    expect(invoice.status).toBe(404);
  });

  it("computes discount-then-tax in the correct order (discount on subtotal, GST on the post-discount amount)", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        manualItems: [{ description: "Service", quantity: 1, rate: 1000 }],
        discountType: "PERCENTAGE",
        discountValue: 10,
        taxRate: 18,
      });

    expect(invoice.status).toBe(201);
    expect(invoice.body.subtotal).toBe(1000);
    expect(invoice.body.discountAmount).toBe(100);
    expect(invoice.body.taxAmount).toBeCloseTo(162, 5); // (1000 - 100) * 0.18
    expect(invoice.body.total).toBeCloseTo(1062, 5); // 900 + 162
  });

  it("clamps a flat discount to the subtotal so the total never goes negative", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        manualItems: [{ description: "Service", quantity: 1, rate: 500 }],
        discountType: "FLAT",
        discountValue: 999999,
      });

    expect(invoice.status).toBe(201);
    expect(invoice.body.discountAmount).toBe(500);
    expect(invoice.body.total).toBe(0);
  });

  it("persists notes and terms & conditions on the created invoice", async () => {
    const { case: testCase, client, partnerToken } = await setup();

    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({
        caseId: testCase.id,
        clientId: client.id,
        manualItems: [{ description: "Service", quantity: 1, rate: 100 }],
        notes: "Thank you for your business.",
        termsAndConditions: "Payment due within 30 days.",
      });

    expect(invoice.body.notes).toBe("Thank you for your business.");
    expect(invoice.body.termsAndConditions).toBe("Payment due within 30 days.");
  });
});

describe("Invoice-module completion (2026-08-06) — PDF export", () => {
  it("streams a PDF for a case-scoped invoice to a caller with BILLING.VIEW", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }] });

    const pdf = await request(app)
      .get(`/api/invoices/${invoice.body.id}/pdf`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    const body = pdf.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("streams a PDF for a general (case-less) invoice without crashing on the missing matter", async () => {
    const { client, partnerToken } = await setup();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }] });

    const pdf = await request(app)
      .get(`/api/invoices/${invoice.body.id}/pdf`)
      .set("Authorization", `Bearer ${partnerToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects PDF download for a caller without BILLING.VIEW", async () => {
    const { case: testCase, client, partnerToken, associateToken } = await setup();
    const invoice = await request(app)
      .post("/api/invoices")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ caseId: testCase.id, clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }] });

    const pdf = await request(app).get(`/api/invoices/${invoice.body.id}/pdf`).set("Authorization", `Bearer ${associateToken}`);
    expect(pdf.status).toBe(403);
  });

  it("PDF-refinements pass (2026-08-06) — still renders successfully once a payment QR code has been uploaded (embeds it, doesn't crash)", async () => {
    const { case: testCase, client, partnerToken } = await setup();
    const backendQrPng = path.join(__dirname, "..", "..", "src", "assets", "payment-qr.png");
    const frontendQrPng = path.join(__dirname, "..", "..", "..", "frontend", "public", "payment-qr.png");
    const backup = fs.existsSync(backendQrPng) ? fs.readFileSync(backendQrPng) : null;
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    try {
      const upload = await request(app)
        .put("/api/firm-profile/qr-code")
        .set("Authorization", `Bearer ${partnerToken}`)
        .attach("qrCode", onePixelPng, { filename: "qr.png", contentType: "image/png" });
      expect(upload.status).toBe(204);

      const invoice = await request(app)
        .post("/api/invoices")
        .set("Authorization", `Bearer ${partnerToken}`)
        .send({ caseId: testCase.id, clientId: client.id, manualItems: [{ description: "Fee", quantity: 1, rate: 1000 }] });

      const pdf = await request(app)
        .get(`/api/invoices/${invoice.body.id}/pdf`)
        .set("Authorization", `Bearer ${partnerToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      if (backup) {
        fs.writeFileSync(backendQrPng, backup);
        fs.writeFileSync(frontendQrPng, backup);
      } else {
        if (fs.existsSync(backendQrPng)) fs.unlinkSync(backendQrPng);
        if (fs.existsSync(frontendQrPng)) fs.unlinkSync(frontendQrPng);
      }
    }
  });
});
