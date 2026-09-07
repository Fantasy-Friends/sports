// Team helmets for the Pick'em field — the authentic Tecmo Super Bowl 2014
// helmet sprites, background-removed and resized into /public/helmets/<ABBR>.png
// (see scripts note below). Rendered pixelated so they stay crisp at any size.
// Keyed by ESPN's team abbreviations; unknown teams fall back to a text badge.
//
// Source art processed from the TSB '14 helmet set: flood-filled the black
// background to transparency (keeping the helmet's own black outline/ear
// hole/facemask), dropped the "TM" mark, cropped, and downscaled to 96px.

const HELMET_ABBRS = new Set([
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
  "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA",
  "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
  "TEN", "WSH",
]);

export function TeamHelmet({ abbr, className }: { abbr: string; className?: string }) {
  if (!HELMET_ABBRS.has(abbr)) {
    return (
      <span
        className={`${className ?? ""} tc-team__abbr inline-flex items-center justify-center`}
        aria-label={`${abbr} helmet`}
      >
        {abbr}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/helmets/${abbr}.png`}
      alt={`${abbr} helmet`}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
