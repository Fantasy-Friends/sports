import { NextResponse } from "next/server";
import {
  createDraftSession,
  DRAFT_SESSION_COOKIE,
  getEntrantBySlug,
  hashSecret,
} from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
  let body: { pool_id?: string; entrant_slug?: string; access_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poolId = body.pool_id?.trim();
  const entrantSlug = body.entrant_slug?.trim();
  const accessCode = body.access_code?.trim();

  if (!poolId || !entrantSlug || !accessCode) {
    return NextResponse.json(
      { error: "pool_id, entrant_slug, and access_code are required." },
      { status: 400 }
    );
  }

  try {
    const entrant = await getEntrantBySlug(poolId, entrantSlug);
    if (!entrant) {
      return NextResponse.json({ error: "Entrant not found." }, { status: 404 });
    }

    const submittedHash = hashSecret(accessCode);
    if (submittedHash !== entrant.access_code_hash) {
      return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
    }

    const session = await createDraftSession(poolId, entrant.entrant_id);
    const res = NextResponse.json({
      ok: true,
      poolId,
      entrant: {
        entrant_id: entrant.entrant_id,
        entrant_name: entrant.entrant_name,
        entrant_slug: entrant.entrant_slug,
        draft_position: entrant.draft_position,
        is_admin: entrant.is_admin,
        welcomed_at: entrant.welcomed_at,
      },
    });

    res.cookies.set(DRAFT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return res;
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to sign in entrant.") },
      { status: 500 }
    );
  }
}
