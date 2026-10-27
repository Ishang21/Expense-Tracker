import { createHash } from "node:crypto";
import type { Queryable } from "../server/db";
import { readMigrations } from "./migrations";

/** One locked transaction: either every pending migration and its history commit, or none. */
export async function migrateDatabase(client: Queryable, migrations = readMigrations()): Promise<string[]> {
  const names = migrations.map((m) => m.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate migration names.");
  const checksums = new Map(migrations.map((m) => [m.name, createHash("sha256").update(m.sql).digest("hex")]));
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('expense-tracker:migrations'))");
    const history = await client.query<{ history: string | null }>("SELECT to_regclass('public._schema_migrations')::text AS history");
    if (!history.rows[0]?.history) {
      const existing = await client.query<{ existing: string | null }>("SELECT to_regclass('public.users')::text AS existing");
      if (existing.rows[0]?.existing) throw new Error("Application tables exist without migration history. Use a fresh database; refusing to replay migrations.");
    }
    await client.query(`CREATE TABLE IF NOT EXISTS _schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM _schema_migrations ORDER BY name");
    for (const row of applied.rows) {
      if (checksums.get(row.name) !== row.checksum) throw new Error(`Migration ${row.name} is missing or changed. Restore it and add a new numbered migration.`);
    }
    const done = new Set(applied.rows.map((row) => row.name));
    const pending = migrations.filter((m) => !done.has(m.name));
    if (pending.some((m) => applied.rows.some((row) => row.name > m.name))) throw new Error("A new migration sorts before an applied migration. Use the next number.");
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query("INSERT INTO _schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, checksums.get(migration.name)]);
    }
    await client.query("COMMIT");
    return pending.map((m) => m.name);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
