import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";
import { getErrorMessage } from "@/lib/error";

export const revalidate = 0;

type ProfileRow = {
  entrant_id: string;
  weight_lbs: number;
  sex: "male" | "female" | "other";
  age_years: number | null;
  display_name: string | null;
  updated_at: string;
};

const PROFILE_COLUMNS = "entrant_id, weight_lbs, sex, age_years, display_name, updated_at";

export async function GET() {
  try {
    const session = await getAuthenticatedEntrant();
    if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { data } = await supabaseAdmin
      .from("drink_profiles")
      .select(PROFILE_COLUMNS)
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
      age_years?: number | null;
      display_name?: string;
    };

    const weight = Number(body.weight_lbs);
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 800) {
      return NextResponse.json({ error: "weight_lbs must be a number between 1 and 799" }, { status: 400 });
    }
    if (body.sex !== "male" && body.sex !== "female" && body.sex !== "other") {
      return NextResponse.json({ error: "sex must be 'male', 'female', or 'other'" }, { status: 400 });
    }
    let ageYears: number | null = null;
    if (body.age_years !== undefined && body.age_years !== null) {
      const a = Number(body.age_years);
      if (!Number.isFinite(a) || a <= 0 || a >= 130) {
        return NextResponse.json({ error: "age_years must be between 1 and 129" }, { status: 400 });
      }
      ageYears = Math.round(a);
    }

    const row = {
      entrant_id: session.entrant.entrant_id,
      weight_lbs: weight,
      sex: body.sex,
      age_years: ageYears,
      display_name: body.display_name?.trim() || session.entrant.entrant_name,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("drink_profiles")
      .upsert(row, { onConflict: "entrant_id" })
      .select(PROFILE_COLUMNS)
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
