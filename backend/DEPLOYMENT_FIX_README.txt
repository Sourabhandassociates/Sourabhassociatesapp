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
