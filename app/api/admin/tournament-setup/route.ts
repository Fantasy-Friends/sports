import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Bootstraps a tournament pool that has no entrants yet (e.g. a new major like
// the U.S. Open). Copies the roster from an existing sibling pool and creates
// the tournament_meta row so the rest of the admin UI has something to manage.
//
// Auth note: the target pool is empty, so we cannot authenticate against it —
// getAuthenticatedEntrant resolves the caller cross-pool by person_key and there
// is no row for them in the target yet. We authenticate against the SOURCE pool
// instead: you may only copy a roster out of a pool you administer.

export const dynamic = "force-dynamic";

// Round par per major. Mirrors defaultRoundParForTournament in app/admin/page.tsx
// (the value the live score sync uses), so net scoring stays consistent.
function defaultRoundParForTournament(slug: string) {
  switch (slug) {
    case "masters":
      return 72;
    case "the-open":
      return 71;
    case "pga-championship":
    case "us-open":
    default:
      return 70;
  }
}

type SourceEntrantRow = {
  entrant_name: string;
  entrant_slug: string;
  person_key: string | null;
  is_admin: boolean;
  draft_position: number | null;
};

export async function POST(req: Request) {
  let body: { pool_id?: string; tournament_slug?: string; source_pool_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetPoolId = body.pool_id?.trim();
  const tournamentSlug = body.tournament_slug?.trim();
  const explicitSource = body.source_pool_id?.trim();

  if (!targetPoolId || !tournamentSlug) {
    return NextResponse.json(
      { error: "pool_id and tournament_slug are required." },
      { status: 400 },
    );
  }

  try {
    // Don't clobber an already-configured pool.
    const { count: targetEntrantCount, error: targetCountError } = await supabaseAdmin
      .from("draft_entrants")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", targetPoolId);

    if (targetCountError) {
      return NextResponse.json({ error: targetCountError.message }, { status: 500 });
    }
    if ((targetEntrantCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "This pool already has entrants. Setup only runs on an empty pool." },
        { status: 409 },
      );
    }

    // Resolve the source pool to copy from. Default: the most-populated sibling
    // pool sharing the same base prefix (e.g. "2026-majors-").
    let sourcePoolId = explicitSource ?? null;
    if (!sourcePoolId) {
      const base = targetPoolId.replace(new RegExp(`-${tournamentSlug}$`), "");
      const { data: siblingRows, error: siblingError } = await supabaseAdmin
        .from("draft_entrants")
        .select("pool_id")
        .like("pool_id", `${base}-%`)
        .neq("pool_id", targetPoolId);

      if (siblingError) {
        return NextResponse.json({ error: siblingError.message }, { status: 500 });
      }

      const counts = new Map<string, number>();
      for (const row of (siblingRows ?? []) as Array<{ pool_id: string }>) {
        counts.set(row.pool_id, (counts.get(row.pool_id) ?? 0) + 1);
      }
      sourcePoolId =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }

    if (!sourcePoolId) {
      return NextResponse.json(
        { error: "No existing pool with entrants was found to copy from." },
        { status: 400 },
      );
    }

    // Authenticate + authorize against the source pool.
    const session = await getAuthenticatedEntrant(sourcePoolId);
    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated for the source pool." },
        { status: 401 },
      );
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: sourceEntrants, error: sourceError } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_name, entrant_slug, person_key, is_admin, draft_position")
      .eq("pool_id", sourcePoolId)
      .order("draft_position", { ascending: true, nullsFirst: false })
      .order("entrant_name", { ascending: true });

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }
    if (!sourceEntrants || sourceEntrants.length === 0) {
      return NextResponse.json(
        { error: "The source pool has no entrants to copy." },
        { status: 400 },
      );
    }

    // Fresh roster for the new tournament: no draft positions (the lottery
    // assigns them), no auto-draft, and access codes intentionally invalid until
    // the commissioner regenerates them. person_key + is_admin carry over so the
    // same humans — and the commissioner — resolve into the new pool.
    const rows = (sourceEntrants as SourceEntrantRow[]).map((entrant) => ({
      pool_id: targetPoolId,
      entrant_name: entrant.entrant_name,
      entrant_slug: entrant.entrant_slug,
      person_key: entrant.person_key ?? entrant.entrant_slug,
      is_admin: entrant.is_admin,
      draft_position: null,
      auto_draft_enabled: false,
      access_code_hash: "imported-pending-reset",
    }));

    const { error: insertError } = await supabaseAdmin
      .from("draft_entrants")
      .upsert(rows, { onConflict: "pool_id,entrant_slug", ignoreDuplicates: true });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: metaError } = await supabaseAdmin.from("tournament_meta").upsert(
      {
        pool_id: targetPoolId,
        tournament_slug: tournamentSlug,
        round_count: 4,
        round_par: defaultRoundParForTournament(tournamentSlug),
        draft_open: false,
      },
      { onConflict: "pool_id,tournament_slug", ignoreDuplicates: true },
    );

    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pool_id: targetPoolId,
      tournament_slug: tournamentSlug,
      source_pool_id: sourcePoolId,
      entrants_copied: rows.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to set up tournament pool.") },
      { status: 500 },
    );
  }
}
