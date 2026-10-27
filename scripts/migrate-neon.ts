import { Client } from "pg";
import { migrateDatabase } from "./migrate-database";

async function main() {
  if (process.env.VERCEL && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Vercel deployments.");
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DIRECT_DATABASE_URL or DATABASE_URL_UNPOOLED is required. Use the direct connection string for the target Neon branch.");
  const direct = new URL(connectionString);
  if (direct.hostname.includes("-pooler.")) throw new Error("DIRECT_DATABASE_URL must use Neon's direct endpoint, not its pooler.");
  if (process.env.DATABASE_URL) {
    const runtime = new URL(process.env.DATABASE_URL);
    if (runtime.hostname.replace("-pooler.", ".") !== direct.hostname || runtime.pathname !== direct.pathname) {
      throw new Error("DATABASE_URL and DIRECT_DATABASE_URL must target the same Neon endpoint and database.");
    }
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
  try {
    await client.connect();
    const applied = await migrateDatabase({ query: (text, params) => client.query(text, params) as never });
    console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date.");
  } finally { await client.end(); }
}

main().catch((error: unknown) => {
  // Do not print connection strings or database error detail containing user data.
  console.error(error instanceof Error && /^(DIRECT_DATABASE_URL|DATABASE_URL|Application tables|Migration |A new migration|Duplicate migration)/.test(error.message)
    ? error.message : "Database migration failed. Check the target connection, database availability, and migration SQL.");
  process.exitCode = 1;
});
