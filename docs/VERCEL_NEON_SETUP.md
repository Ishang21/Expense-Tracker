# Deploy Expense Tracker on Vercel + Neon

One Vercel project serves the Vite frontend, `/api/*`, `/mcp`, and `/mcp/<key>`.
Neon provides PostgreSQL. Firebase remains responsible only for sign-in.
Production comes from `Ishang21/Expense-Tracker`, branch **master**.

## 1. Create a fresh Neon project

Create a project in the [Neon Console](https://console.neon.tech). Choose a region close
to the Vercel function region. No old Netlify data is imported or deleted.

In **Connect**, copy two strings for the same endpoint, branch and database:

| Variable | Connection pooling | Used by |
|---|---|---|
| `DATABASE_URL` | On (`-pooler` hostname) | Runtime requests |
| `DATABASE_URL_UNPOOLED` (or `DIRECT_DATABASE_URL`) | Off | Schema migrations |

Use the TLS settings in Neon's generated URLs. Keep these values server-only. Never use
`VITE_DATABASE_URL`, commit real secrets, or paste connection strings into a connector URL.
`.env.example` contains placeholders; `.env.local` is ignored and used by local migrations.

## 2. Import the repository into Vercel

Import `Ishang21/Expense-Tracker` into a Vercel project:

- Framework: **Vite**.
- Root directory: repository root.
- Production branch: **master** (Project Settings → Environments → Production / Branch Tracking).
- Node.js: **24.x**.
- Build command: **npm run deploy:build**.
- Output directory: **dist**.
- Install command: **npm ci**.

`vercel.json` supplies routing, a 60-second function duration and security headers. It
routes API/MCP requests before the SPA fallback, so an API error is never a frontend page.
Do not add a separate catch-all rewrite above those routes.

Set Production environment variables:

```text
DATABASE_URL=<Neon pooled URL>
DATABASE_URL_UNPOOLED=<same database's direct URL>
FIREBASE_PROJECT_ID=expense-tracker-d9d44
```

The migration command accepts Neon's `DATABASE_URL_UNPOOLED` name. Existing
`DIRECT_DATABASE_URL` configurations continue to work and take precedence if both are set.

The Firebase project ID has an existing code default. If you change the Firebase project,
update `shared/config.ts` and its CSP domains as well as the environment variable.

The deploy build first runs the complete credential-free `npm run ci`, then `npm run db:migrate`.
Migrations run in one transaction with a PostgreSQL advisory lock and stored SHA-256 checksums.
Re-running skips completed migrations; changed, missing or out-of-order applied files fail.
A database with existing app tables but no migration history is refused. Initialization is
for the fresh Neon database chosen for this deployment, not an automatic data migration.
A migration failure blocks publication. The runtime never runs schema migrations on requests.

The first deployment creates users/spaces/expenses/groups/key tables and shared request
rate-limit counters. Existing Firebase accounts are resolved into users on first sign-in;
there are initially no spaces, expenses or personal keys.

## 3. Keep previews separate

For Preview environment variables, use **a separate Neon branch**, with both URLs pointing
to that preview branch. Do not copy production URLs into Preview or Development.
Vercel can then initialize/update that branch with the same build command. Production and
preview URL mismatches are not detected automatically across environments: configure them
explicitly in Vercel. The migration CLI verifies that each environment's pooled/direct URLs target the same
endpoint and database.

Neon branches are not created/deleted automatically by this repository. Set them up before
enabling preview builds. Use a development Neon branch for `vercel dev` too.

## 4. Firebase and external connectors

In Firebase Console → Authentication → Settings → Authorized domains, add your production
Vercel/custom domain. Add any preview domain on which you want real sign-in. Keep Google
and email/password providers enabled. A host must be authorized before Google popup sign-in.

Sign in on the new site, create a space and then create new personal keys under
Settings → iPhone & AI apps. Use the complete connector address displayed by that domain:

```text
https://YOUR-DOMAIN/mcp/et_YOUR_KEY
```

Old keys live in the old database and cannot authenticate to the fresh Neon database.
Update the site address in iPhone Shortcuts too. Keep connector URLs private.

MCP clients must reach the deployment directly. If Vercel Deployment Protection intercepts
requests, select a deployment/access configuration that permits your intended MCP clients;
Firebase/personal-key authentication must still remain enforced by the application.

## 5. Request limits and verification

The public backend uses atomic PostgreSQL counters shared by all Vercel instances:

- API: 300 requests per IP per minute.
- MCP: 120 requests per IP per minute.
- Limits return 429 and `Retry-After`; counters contain hashes of provider-reported IPs.
- In-process MCP calls do not count twice. Stale counter rows are pruned during traffic.
- Vercel's platform firewall is additional protection. Database-backed limits incur a small
  query per credential-bearing public request, including when the limit is exceeded.

After deployment:

1. Open the site and verify static JS/CSS load and Docs anchors work after reload.
2. Verify `/api/me` without credentials returns JSON 401, not HTML.
3. Sign in, create a space, add/edit an expense, check balances, and record a payment.
4. Verify a non-owner cannot change membership/settings and an outsider cannot read the space.
5. Create a key and connect an MCP client. Verify all 11 tools, read/write behavior, and revocation.
6. Check a second `npm run db:migrate` is a no-op against the intended branch.
7. Confirm the Vercel deployment source is `master` and the configured database is the intended branch.

Local verification without any cloud credentials:

```bash
npm ci
npm run ci
npm run dev:local
```

`dev:local` uses PGlite and the Firebase emulator. It never connects to Neon. Cloud smoke
tests, Google popup sign-in, real TLS connections, and provider routing must also be checked
on the actual deployment; passing in-process tests is not proof of those behaviors.

To use the configured Neon branch with real Firebase locally, put its pooled and direct
URLs in ignored `.env.local`, run `npm run db:migrate`, then `npm run dev:neon`. Open
http://localhost:5173. This mode uses the same backend as Vercel and binds the API/MCP
listener to `127.0.0.1:8789`; it does not require Vercel authentication. Sign in with a real
Firebase account, not the emulator-only `test@gmail.com` fixture.

References: [Vercel Functions](https://vercel.com/docs/functions),
[Vite routing](https://vercel.com/docs/frameworks/frontend/vite),
[pool lifecycle](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool),
[Neon pooling](https://neon.com/docs/connect/connection-pooling).
