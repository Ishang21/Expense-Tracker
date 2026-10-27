// Local access to the deployed backend configuration: Neon + real Firebase sign-in.
// Uses only ignored environment variables; no emulator accounts or automatic migrations.
import { serve } from "@hono/node-server";
import { createBackend } from "../server/backend.js";
import { productionApp, productionDb } from "../server/production.js";

const db = productionDb();
try {
  const schema = await db.query("SELECT name FROM _schema_migrations WHERE name = '0004_request_rate_limits'");
  if (schema.rows.length !== 1) throw new Error("Application migrations are missing.");
} catch {
  console.error("Cannot reach the Neon application schema. Check .env.local and run npm run db:migrate.");
  process.exit(1);
}

// The server binds to loopback only; local clients share one request-limit bucket.
const backend = createBackend(productionApp(), () => db, () => "127.0.0.1");
serve({ fetch: backend.fetch, port: 8789, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`Neon API on http://127.0.0.1:${port}/api and MCP on /mcp (real Firebase sign-in)`);
});
