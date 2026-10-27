import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `npm run dev:local` (mode "offline") proxies /api and /mcp to scripts/local-api.ts.
// `npm run dev:neon` proxies to the same production backend running against Neon.
// `vercel dev` routes them to api/index.ts, so no proxy is needed there.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: mode === "offline" || mode === "neon"
    ? { proxy: {
        "/api": mode === "neon" ? "http://127.0.0.1:8789" : "http://127.0.0.1:8788",
        "/mcp": mode === "neon" ? "http://127.0.0.1:8789" : "http://127.0.0.1:8788",
      } }
    : {},
  build: { sourcemap: true },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
  },
}));
