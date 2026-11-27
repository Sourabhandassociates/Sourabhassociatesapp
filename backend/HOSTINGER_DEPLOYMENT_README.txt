SOURABH & ASSOCIATES BACKEND - HOSTINGER PACKAGE

Changes in this package:
- Cause List default permission is enabled for Associate, disabled for Junior Associate.
- Removed node_modules from the ZIP to reduce size and avoid OS-specific binaries.
- Kept source, Prisma schema/migrations, package-lock.json, and existing dist build files.

Hostinger deployment:
1. Upload/extract this backend folder.
2. In the backend directory, run: npm ci
3. Run: npm run build
4. Start the app using: npm start

Required environment variables (configure in Hostinger, do not put secrets in ZIP):
- DATABASE_URL
- JWT_ACCESS_SECRET
- JWT_REFRESH_SECRET
- MFA_ENCRYPTION_KEY
- NODE_ENV=production
- CORS_ORIGIN (frontend domain)
- PORT (Hostinger assigned port, if required by the hosting panel)

Prisma generation/build must be run on Hostinger's Linux environment so the correct Prisma engine is generated.
Note: Existing permission rows in the production database are not automatically changed by this source default. If Cause List is currently granted to Junior Associate in the database, revoke it through Permission Management.
