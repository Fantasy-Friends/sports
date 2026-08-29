import { createClient } from "@supabase/supabase-js";
import net from "node:net";

// Lambdas occasionally lose their IPv6 route; when DNS returns an AAAA record
// first, Node's fetch then fails instantly with "TypeError: fetch failed"
// instead of falling back to IPv4. Happy Eyeballs (autoSelectFamily) makes
// connect() race both families. Guarded: the setter exists on Node >= 19.4.
try {
  net.setDefaultAutoSelectFamily?.(true);
} catch {
  /* older runtime — nothing to do */
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env.local for local dev or the host's env config for production.`,
    );
  }
  return value;
}

// Retry ONLY network-level failures (fetch throwing — DNS/TLS/socket), never
// HTTP responses: supabase-js turns those thrown errors into
// { error: { message: "TypeError: fetch failed" } }, which broke sign-in
// whenever a lambda hit a transient egress blip. Reads and PostgREST writes
// in this app are idempotent upserts/updates or guarded inserts, and a thrown
// fetch means the request almost certainly never reached the server.
async function fetchWithNetworkRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

// Server-only. Never import this from a "use client" component.
export const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { global: { fetch: fetchWithNetworkRetry } },
);
