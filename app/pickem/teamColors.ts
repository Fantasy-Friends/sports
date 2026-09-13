// Team colors for Pick'em pick lines.
//
// These are NOT the raw brand hexes. Real NFL colors span the whole luminance
// range — PIT black, BAL purple and CHI navy disappear on a dark panel, while
// MIA aqua and NO gold disappear on white — so a literal palette is unreadable
// somewhere. Each team's identity color (picked for RECOGNITION: CHI orange
// rather than navy, LV silver rather than black, PIT gold rather than black)
// was luminance-normalized to ~0.28 relative luminance, preserving hue and
// saturation. That band clears 5.1:1 against the Tecmo panel (#131d40) and
// 3.2:1 against white, so one color works on any background and no
// theme-switching is needed.
//
// Teams that genuinely share a brand color (ATL/HOU red, CIN/DEN orange) land
// on the same value by design — the abbreviation next to the swatch carries
// the identity; color is a scanning aid, never the only signal.

const TEAM_COLORS: Record<string, string> = {
  ARI: "#DD6D88", ATL: "#E8667B", BAL: "#9183E6", BUF: "#4D8DFF",
  CAR: "#0097E6", CHI: "#FC5A1E", CIN: "#FB5A23", CLE: "#FF5622",
  DAL: "#4990F4", DEN: "#FB5A23", DET: "#0097E9", GB:  "#5B9C8B",
  HOU: "#E8667B", IND: "#3191FF", JAX: "#009EB8", KC:  "#EE6176",
  LAC: "#0097E9", LAR: "#4E8DFF", LV:  "#899296", MIA: "#00A0AA",
  MIN: "#A67ED9", NE:  "#2492FF", NO:  "#AE8B43", NYG: "#6A8CEF",
  NYJ: "#22A378", PHI: "#009FB0", PIT: "#C08500", SEA: "#59A222",
  SF:  "#FF5353", TB:  "#F75B5B", TEN: "#4E94DC", WSH: "#DF6E6E",
};

// Falls back to the theme's body text color for any abbreviation we don't
// know (relocations, ESPN oddities), so an unknown team is still readable.
export function teamColor(abbr: string): string {
  return TEAM_COLORS[abbr] ?? "var(--tc-text)";
}
