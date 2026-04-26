import { createClient } from "@supabase/supabase-js";

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

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");

// Client-side (uses anon key)
export const supabase = createClient(
  SUPABASE_URL,
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
);

// Server-side (uses service role). Only referenced from server code; fails fast
// with a clear message instead of creating a broken client.
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);
