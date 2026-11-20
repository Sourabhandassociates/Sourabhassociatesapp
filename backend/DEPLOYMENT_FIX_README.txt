S&A BACKEND - CORRECTED BUILD

WHAT WAS CHANGED
- Pinned TypeScript to 5.6.2 so the project uses the version already locked in package-lock.json.
- Kept CommonJS + Node module resolution, which is compatible with TypeScript 5.6.2 and this codebase.
- Added explicit Node.js type definitions in tsconfig.json.
- Changed the build script to: prisma generate && tsc
- Recompiled src/ into dist/. TypeScript compilation completed with 0 errors in the supplied environment.
- Hearing Calendar query selects caseType, courtNumber, and courtName.

IMPORTANT
- .env is intentionally NOT included. Keep your existing production .env file safe.
- node_modules is intentionally NOT included. Install dependencies from package-lock.json on the target environment.
- Do not upload node_modules_backup.
- Prisma Client generation needs a Prisma engine for the target operating system. Run the build on the Hostinger Linux environment (or build on Linux matching the Hostinger Node runtime), not by copying Windows Prisma engine binaries.

DEPLOYMENT
1. Back up the existing backend folder and database before deployment.
2. Extract this ZIP.
3. Preserve your existing production .env file and uploads folder contents.
4. Upload/replace src, dist, prisma, package.json, package-lock.json, tsconfig.json, and other project config files.
5. In the Hostinger backend terminal, run: npm ci
6. Run: npm run build
7. Confirm the command completes successfully.
8. Restart the Node.js application. Start command: npm start (node dist/server.js).

TESTING NOTE
- TypeScript compilation was verified successfully.
- The test runner could not start in the supplied Linux environment because the uploaded node_modules lacked the Linux-specific optional Rollup binary. Run npm ci on Hostinger/deployment environment, then npm test there.
- No database migrations were run and no production database data was changed.


ROLE PERMISSIONS - CAUSE LIST
-----------------------------
A separate CAUSE_LIST.VIEW permission has been added to the permission catalogue.
After deploying the backend, run the existing seed command against the production
DATABASE_URL to insert the new permission and its role defaults. The seed runs
idempotently and does not overwrite existing role-default edits.

Example (use the existing Managing Partner email and a safe password value):
  npm run seed -- --name "Managing Partner" --email "EXISTING_MP_EMAIL" --password "TEMPORARY_VALUE"

The permission defaults mirror HEARINGS.VIEW: Managing Partner, Associate,
Junior Associate, and Office Staff are granted; Accounts Team is denied.
Managing Partner can then adjust it in Role & Permissions > Role Defaults.

The Cause List API now enforces CAUSE_LIST.VIEW for list and PDF/Excel export.
The frontend sidebar and Cause List page read the current permission from
GET /api/hearings/cause-list/access.
