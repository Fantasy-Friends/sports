import { createClient } from "@supabase/supabase-js";

// Literal property access is required so Next.js can statically inline
// NEXT_PUBLIC_* values into the browser bundle at build time.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
