import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import * as invoicesController from "./invoices.controller";

/** Mounted at /api/invoices */
export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

invoicesRouter.post("/", requirePermission("BILLING.CREATE_DRAFT"), invoicesController.createDraftInvoice);
invoicesRouter.get("/", requirePermission("BILLING.VIEW"), invoicesController.listInvoices);
invoicesRouter.get("/:id", requirePermission("BILLING.VIEW"), invoicesController.getInvoice);
invoicesRouter.get("/:id/pdf", requirePermission("BILLING.VIEW"), invoicesController.getInvoicePdf);
invoicesRouter.patch("/:id/approve", requirePermission("BILLING.APPROVE"), invoicesController.approveInvoice);
invoicesRouter.patch("/:id/send", requirePermission("BILLING.APPROVE"), invoicesController.sendInvoice);
invoicesRouter.post(
  "/:id/payments",
  requirePermission("BILLING.RECORD_PAYMENT"),
  invoicesController.recordPayment
);
/** ACCOUNTS module (2026-08-14, §23) — new capability, gated solely by the new
 * Accounts keys (no prior BILLING.* gate existed for edit/delete since neither
 * action existed before). */
invoicesRouter.patch("/:id", requirePermission("ACCOUNTS.EDIT_INVOICE"), invoicesController.editInvoice);
invoicesRouter.delete("/:id", requirePermission("ACCOUNTS.DELETE_INVOICE"), invoicesController.deleteInvoice);
