import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type ProfileRow = {
  entrant_id: string;
  weight_lbs: number;
  sex: "male" | "female" | "other";
  display_name: string | null;
  updated_at: string;
};

export async function GET() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { data } = await supabaseAdmin
      .from("drink_profiles")
      .select("entrant_id, weight_lbs, sex, display_name, updated_at")
      .eq("entrant_id", session.entrant.entrant_id)
      .maybeSingle<ProfileRow>();

    return NextResponse.json({
      profile: data ?? null,
      entrant_name: session.entrant.entrant_name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to load profile") },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      weight_lbs?: number;
      sex?: string;
      display_name?: string;
    };

    const weight = Number(body.weight_lbs);
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 800) {
      return NextResponse.json({ error: "weight_lbs must be a number between 1 and 799" }, { status: 400 });
    }
    if (body.sex !== "male" && body.sex !== "female" && body.sex !== "other") {
      return NextResponse.json({ error: "sex must be 'male', 'female', or 'other'" }, { status: 400 });
    }

    const row = {
      entrant_id: session.entrant.entrant_id,
      weight_lbs: weight,
      sex: body.sex,
      display_name: body.display_name?.trim() || session.entrant.entrant_name,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("drink_profiles")
      .upsert(row, { onConflict: "entrant_id" })
      .select("entrant_id, weight_lbs, sex, display_name, updated_at")
      .single<ProfileRow>();
    if (error) throw new Error(error.message);

    return NextResponse.json({ profile: data });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to save profile") },
      { status: 500 },
    );
  }
}
