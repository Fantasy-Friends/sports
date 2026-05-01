import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createDraftSession,
  DRAFT_SESSION_COOKIE,
  getEntrantById,
  linkGoogleAccount,
} from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

const GOOGLE_PENDING_EMAIL_COOKIE = "google_pending_email";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const pendingEmail = cookieStore.get(GOOGLE_PENDING_EMAIL_COOKIE)?.value;

    if (!pendingEmail) {
      return NextResponse.json(
        { error: "No pending Google login. Please sign in again." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { entrant_id?: string };
    const entrantId = body.entrant_id?.trim();
    if (!entrantId) {
      return NextResponse.json({ error: "entrant_id required" }, { status: 400 });
    }

    const entrant = await getEntrantById(entrantId);
    if (!entrant) {
      return NextResponse.json({ error: "Entrant not found" }, { status: 404 });
    }

    await linkGoogleAccount(entrantId, pendingEmail);
    const session = await createDraftSession(entrant.pool_id, entrantId);

    const response = NextResponse.json({ ok: true, welcomed_at: entrant.welcomed_at });
    response.cookies.set(DRAFT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(session.expiresAt),
    });
    response.cookies.delete(GOOGLE_PENDING_EMAIL_COOKIE);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to link account") },
      { status: 500 },
    );
  }
}
