-- Enable Associate and Junior Associate access to Cause List and task workflows.
-- Only the targeted role-permission rows are changed.
UPDATE "RolePermission" rp
SET "granted" = TRUE
FROM "Permission" p
WHERE rp."permissionId" = p."id"
  AND rp."role" IN ('ASSOCIATE', 'JUNIOR_ASSOCIATE')
  AND p."key" IN ('CAUSE_LIST.VIEW', 'TASKS.CREATE', 'TASKS.ASSIGN', 'CASE_TASKS.VIEW');
