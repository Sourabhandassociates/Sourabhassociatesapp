import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { clientsRouter } from "./modules/clients/clients.routes";
import { casesRouter } from "./modules/cases/cases.routes";
import { caseDocumentsRouter, documentsRouter } from "./modules/documents/documents.routes";
import { caseTasksRouter, tasksRouter } from "./modules/tasks/tasks.routes";
import { caseHearingsRouter, hearingsRouter } from "./modules/hearings/hearings.routes";
import { caseNotesRouter } from "./modules/caseNotes/caseNotes.routes";
import { picklistsRouter } from "./modules/picklists/picklists.routes";
import { recycleBinRouter } from "./modules/recycleBin/recycleBin.routes";
import { permissionsRouter } from "./modules/permissions/permissions.routes";
import { contactsRouter } from "./modules/contacts/contacts.routes";
import { caseTimeLogsRouter, timeLogsRouter } from "./modules/timeLogs/timeLogs.routes";
import { caseExpensesRouter, expensesRouter } from "./modules/expenses/expenses.routes";
import { invoicesRouter } from "./modules/invoices/invoices.routes";
import { accountsRouter, caseAccountsRouter, caseBillingExpensesRouter } from "./modules/accounts/accounts.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { searchRouter } from "./modules/search/search.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { dataImportRouter } from "./modules/dataImport/dataImport.routes";
import { firmProfileRouter } from "./modules/firmProfile/firmProfile.routes";
import { announcementsRouter } from "./modules/announcements/announcements.routes";
import { customFieldsRouter } from "./modules/customFields/customFields.routes";
import { auditLogRouter } from "./modules/auditLog/auditLog.routes";
import { clientPortalRouter } from "./modules/clientPortal/clientPortal.routes";
import { errorHandler } from "./middleware/errorHandler";
import { generalRateLimit } from "./middleware/rateLimit";
import { sanitizeBody } from "./middleware/sanitize";
import { runWithAuditContext } from "./utils/auditContext";
import { prisma } from "./config/prisma";

export const app = express();

// Trust the first hop proxy (e.g., a load balancer/reverse proxy in front of this API)
// so req.ip reflects the real client IP for rate limiting and security logging, not
// the proxy's own address. Harmless/no-op when there is no proxy (local dev).
app.set("trust proxy", 1);

app.use(
  helmet({
    // This API is a JSON/file-download service consumed cross-origin by the Web Admin
    // Portal (and, later, mobile apps) — Helmet's default same-origin resource policy
    // would block exactly that, so it's relaxed deliberately, not by oversight.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true, // required for the httpOnly refresh-token cookie (utils/cookies.ts)
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(sanitizeBody);
app.use(generalRateLimit);

/** Firm-wide audit trail expansion — establishes the AsyncLocalStorage context every
 * recordAuditLog() call reads to auto-fill ipAddress/sessionId, for every request
 * including pre-auth ones (login attempts still need an IP captured). See
 * utils/auditContext.ts. */
app.use((req, res, next) => runWithAuditContext({ ip: req.ip }, next));

/** Milestone 4 (Version 1.0 completion) — a real DB connectivity check rather than a
 * static "ok" (IMPROVEMENTS.md: "no evidence the API is actually reachable end-to-end
 * — it's a static stub, not a real check"). A failed query surfaces as 503, so an
 * orchestrator/load balancer can correctly treat "API process is up but DB is down" as
 * unhealthy, not healthy. */
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/cases", casesRouter);
app.use("/api/cases/:caseId/documents", caseDocumentsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/cases/:caseId/tasks", caseTasksRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/cases/:caseId/hearings", caseHearingsRouter);
app.use("/api/hearings", hearingsRouter);
app.use("/api/cases/:caseId/notes", caseNotesRouter);
app.use("/api/picklists", picklistsRouter);
app.use("/api/recycle-bin", recycleBinRouter);
app.use("/api/permissions", permissionsRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/cases/:caseId/time-logs", caseTimeLogsRouter);
app.use("/api/time-logs", timeLogsRouter);
app.use("/api/cases/:caseId/expenses", caseExpensesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/cases/:caseId/accounts", caseAccountsRouter);
app.use("/api/cases/:caseId/billing-expenses", caseBillingExpensesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/search", searchRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/data-import", dataImportRouter);
app.use("/api/firm-profile", firmProfileRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/custom-fields", customFieldsRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/client-portal", clientPortalRouter);

app.use(errorHandler);
