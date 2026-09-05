import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createDraftSession, DRAFT_SESSION_COOKIE } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

// DEV-ONLY sign-in shortcut.
//
// Google OAuth can't complete on localhost (the redirect URI points at the
// deployed site), which otherwise locks the whole app behind the sign-in page
// during local development. This route mints a real draft session for an
// existing entrant — the exact same mechanism the Google callback uses — and
// sets the session cookie, so `npm run dev` is usable without OAuth.
//
// Hard-gated to non-production: on Vercel (NODE_ENV=production) it 404s and can
// never issue a session. Nothing imports it; it's reachable only by URL in dev.
//
//   /api/dev/login                → sign in as the default admin ("dusty")
//   /api/dev/login?person=<key>   → sign in as a specific person_key
//   /api/dev/login?slug=<slug>    → sign in as a specific entrant_slug
//   /api/dev/login?returnTo=/pickem  → where to land afterward (default "/")
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const person = params.get("person") ?? (params.get("slug") ? null : "dusty");
    const slug = params.get("slug");
    const returnTo = params.get("returnTo") || "/";

    let query = supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, pool_id, entrant_slug, entrant_name, person_key, is_admin")
      .limit(1);

    if (slug) query = query.eq("entrant_slug", slug);
    else if (person) query = query.eq("person_key", person);

    // Prefer an admin row when multiple match (stable, and can reach /admin).
    const { data, error } = await query.order("is_admin", { ascending: false });
    if (error) throw new Error(error.message);

    const entrant = data?.[0];
    if (!entrant) {
      const { data: all } = await supabaseAdmin
        .from("draft_entrants")
        .select("entrant_slug, entrant_name, person_key, pool_id")
        .order("entrant_name");
      return NextResponse.json(
        {
          error: `No entrant matched ${slug ? `slug=${slug}` : `person=${person}`}.`,
          hint: "Try /api/dev/login?slug=<entrant_slug> with one of the below.",
          available: all ?? [],
        },
        { status: 404 },
      );
    }

    const session = await createDraftSession(entrant.pool_id, entrant.entrant_id);
    const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
    response.cookies.set(DRAFT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // dev only — always http://localhost
      path: "/",
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Dev login failed") },
      { status: 500 },
    );
  }
}
