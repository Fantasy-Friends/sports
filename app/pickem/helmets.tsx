// Tecmo-style team helmets for the Pick'em field. Instead of ESPN's photo
// logos, each team gets the same blocky 8-bit helmet silhouette tinted with its
// colors (dome + stripe), the way Tecmo Bowl rendered every team as a colored
// helmet. `shape-rendering: crispEdges` keeps the curves pixel-jagged for the
// retro feel. Keyed by ESPN's team abbreviations.

type HelmetColors = { dome: string; stripe: string };

const TEAM_COLORS: Record<string, HelmetColors> = {
  ARI: { dome: "#97233F", stripe: "#FFFFFF" },
  ATL: { dome: "#A71930", stripe: "#000000" },
  BAL: { dome: "#241773", stripe: "#000000" },
  BUF: { dome: "#00338D", stripe: "#C60C30" },
  CAR: { dome: "#0085CA", stripe: "#101820" },
  CHI: { dome: "#0B162A", stripe: "#C83803" },
  CIN: { dome: "#FB4F14", stripe: "#000000" },
  CLE: { dome: "#FF3C00", stripe: "#311D00" },
  DAL: { dome: "#869397", stripe: "#041E42" },
  DEN: { dome: "#002244", stripe: "#FB4F14" },
  DET: { dome: "#0076B6", stripe: "#B0B7BC" },
  GB: { dome: "#FFB612", stripe: "#203731" },
  HOU: { dome: "#03202F", stripe: "#A71930" },
  IND: { dome: "#FFFFFF", stripe: "#002C5F" },
  JAX: { dome: "#006778", stripe: "#D7A22A" },
  KC: { dome: "#E31837", stripe: "#FFB81C" },
  LV: { dome: "#A5ACAF", stripe: "#000000" },
  LAC: { dome: "#0080C6", stripe: "#FFC20E" },
  LAR: { dome: "#003594", stripe: "#FFA300" },
  MIA: { dome: "#008E97", stripe: "#FC4C02" },
  MIN: { dome: "#4F2683", stripe: "#FFC62F" },
  NE: { dome: "#002244", stripe: "#C60C30" },
  NO: { dome: "#D3BC8D", stripe: "#101820" },
  NYG: { dome: "#0B2265", stripe: "#A71930" },
  NYJ: { dome: "#125740", stripe: "#FFFFFF" },
  PHI: { dome: "#004C54", stripe: "#A5ACAF" },
  PIT: { dome: "#101820", stripe: "#FFB612" },
  SF: { dome: "#AA0000", stripe: "#B3995D" },
  SEA: { dome: "#002244", stripe: "#69BE28" },
  TB: { dome: "#D50A0A", stripe: "#34302B" },
  TEN: { dome: "#0C2340", stripe: "#4B92DB" },
  WSH: { dome: "#5A1414", stripe: "#FFB612" },
};

const FALLBACK: HelmetColors = { dome: "#8a93a8", stripe: "#eef1f8" };

export function TeamHelmet({ abbr, className }: { abbr: string; className?: string }) {
  const c = TEAM_COLORS[abbr] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${abbr} helmet`}
    >
      {/* shell + jaw */}
      <path
        d="M4 18 C4 10 10 5 18 5 C24 5 27 9 28.5 14 L29 18 L18 18 C18 20.5 16 22 13 22 L10 22 C6 22 4 21 4 18 Z"
        fill={c.dome}
        stroke="#05060f"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* center stripe over the dome */}
      <path
        d="M7.5 8.5 C11 6 14.5 5.4 18 5.4 C21.5 5.4 24 6.6 26 8.6"
        fill="none"
        stroke={c.stripe}
        strokeWidth="2.6"
      />
      {/* ear hole */}
      <circle cx="12" cy="15.5" r="2.3" fill="#05060f" />
      {/* facemask */}
      <path
        d="M29 14.5 L28.5 20 M28.7 15.5 L20 15.5 M28.2 18.5 L19 20.2"
        fill="none"
        stroke="#c9cfdb"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  );
}
