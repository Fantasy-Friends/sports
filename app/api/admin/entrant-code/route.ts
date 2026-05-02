import { NextResponse } from "next/server";
import { generateAccessCode, getAuthenticatedEntrant, hashSecret } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  let body: { pool_id?: string; entrant_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const entrantId = body.entrant_id?.trim();

  if (!poolId || !entrantId) {
    return NextResponse.json({ error: "pool_id and entrant_id are required." }, { status: 400 });
  }

  try {
    const session = await getAuthenticatedEntrant(poolId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated for this pool." }, { status: 401 });
    }
    if (!session.entrant.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: entrant, error: entrantError } = await supabaseAdmin
      .from("draft_entrants")
      .select("entrant_id, entrant_name, entrant_slug")
      .eq("pool_id", poolId)
      .eq("entrant_id", entrantId)
      .maybeSingle<{ entrant_id: string; entrant_name: string; entrant_slug: string }>();

    if (entrantError) {
      return NextResponse.json({ error: entrantError.message }, { status: 500 });
    }
    if (!entrant) {
      return NextResponse.json({ error: "Entrant not found." }, { status: 404 });
    }

    const accessCode = generateAccessCode();
    const accessCodeHash = hashSecret(accessCode);
    const accessCodeHint = `${accessCode.slice(0, 2)}••${accessCode.slice(-2)}`;

    const { error: updateError } = await supabaseAdmin
      .from("draft_entrants")
      .update({
        access_code_hash: accessCodeHash,
        access_code_hint: accessCodeHint,
        updated_at: new Date().toISOString(),
      })
      .eq("pool_id", poolId)
      .eq("entrant_id", entrantId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      poolId,
      entrant: {
        entrant_id: entrant.entrant_id,
        entrant_name: entrant.entrant_name,
        entrant_slug: entrant.entrant_slug,
      },
      access_code: accessCode,
      access_code_hint: accessCodeHint,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to generate access code.") },
      { status: 500 }
    );
  }
}
