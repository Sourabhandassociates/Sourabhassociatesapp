import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions, requirePermission } from "../../middleware/permissions";
import { upload } from "../documents/storage";
import * as accountsController from "./accounts.controller";

/** Mounted at /api/accounts. Every route below requireStaff-gated first (identical
 * shape to expenses.routes.ts/invoices.routes.ts), so a CLIENT actor is structurally
 * rejected before any ACCOUNTS.* permission check even runs — §26's "Clients must
 * NEVER have access to Accounts" is enforced here independent of and prior to the
 * permission system. */
export const accountsRouter = Router();
accountsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);

// No permission gate — this is the endpoint that tells the frontend which of the 14
// flags the actor holds, so it must be reachable by anyone who might hold none of
// them (a user with zero Accounts access must still get {view:false, ...}, not a 403).
accountsRouter.get("/permissions", accountsController.getMyAccountsPermissions);

accountsRouter.get("/dashboard", requirePermission("ACCOUNTS.VIEW"), accountsController.getDashboard);
accountsRouter.get("/overdue", requirePermission("ACCOUNTS.VIEW"), accountsController.listOverdue);
accountsRouter.get("/due-soon", requirePermission("ACCOUNTS.VIEW"), accountsController.listDueSoon);

accountsRouter.get("/clients/search", requirePermission("ACCOUNTS.VIEW"), accountsController.searchClients);
accountsRouter.get("/clients/:clientId/summary", requirePermission("ACCOUNTS.VIEW"), accountsController.getClientSummary);
accountsRouter.get("/cases/search", requirePermission("ACCOUNTS.VIEW"), accountsController.searchCases);
accountsRouter.get("/cases/:caseId/summary", requirePermission("ACCOUNTS.VIEW"), accountsController.getCaseSummary);

accountsRouter.get("/fees", requirePermission("ACCOUNTS.VIEW"), accountsController.listFees);
accountsRouter.post("/fees", requirePermission("ACCOUNTS.MANAGE_FEE"), accountsController.createFee);
accountsRouter.patch("/fees/:id", requirePermission("ACCOUNTS.MANAGE_FEE"), accountsController.updateFee);
accountsRouter.delete("/fees/:id", requirePermission("ACCOUNTS.MANAGE_FEE"), accountsController.deleteFee);

accountsRouter.get("/payments", requirePermission("ACCOUNTS.VIEW"), accountsController.listPayments);
/**
 * Payment receipt permission fix (2026-08-15). CREATE_PAYMENT alone must be able to
 * attach a receipt *at creation time* — this route now accepts multipart form data
 * (an optional "file" part) so the payment and its initial receipt are created in one
 * request, gated solely by ACCOUNTS.CREATE_PAYMENT. `upload.single` no-ops on a plain
 * JSON request (it only intercepts multipart/form-data bodies), so this is fully
 * backward compatible with a JSON-only create (no file).
 */
accountsRouter.post(
  "/payments",
  requirePermission("ACCOUNTS.CREATE_PAYMENT"),
  upload.single("file"),
  accountsController.createPayment
);
accountsRouter.patch("/payments/:id", requirePermission("ACCOUNTS.EDIT_PAYMENT"), accountsController.updatePayment);
accountsRouter.delete("/payments/:id", requirePermission("ACCOUNTS.DELETE_PAYMENT"), accountsController.deletePayment);
/** Replacing/attaching a receipt on an EXISTING payment is an edit, not a create —
 * stays EDIT_PAYMENT-gated. (Creation-time receipt attachment above no longer uses
 * this route; it happens inline within POST /payments, gated by CREATE_PAYMENT only.) */
accountsRouter.post(
  "/payments/:id/receipt",
  requirePermission("ACCOUNTS.EDIT_PAYMENT"),
  upload.single("file"),
  accountsController.attachPaymentReceipt
);

accountsRouter.get("/expenses", requirePermission("ACCOUNTS.VIEW_EXPENSES"), accountsController.listExpenses);
/** §9 — the optional receipt/bill upload happens in the same request as create,
 * gated solely by ACCOUNTS.CREATE_EXPENSE, matching the payment-receipt fix's
 * shape (upload.single no-ops on a plain JSON body, so a General/Firm expense's
 * JSON-only create is unaffected). */
accountsRouter.post(
  "/expenses",
  requirePermission("ACCOUNTS.CREATE_EXPENSE"),
  upload.single("file"),
  accountsController.createExpense
);
accountsRouter.patch("/expenses/:id", requirePermission("ACCOUNTS.EDIT_EXPENSE"), accountsController.updateExpense);
accountsRouter.delete("/expenses/:id", requirePermission("ACCOUNTS.DELETE_EXPENSE"), accountsController.deleteExpense);
accountsRouter.post(
  "/expenses/:id/receipt",
  requirePermission("ACCOUNTS.EDIT_EXPENSE"),
  upload.single("file"),
  accountsController.attachExpenseReceipt
);

accountsRouter.get("/invoices", requirePermission("ACCOUNTS.VIEW_INVOICE"), accountsController.listInvoices);

accountsRouter.get("/reports/types", requirePermission("ACCOUNTS.VIEW_REPORTS"), accountsController.listAccountsReportTypes);
accountsRouter.get("/reports/:type", requirePermission("ACCOUNTS.VIEW_REPORTS"), accountsController.getAccountsReport);

/** Mounted at /api/cases/:caseId/accounts — mergeParams, mirrors caseExpensesRouter's
 * shape. §21/§22 — the Case → Accounts tab's single aggregate payload.
 *
 * Case Section Access (2026-08-17) — CASE_ACCOUNTS.VIEW is an additional gate on
 * top of, never a substitute for, ACCOUNTS.VIEW: reaching the Case → Accounts tab
 * now requires BOTH the Case-section permission AND the existing Accounts
 * authorization, exactly as that feature's spec §8 requires ("the user must have
 * CASE_ACCOUNTS.VIEW AND the existing relevant Accounts authorization"). */
export const caseAccountsRouter = Router({ mergeParams: true });
caseAccountsRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
caseAccountsRouter.get(
  "/",
  requirePermission("CASE_ACCOUNTS.VIEW"),
  requirePermission("ACCOUNTS.VIEW"),
  accountsController.getCaseAccountsTabData
);

/**
 * Mounted at /api/cases/:caseId/billing-expenses — mergeParams. Case Section
 * Access + Simplified Case Expense Entry (2026-08-17). A dedicated, additive,
 * case-scoped surface for the "Cases → Case → Billing / Expenses → Add Expense"
 * quick workflow — deliberately NOT a repoint of the pre-existing
 * `/api/cases/:caseId/expenses` (expenses.routes.ts, still fully intact and
 * covered by its own existing tests) and NOT the firm-wide `/api/accounts/expenses`
 * (which also serves General/Client-level expense creation from the Accounts
 * module UI, unrelated to any one case — adding a per-case gate there would
 * incorrectly restrict that separate flow). Thin wrappers around
 * accountsService.listAccountsExpenses/createAccountsExpense purely for their
 * correct data shape (description field, incurredById derivation, case-scope
 * validation) — reusing those functions is an implementation detail, NOT an
 * authorization decision.
 *
 * Authorization correction (2026-08-17, follow-up) — Billing/Expenses and
 * Accounts are deliberately kept as two independent security domains, per the
 * Managing Partner's explicit instruction: viewing/creating a case expense here
 * must never require any ACCOUNTS.* permission. Gated by CASE_BILLING_EXPENSES.VIEW
 * (the Case-section gate) composed with the pre-existing, general-purpose
 * EXPENSES.VIEW/EXPENSES.CREATE keys (Milestone 2) — the same "existing
 * appropriate Expense permission" the original Case → Billing → Expenses flow
 * already used, and the same composition pattern already used for this tab's
 * Time Logs sub-section (CASE_BILLING_EXPENSES.VIEW + TIMELOGS.*). Editing/
 * deleting a case expense (however created) reuses the pre-existing, unmodified
 * `PATCH/DELETE /api/expenses/:id` routes (expenses.routes.ts) — EXPENSES.EDIT/
 * EXPENSES.DELETE-gated, and already generic enough (via existing.caseId!) to
 * operate correctly on a row created through this endpoint, so no new edit/
 * delete route was needed. A case expense still automatically counts toward
 * Accounts → Expenses / Total Expenses / Profit purely because every Accounts
 * aggregate reads the whole Expense table unconditionally (unchanged, established
 * precedent) — that data-layer fact is completely independent of which
 * permission gated its creation.
 */
export const caseBillingExpensesRouter = Router({ mergeParams: true });
caseBillingExpensesRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
caseBillingExpensesRouter.get(
  "/expenses",
  requirePermission("CASE_BILLING_EXPENSES.VIEW"),
  requirePermission("EXPENSES.VIEW"),
  accountsController.listCaseBillingExpenses
);
caseBillingExpensesRouter.post(
  "/expenses",
  requirePermission("CASE_BILLING_EXPENSES.VIEW"),
  requirePermission("EXPENSES.CREATE"),
  accountsController.createCaseBillingExpense
);
