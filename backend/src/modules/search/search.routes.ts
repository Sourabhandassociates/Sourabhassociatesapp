import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireStaff } from "../../middleware/rbac";
import { attachEffectivePermissions } from "../../middleware/permissions";
import * as searchController from "./search.controller";

/** Mounted at /api/search — no requirePermission gate on the route itself: every
 * staff member can search, and each result category is scoped internally
 * (search.service.ts) using the same row-level rules as its own module, so a search
 * can never surface something the actor couldn't already reach directly. */
export const searchRouter = Router();
searchRouter.use(requireAuth, requireStaff, attachEffectivePermissions);
searchRouter.get("/", searchController.search);
searchRouter.get("/recent", searchController.recentSearches);
