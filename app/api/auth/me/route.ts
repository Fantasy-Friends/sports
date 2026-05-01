import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Only enforce pool_id scoping when the caller explicitly passes it.
  // AppShell and the welcome page do a generic "am I authenticated?" check
  // and must not be locked to a specific tournament pool — doing so causes
  // a redirect loop when the session pool_id (e.g. "2026-majors-masters")
  // doesn't match the env-var default ("2026-majors").
  const explicitPoolId = url.searchParams.get("pool_id") || undefined;

  try {
    const session = await getAuthenticatedEntrant(explicitPoolId);

    return NextResponse.json({
      ok: true,
      authenticated: Boolean(session),
      poolId: explicitPoolId ?? session?.entrant.pool_id ?? null,
      entrant: session?.entrant ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load entrant session.") },
      { status: 500 }
    );
  }
}
