// BAC + caffeine + hydration + substance math, ported from the standalone
// Drink Tracker HTML. All inputs are in lb / oz / mg with ISO-8601 timestamps;
// math runs client-side from the entry log so anyone can see anyone's curve.

export const WIDMARK_R_MALE = 0.68;
export const WIDMARK_R_FEMALE = 0.55;
export const WIDMARK_R_OTHER = 0.61;
export const ALCOHOL_METABOLISM = 0.015; // BAC/hr
export const CAFFEINE_HALF_LIFE_HOURS = 5;
export const HYDRATION_GOAL_OZ = 100;

export type Sex = "male" | "female" | "other";

export type DrinkPayload = {
  preset?: string;
  oz: number;
  abv: number;     // 0..1
  pct?: number;    // 0..1, default 1 (how much of the drink was actually consumed)
};

export type CaffeinePayload = {
  preset?: string;
  mg: number;
  oz?: number;
};

export type WaterPayload = {
  preset?: string;
  oz: number;
};

export type SubstancePayload = {
  preset?: string;
  type: "stimulant" | "benzo" | "thc" | "opioid" | "other";
  severity: number;     // 1..5
  duration_hours: number;
  notes?: string;
};

export type EntryKind = "drink" | "caffeine" | "water" | "substance";

export type Entry = {
  entry_id: string;
  entrant_id: string;
  kind: EntryKind;
  payload: Record<string, unknown>;
  occurred_at: string; // ISO
};

export type MemberProfile = {
  entrant_id: string;
  display_name: string;
  weight_lbs: number;
  sex: Sex;
};

export function widmarkR(sex: Sex): number {
  if (sex === "male") return WIDMARK_R_MALE;
  if (sex === "female") return WIDMARK_R_FEMALE;
  return WIDMARK_R_OTHER;
}

export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

// Grams of ethanol still in the body for a given member at `now`.
export function alcoholGramsRemaining(
  profile: MemberProfile,
  entries: Entry[],
  now: Date,
): number {
  const weightKg = lbsToKg(profile.weight_lbs);
  const r = widmarkR(profile.sex);
  const metabRate = ALCOHOL_METABOLISM * weightKg * r * 10; // grams/hr

  let total = 0;
  for (const e of entries) {
    if (e.kind !== "drink") continue;
    const p = e.payload as DrinkPayload;
    if (!p || typeof p.oz !== "number" || typeof p.abv !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = Math.max(0, (now.getTime() - t) / 3600000);
    const pct = typeof p.pct === "number" ? p.pct : 1;
    const consumed = p.oz * 29.5735 * p.abv * pct * 0.789; // grams
    const remaining = Math.max(0, consumed - metabRate * hrs);
    total += remaining;
  }
  return total;
}

export function calcBAC(profile: MemberProfile, entries: Entry[], now: Date): number {
  const grams = alcoholGramsRemaining(profile, entries, now);
  const weightKg = lbsToKg(profile.weight_lbs);
  const r = widmarkR(profile.sex);
  if (weightKg <= 0 || r <= 0) return 0;
  return grams / (weightKg * r * 10);
}

export function caffeineMgRemaining(entries: Entry[], now: Date): number {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "caffeine") continue;
    const p = e.payload as CaffeinePayload;
    if (!p || typeof p.mg !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = Math.max(0, (now.getTime() - t) / 3600000);
    total += p.mg * Math.pow(0.5, hrs / CAFFEINE_HALF_LIFE_HOURS);
  }
  return total;
}

// Water consumed within the last 18 hours.
export function waterOzRecent(entries: Entry[], now: Date): number {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "water") continue;
    const p = e.payload as WaterPayload;
    if (!p || typeof p.oz !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = (now.getTime() - t) / 3600000;
    if (hrs >= 0 && hrs < 18) total += p.oz;
  }
  return total;
}

export type ActiveSubstance = {
  entry_id: string;
  type: SubstancePayload["type"];
  severity: number;
  preset: string | undefined;
  duration_hours: number;
  hours_elapsed: number;
  hours_remaining: number;
};

export function activeSubstances(entries: Entry[], now: Date): ActiveSubstance[] {
  const out: ActiveSubstance[] = [];
  for (const e of entries) {
    if (e.kind !== "substance") continue;
    const p = e.payload as SubstancePayload;
    if (!p || typeof p.duration_hours !== "number") continue;
    const t = new Date(e.occurred_at).getTime();
    const hrs = (now.getTime() - t) / 3600000;
    if (hrs >= 0 && hrs < p.duration_hours) {
      out.push({
        entry_id: e.entry_id,
        type: p.type,
        severity: p.severity,
        preset: p.preset,
        duration_hours: p.duration_hours,
        hours_elapsed: hrs,
        hours_remaining: p.duration_hours - hrs,
      });
    }
  }
  return out;
}

export type RiskLevel = {
  label: "Clear" | "Low" | "Moderate" | "Elevated" | "High";
  color: string;
  score: number;
};

export function riskLevel(bac: number, drugs: ActiveSubstance[]): RiskLevel {
  const benzoSev = drugs.filter((d) => d.type === "benzo").reduce((s, d) => s + d.severity, 0);
  const thcSev = drugs.filter((d) => d.type === "thc").reduce((s, d) => s + d.severity, 0);
  let score = bac * 40 + benzoSev * 1.5 + thcSev * 0.8;
  if (bac > 0 && benzoSev > 0) score += benzoSev * bac * 30;
  if (score === 0) return { label: "Clear", color: "#22c55e", score };
  if (score < 1.5) return { label: "Low", color: "#84cc16", score };
  if (score < 3) return { label: "Moderate", color: "#eab308", score };
  if (score < 5) return { label: "Elevated", color: "#f97316", score };
  return { label: "High", color: "#ef4444", score };
}

// ─── Presets (mirror the standalone HTML) ──────────────────────────────────

export const ALCOHOL_PRESETS = [
  { name: "Beer (12oz/5%)", oz: 12, abv: 0.05 },
  { name: "IPA (16oz/7%)", oz: 16, abv: 0.07 },
  { name: "Light Beer (12oz/4.2%)", oz: 12, abv: 0.042 },
  { name: "Wine (5oz/13%)", oz: 5, abv: 0.13 },
  { name: "Cocktail (1.5oz)", oz: 1.5, abv: 0.4 },
  { name: "Double (3oz)", oz: 3, abv: 0.4 },
  { name: "Vodka Soda", oz: 1.5, abv: 0.4 },
  { name: "Shot (1oz)", oz: 1, abv: 0.4 },
  { name: "Hard Seltzer", oz: 12, abv: 0.05 },
] as const;

export const WATER_PRESETS = [
  { name: "Glass (8oz)", oz: 8 },
  { name: "Bottle (16oz)", oz: 16 },
  { name: "Big bottle (20oz)", oz: 20 },
  { name: "Yeti (32oz)", oz: 32 },
  { name: "Sip (4oz)", oz: 4 },
] as const;

export const CAFFEINE_PRESETS = [
  { name: "Coffee (8oz)", mg: 95, oz: 8 },
  { name: "Drip coffee (12oz)", mg: 140, oz: 12 },
  { name: "Espresso shot", mg: 64, oz: 1 },
  { name: "Cold brew (12oz)", mg: 200, oz: 12 },
  { name: "Red Bull (8.4oz)", mg: 80, oz: 8.4 },
  { name: "Monster (16oz)", mg: 160, oz: 16 },
  { name: "Black tea (8oz)", mg: 50, oz: 8 },
  { name: "Green tea (8oz)", mg: 30, oz: 8 },
  { name: "Yerba Mate (16oz)", mg: 80, oz: 16 },
  { name: "Diet Coke (12oz)", mg: 46, oz: 12 },
] as const;

export const SUBSTANCE_PRESETS: ReadonlyArray<{
  name: string;
  type: SubstancePayload["type"];
  severity: number;
  duration_hours: number;
}> = [
  { name: "Vyvanse 30mg", type: "stimulant", severity: 2, duration_hours: 12 },
  { name: "Vyvanse 20mg", type: "stimulant", severity: 1, duration_hours: 10 },
  { name: "Vyvanse 40mg", type: "stimulant", severity: 2, duration_hours: 12 },
  { name: "Vyvanse 60mg", type: "stimulant", severity: 3, duration_hours: 14 },
  { name: "Adderall 10mg", type: "stimulant", severity: 1, duration_hours: 8 },
  { name: "Adderall 20mg", type: "stimulant", severity: 2, duration_hours: 10 },
  { name: "Lorazepam 0.5mg", type: "benzo", severity: 2, duration_hours: 6 },
  { name: "Lorazepam 1mg", type: "benzo", severity: 3, duration_hours: 8 },
  { name: "Lorazepam 2mg", type: "benzo", severity: 4, duration_hours: 10 },
  { name: "Xanax 0.5mg", type: "benzo", severity: 2, duration_hours: 5 },
  { name: "Xanax 1mg", type: "benzo", severity: 3, duration_hours: 6 },
  { name: "THC 5mg edible", type: "thc", severity: 1, duration_hours: 4 },
  { name: "THC 10mg edible", type: "thc", severity: 2, duration_hours: 6 },
  { name: "THC 25mg edible", type: "thc", severity: 3, duration_hours: 8 },
  { name: "Cannabis (smoked)", type: "thc", severity: 2, duration_hours: 3 },
];

export const SUBSTANCE_COLORS: Record<SubstancePayload["type"], string> = {
  stimulant: "#3b82f6",
  benzo: "#f97316",
  thc: "#22c55e",
  opioid: "#a855f7",
  other: "#9ca3af",
};
