import { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../../utils/validators";
import * as invoicesService from "./invoices.service";
import { PaymentStatus } from "./invoices.service";
import { streamInvoicePdf } from "./invoiceExport.pdf";
import * as firmProfileService from "../firmProfile/firmProfile.service";

const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"];

const createSchema = z.object({
  caseId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  timeLogItems: z.array(z.object({ timeLogId: z.string().min(1), rate: z.number().positive() })).optional(),
  expenseItems: z.array(z.object({ expenseId: z.string().min(1) })).optional(),
  manualItems: z
    .array(z.object({ description: z.string().min(1), quantity: z.number().positive(), rate: z.number().positive() }))
    .optional(),
  taxRate: z.number().min(0).max(100).optional(),
  discountType: z.enum(["PERCENTAGE", "FLAT"]).optional(),
  discountValue: z.number().min(0).optional(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
});

export async function createDraftInvoice(req: Request, res: Response) {
  const data = parseBody(createSchema, req.body);
  const invoice = await invoicesService.createDraftInvoice(req.actor!, data);
  res.status(201).json(invoice);
}

export async function listInvoices(req: Request, res: Response) {
  const { caseId, clientId, status, paymentStatus } = req.query as Record<string, string | undefined>;
  const validPaymentStatus =
    paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
      ? (paymentStatus as PaymentStatus)
      : undefined;
  const invoices = await invoicesService.listInvoices({ caseId, clientId, status, paymentStatus: validPaymentStatus });
  res.json(invoices);
}

export async function getInvoice(req: Request, res: Response) {
  const invoice = await invoicesService.getInvoice(req.params.id);
  res.json(invoice);
}

/** Gated by BILLING.VIEW (same as getInvoice) — the PDF is just an alternate
 * representation of already-viewable invoice data, not a distinct capability. */
export async function getInvoicePdf(req: Request, res: Response) {
  const invoice = await invoicesService.getInvoice(req.params.id);
  const firmProfile = await firmProfileService.getFirmProfile();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  streamInvoicePdf(res, invoice, firmProfile);
}

export async function approveInvoice(req: Request, res: Response) {
  const invoice = await invoicesService.approveInvoice(req.actor!, req.params.id);
  res.json(invoice);
}

export async function sendInvoice(req: Request, res: Response) {
  const invoice = await invoicesService.sendInvoice(req.actor!, req.params.id);
  res.json(invoice);
}

const paymentSchema = z.object({ amount: z.number().positive(), method: z.string().optional() });

export async function recordPayment(req: Request, res: Response) {
  const data = parseBody(paymentSchema, req.body);
  const payment = await invoicesService.recordPayment(req.actor!, req.params.id, data);
  res.status(201).json(payment);
}

const editInvoiceSchema = z.object({
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

/** ACCOUNTS module (2026-08-14, §23) — DRAFT-only edit/delete. */
export async function editInvoice(req: Request, res: Response) {
  const data = parseBody(editInvoiceSchema, req.body);
  const invoice = await invoicesService.editInvoice(req.actor!, req.params.id, data);
  res.json(invoice);
}

export async function deleteInvoice(req: Request, res: Response) {
  await invoicesService.deleteInvoice(req.actor!, req.params.id);
  res.status(204).send();
}
