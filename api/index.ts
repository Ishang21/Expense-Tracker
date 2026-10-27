// One Node.js function serves /api/* and /mcp*. The frontend is served from Vercel's CDN.
import { ipAddress } from "@vercel/functions";
import { createBackend } from "../server/backend.js";
import { productionApp, productionDb } from "../server/production.js";

const backend = createBackend(productionApp(), productionDb, (req) => ipAddress(req) ?? "unknown");
export default { fetch: (request: Request) => backend.fetch(request) };
