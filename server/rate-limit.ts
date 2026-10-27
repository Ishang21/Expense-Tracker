import { createHash } from "node:crypto";
import type { Queryable } from "./db.js";

export async function takeRateLimit(db: Queryable, scope: "api" | "mcp", ip: string) {
  const limit = scope === "mcp" ? 120 : 300;
  const key = `${scope}:${createHash("sha256").update(ip).digest("hex")}`;
  const result = await db.query<{ hits: number; retry_after: number }>(`
    INSERT INTO request_rate_limits (bucket_key, window_start, hits)
    VALUES ($1, date_trunc('minute', statement_timestamp()), 1)
    ON CONFLICT (bucket_key) DO UPDATE SET
      hits = CASE WHEN request_rate_limits.window_start = EXCLUDED.window_start
                  THEN LEAST(request_rate_limits.hits + 1, $2 + 1) ELSE 1 END,
      window_start = EXCLUDED.window_start, updated_at = statement_timestamp()
    RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM
      window_start + interval '1 minute' - statement_timestamp())))::integer AS retry_after`, [key, limit]);
  const row = result.rows[0]!;
  // Bound stale storage without an external cron service. At most one cleanup per IP/window.
  if (Number(row.hits) === 1) {
    await db.query(`DELETE FROM request_rate_limits WHERE bucket_key IN (
      SELECT bucket_key FROM request_rate_limits
      WHERE updated_at < now() - interval '1 day' ORDER BY updated_at LIMIT 100
    )`).catch(() => console.warn("Rate-limit cleanup could not complete."));
  }
  return { allowed: Number(row.hits) <= limit, retryAfter: Number(row.retry_after) };
}
