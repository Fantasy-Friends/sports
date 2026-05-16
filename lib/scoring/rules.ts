import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Tier = 1 | 2 | 3;

type RuleRow = { scope: string; key: string; value: number };

type ScoringRules = {
  finishPoints: Record<number, number>;
  tierMultiplier: Record<Tier, number>;
};

const FALLBACK: ScoringRules = {
  finishPoints: { 1: 10, 2: 7, 3: 5, 4: 3, 5: 1, 6: 0 },
  tierMultiplier: { 1: 1, 2: 2.5, 3: 5 },
};

let cached: ScoringRules | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function loadScoringRules(): Promise<ScoringRules> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const { data, error } = await supabaseAdmin
    .from("scoring_rules")
    .select("scope, key, value");

  if (error || !data || data.length === 0) {
    cached = FALLBACK;
    cachedAt = Date.now();
    return cached;
  }

  const finishPoints: Record<number, number> = {};
  const tierMultiplier: Record<number, number> = {};

  for (const row of data as RuleRow[]) {
    if (row.scope === "finish_points") {
      const k = Number(row.key);
      if (Number.isFinite(k)) finishPoints[k] = Number(row.value);
    } else if (row.scope === "tier_multiplier") {
      const k = Number(row.key);
      if (Number.isFinite(k)) tierMultiplier[k] = Number(row.value);
    }
  }

  cached = {
    finishPoints: { ...FALLBACK.finishPoints, ...finishPoints },
    tierMultiplier: { ...FALLBACK.tierMultiplier, ...tierMultiplier } as Record<Tier, number>,
  };
  cachedAt = Date.now();
  return cached;
}

export function resetScoringRulesCache() {
  cached = null;
  cachedAt = 0;
}
