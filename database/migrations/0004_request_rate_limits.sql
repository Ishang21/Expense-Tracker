-- Shared fixed-window rate limits for public API/MCP requests across Vercel instances.
-- Keys contain a SHA-256 hash of the provider-reported client IP, never the raw address.
CREATE TABLE request_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_rate_limits_updated_idx ON request_rate_limits (updated_at);
