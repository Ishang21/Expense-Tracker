import type { Db } from "./db.js";
import { createMcpApp } from "./mcp.js";
import { takeRateLimit } from "./rate-limit.js";

type Api = { fetch(request: Request): Response | Promise<Response> };

/** Public routing only: MCP's internal API calls retain the ordinary API validation. */
export function createBackend(api: Api, db: () => Db, clientIp: (req: Request) => string) {
  const mcp = createMcpApp(api);
  return {
    async fetch(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      const isMcp = path === "/mcp" || path.startsWith("/mcp/");
      if (!isMcp && path !== "/api" && !path.startsWith("/api/")) {
        return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
      }
      const handler = isMcp ? mcp : api;
      // Missing credentials and MCP preflight requests can be answered without a DB connection.
      const hasKey = request.headers.has("authorization") || (isMcp && /^\/mcp\/et_[A-Za-z0-9_-]+$/.test(path));
      if (request.method === "OPTIONS" || !hasKey) return handler.fetch(request);
      try {
        const limit = await takeRateLimit(db(), isMcp ? "mcp" : "api", clientIp(request));
        if (!limit.allowed) return failure(isMcp, path, 429, "rate_limited", "Too many requests. Try again shortly.", limit.retryAfter);
        return await handler.fetch(request);
      } catch {
        console.error("The deployed backend could not complete a request.");
        return failure(isMcp, path, 503, "unavailable", "The service is temporarily unavailable. Please try again.");
      }
    },
  };
}

function failure(mcp: boolean, path: string, status: number, code: string, message: string, retryAfter?: number) {
  const headers: Record<string, string> = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  if (mcp) {
    headers["Access-Control-Allow-Origin"] = "*";
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });
  }
  return Response.json({ error: { code, message }, ...(path.startsWith("/api/quick/") ? { message } : {}) }, { status, headers });
}
