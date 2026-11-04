import { NextResponse } from "next/server";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";
import { sendPushToEntrant } from "@/lib/notifications/webPush";
import { pushTest } from "@/lib/notifications/pushTemplates";

export const revalidate = 0;

// POST /api/push/test — sends a test push to every device of the signed-in person.
export async function POST() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const result = await sendPushToEntrant(
      session.entrant.entrant_id,
      pushTest(session.entrant.entrant_name),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to send test push") },
      { status: 500 },
    );
  }
}
