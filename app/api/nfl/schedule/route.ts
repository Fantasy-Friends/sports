import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { fetchNflWeek } from "@/lib/nfl";

export const revalidate = 0;

// Normalized NFL week schedule + Vegas odds (proxied from ESPN, 5-min cache).
// ?week=N for a specific week; omit for ESPN's current week.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedEntrant();
    if (!auth) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const weekParam = request.nextUrl.searchParams.get("week");
    let week: number | undefined;
    if (weekParam !== null) {
      week = Number(weekParam);
      if (!Number.isInteger(week) || week < 1 || week > 18) {
        return NextResponse.json({ error: "week must be 1-18" }, { status: 400 });
      }
    }

    const data = await fetchNflWeek(week);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load NFL schedule") },
      { status: 502 },
    );
  }
}
