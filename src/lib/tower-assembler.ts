/**
 * Tower dimension parser and parts calculator.
 *
 * User enters dimensions like "2.5x2x6m" or "2570x2000x6000mm" and this
 * module calculates the closest standard ringlock bay configuration,
 * then computes the complete BOM (standards, ledgers, braces, etc).
 */

export interface TowerDimensions {
  /** User-requested dimensions (mm) */
  requestedLength: number;
  requestedWidth: number;
  requestedHeight: number;
}

export interface BayConfig {
  /** Number of bays in X direction */
  bays_x: number;
  /** Number of bays in Y direction */
  bays_y: number;
  /** Bay length in X (mm) — picks closest standard size */
  bay_length_x: number;
  /** Bay length in Y (mm) — picks closest standard size */
  bay_length_y: number;
  /** Lift height (mm) — typically 2000mm */
  lift_height: number;
  /** Number of lifts (levels) */
  num_lifts: number;
  /** Base type: adjustable jack or caster wheel */
  base_type: "jack" | "wheel";
  /** Include grating platforms at each level */
  include_gratings: boolean;
  /** Include toeboards at each level */
  include_toeboards: boolean;
  /** Include diagonal braces */
  include_braces: boolean;
  /** Which levels have platforms (1-indexed). Empty = all levels. */
  disabled_platform_levels: number[];
  /** Include ladder on access side */
  include_ladder: boolean;
  /** Plank width: 320mm (heavy-duty) or 230mm (light) */
  plank_width: 320 | 230;
  /** Secondary access ladder (auto at >=20m height or length) */
  secondary_access: boolean;
  /** Optional mixed sections (overrides bays_x/bay_length_x) */
  sections?: Array<{ bays: number; bay_length: number }>;
}

export interface PartsBom {
  standards: number;
  ledgers: number;
  braces: number;
  base_jacks: number;
  rosettes: number;
  planks: number;
  gratings: number;
  toeboards: number;
  total_parts: number;
  estimated_weight_kg: number;
  /** Detailed BOM: each part broken down by standard size */
  details: BomDetailItem[];
}

export interface BomDetailItem {
  part_type: string;
  description: string;
  size: string;
  quantity: number;
  unit_weight_kg: number;
  total_weight_kg: number;
}

export interface AssemblyResult {
  input: TowerDimensions;
  config: BayConfig;
  bom: PartsBom;
  actualDimensions: {
    length: number;
    width: number;
    height: number;
  };
  warnings: string[];
}

/**
 * Standard ringlock bay sizes (mm).
 * These are the common industry sizes — the parser picks the closest.
 */
const STANDARD_BAY_LENGTHS = [1090, 1570, 2070, 2570, 3070];
const STANDARD_BAY_WIDTHS = [1090, 1400, 1520, 1570, 2000, 2500];
const STANDARD_LIFT_HEIGHTS = [1000, 1500, 2000, 2500];

/**
 * Standard scaffold (vertical tube) lengths (mm) — catalog MDCSTA0xxx.
 * A tower taller than 3m must be built from multiple stacked standards.
 * Max single standard = 3m.
 */
const STANDARD_LENGTHS = [500, 1000, 1500, 2000, 3000];

/**
 * Standard scaffold weights (kg) — from BOM blank.xlsx catalog (cuplock-style).
 * Source rows r11–r15 (MDCSTA0xxx).
 */
const STANDARD_WEIGHTS: Record<number, number> = {
  500: 2.35,    // MDCSTA0500  STANDARD 1 cup   500
  1000: 4.70,   // MDCSTA1000  STANDARD 2 cup   1000
  1500: 9.05,   // MDCSTA1500  STANDARD 3 cup   1500
  2000: 9.40,   // MDCSTA2000  STANDARD 4 cup   2000
  3000: 14.10,  // MDCSTA3000  STANDARD 6 cup   3000
};

/**
 * Ledger weights (kg) by length (mm) — from BOM blank.xlsx catalog.
 * Source rows r17–r28 (MDCLED0xxx).
 *
 * NOTE: spreadsheet row r19 says MDCLED0650 (650mm) but the attached catalog
 * reference image shows MDCLED0680 (680mm). Both entries are kept here so the
 * BOM works regardless of which length a user picks. The UI filler buttons
 * use CATALOG_LEDGER_LENGTHS (which lists 680 per the image).
 */
const LEDGER_WEIGHTS: Record<number, number> = {
  390: 2.00,    // MDCLED0390
  610: 2.41,    // MDCLED0610
  650: 2.90,    // MDCLED0650  (spreadsheet)
  680: 2.97,    // MDCLED0680  (image — interpolated between 610/690)
  690: 3.05,    // MDCLED0690
  900: 3.74,    // MDCLED0900
  1090: 4.43,   // MDCLED1090
  1220: 4.87,   // MDCLED1220
  1500: 5.87,   // MDCLED1500
  1570: 6.11,   // MDCLED1570
  2070: 7.85,   // MDCLED2070
  2134: 8.06,   // MDCLED2134
  2570: 9.60,   // MDCLED2570
};

/**
 * Catalog ledger lengths (mm) — the 12 standard sizes from the attached
 * catalog reference image. Used by the UI sections editor to render one
 * "Add filler" button per standard length.
 *
 * Each entry includes the catalog item code (MDCLED0xxx) for traceability.
 */
export const CATALOG_LEDGER_LENGTHS: Array<{ length: number; code: string }> = [
  { length: 390, code: "MDCLED0390" },
  { length: 610, code: "MDCLED0610" },
  { length: 680, code: "MDCLED0680" },
  { length: 690, code: "MDCLED0690" },
  { length: 900, code: "MDCLED0900" },
  { length: 1090, code: "MDCLED1090" },
  { length: 1220, code: "MDCLED1220" },
  { length: 1500, code: "MDCLED1500" },
  { length: 1570, code: "MDCLED1570" },
  { length: 2070, code: "MDCLED2070" },
  { length: 2134, code: "MDCLED2134" },
  { length: 2570, code: "MDCLED2570" },
];

/**
 * Reinforced ledger weights (kg) — heavier variants for X-bay long spans.
 * Source rows r30–r33 (MDCRLE0xxx).
 */
const REINFORCED_LEDGER_WEIGHTS: Record<number, number> = {
  1570: 9.08,   // MDCRLE1570
  2072: 12.00,  // MDCRLE2072
  2134: 12.32,  // MDCRLE2134
  2570: 14.54,  // MDCRLE2570
};

/**
 * Diagonal brace weights (kg) — catalog for 2000mm lift height, keyed by bay length.
 * Source rows r35–r42 (MDCVDB0xxx).
 * For other lift heights, weight is scaled by actual_brace_length / catalog_brace_length.
 */
const BRACE_WEIGHTS: Record<number, number> = {
  900: 8.03,    // MDCVDB0900  DIAG.BRACE2000/0900
  1090: 6.96,   // MDCVDB1090  DIAG.BRACE2000/1090
  1220: 7.79,   // MDCVDB1220  DIAG.BRACE2000/1220
  1500: 9.58,   // MDCVDB1500  DIAG.BRACE2000/1500
  1570: 9.71,   // MDCVDB1570  DIAG.BRACE2000/1570
  2072: 9.80,   // MDCVDB2072  DIAG.BRACE2000/2072
  2134: 9.86,   // MDCVDB2134  DIAG.BRACE2000/2134
  2570: 10.62,  // MDCVDB2570  DIAG.BRACE2000/2570
};

/**
 * Steel planks with hook (kg) by length — from BOM blank.xlsx catalog.
 * Source rows r49–r57 (MDCSPH0xxx).
 *
 * Catalog does not differentiate by plank width — same length has same weight
 * regardless of width. We apply a 230/320 = 0.719 width ratio for 230mm planks
 * as a physical approximation (narrower plank = less steel per metre).
 */
const PLANK_WEIGHTS: Record<number, number> = {
  680: 3.82,    // MDCSPH0680
  1000: 6.26,   // MDCSPH1000
  1200: 7.51,   // MDCSPH120  (catalog typo — represents 1200mm)
  1220: 7.64,   // MDCSPH1220
  1500: 9.39,   // MDCSPH1500
  1570: 9.98,   // MDCSPH1570
  2070: 13.34,  // MDCSPH2070
  2134: 13.15,  // MDCSPH2134
  2570: 15.44,  // MDCSPH2570
};

/**
 * Toeboard weights (kg) by length — from BOM blank.xlsx catalog.
 * Source rows r71–r81 (MDCTOB0xxx).
 */
const TOEBOARD_WEIGHTS: Record<number, number> = {
  390: 2.00,    // MDCTOB0390
  610: 2.41,    // MDCTOB0610
  650: 2.44,    // MDCTOB0650
  680: 2.52,    // MDCTOB0680
  900: 3.69,    // MDCTOB0900
  1220: 4.15,   // MDCTOB1220
  1500: 4.98,   // MDCTOB1500
  1570: 5.12,   // MDCTOB1570
  2072: 6.71,   // MDCTOB2072
  2134: 6.89,   // MDCTOB2134
  2570: 8.20,   // MDCTOB2570
};

/**
 * Monker ladder weights (kg) by section length — from BOM blank.xlsx catalog.
 * Source rows r87–r88 (MDCMON2000, MDCMON3000).
 * Ladders taller than 3m are stacked from 3m + 2m sections + spigot couplers.
 */
const LADDER_WEIGHTS: Record<number, number> = {
  2000: 5.75,   // MDCMON2000
  3000: 7.96,   // MDCMON3000
};

/**
 * Trapdoor with ladder weights (kg) by length — from BOM blank.xlsx catalog.
 * Source rows r80–r82 (MDCTWL0xxx). One trapdoor per access bay opening per
 * lift (replaces a section of the grating to allow ladder passage).
 */
const TRAPDOOR_WEIGHTS: Record<number, number> = {
  1050: 13.70,   // MDCTWL1050
  2072: 22.88,   // MDCTWL2072
  2570: 24.10,   // MDCTWL2570
};

/**
 * Steel gap filler weights (kg) by length — from BOM blank.xlsx catalog.
 * Source rows r114–r117 (MDCSGF0xxx). Gap fillers bridge the small residual
 * space between the steel plank and the ledger when the plank length doesn't
 * exactly match the bay length.
 */
const GAP_FILLER_WEIGHTS: Record<number, number> = {
  500: 3.02,     // MDCSGF500
  1520: 9.73,    // MDCSGF1520
  2080: 13.41,   // MDCSGF2080
  2520: 16.31,   // MDCSGF2520
};

/**
 * Removable staircase + accessories (kg) — from BOM blank.xlsx catalog.
 * Staircases are used in long façade scaffolds for safer access than ladders.
 *   MDCRSC2134  REMOVABLE_STAIRCASE      60.50 kg  (1 per staircase)
 *   MDCGRFS2134 GUARD RAIL FOR STAIRCASE  11.70 kg  (1 per staircase)
 *   MDCSFS0860  STEP-FOR-STAIRCASE        4.05 kg  (5 per staircase)
 */
const REMOVABLE_STAIRCASE_WEIGHT = 60.50;
const STAIRCASE_GUARD_RAIL_WEIGHT = 11.70;
const STAIRCASE_STEP_WEIGHT = 4.05;
const STEPS_PER_STAIRCASE = 5;
// Staircases spaced every ~6m of tower length (matches façade Tana 1: 50m → 8 staircases)
const STAIRCASE_SPACING_MM = 6000;

/**
 * Base / caster / spigot weights (kg) — single-piece catalog values.
 */
const SOLE_BOARD_WEIGHT = 1.80;             // MDCSLB0450  SOLE BOARDS0450
const BASE_COLLAR_WEIGHT = 1.72;             // MDCBCO0280  BASE_COLLAR
const SWIVEL_BASE_JACK_WEIGHT = 3.81;       // MDCBCO0600  SWIVEL BASE JACK
const FIXED_BASE_JACK_WEIGHT = 3.39;         // MDCFBJ0600  FIX_BASE_JACK
const WHEEL_WEIGHT = 17.00;                 // MDCWHE0300  WHEEL (heavy-duty total-lock)
const SPIGOT_WITH_COUPLER_WEIGHT = 1.25;    // MDCSWC0125  SPIGOT WITH COUPLER

/**
 * Linear lookup with interpolation / extrapolation for lengths not in catalog.
 * - If `length` is exactly in `table`, return that value.
 * - If `length` is between two catalog entries, linearly interpolate.
 * - If `length` is outside the catalog range, extrapolate using
 *   weight = (length / 1000) * kgPerM + intercept.
 */
function lookupWeight(
  table: Record<number, number>,
  length: number,
  kgPerM: number,
  intercept = 0,
): number {
  if (table[length] != null) return table[length];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return (length / 1000) * kgPerM + intercept;
  if (length < keys[0] || length > keys[keys.length - 1]) {
    return Math.max(0, (length / 1000) * kgPerM + intercept);
  }
  for (let i = 0; i < keys.length - 1; i++) {
    if (length >= keys[i] && length <= keys[i + 1]) {
      const w1 = table[keys[i]];
      const w2 = table[keys[i + 1]];
      const ratio = (length - keys[i]) / (keys[i + 1] - keys[i]);
      return w1 + ratio * (w2 - w1);
    }
  }
  return (length / 1000) * kgPerM + intercept;
}

/**
 * Plank weight table by plank width. The BOM catalog doesn't differentiate
 * widths — for 230mm we scale the catalog (320mm) weights by 230/320 = 0.719.
 */
function plankWeightTable(width: 320 | 230): Record<number, number> {
  if (width === 320) return PLANK_WEIGHTS;
  const scale = 230 / 320;
  const result: Record<number, number> = {};
  for (const [k, v] of Object.entries(PLANK_WEIGHTS)) {
    result[parseInt(k)] = Math.round(v * scale * 100) / 100;
  }
  return result;
}

/**
 * Slope (kg per metre of plank length) derived from catalog data.
 * 320mm: (15.44 - 3.82) / (2570 - 680) = 6.15 kg/m
 * 230mm: scaled by 230/320 → 4.42 kg/m
 */
function plankKgPerM(width: 320 | 230): number {
  return width === 320 ? 6.15 : 4.42;
}

/**
 * End-fitting (hook) weight estimate per plank — not separately cataloged.
 */
function plankEndWeight(width: 320 | 230): number {
  return width === 320 ? 1.0 : 0.8;
}

/**
 * Layout description for a tower built from mixed sections.
 * - standardXs has length totalBays + 1 (standards at both ends of each bay,
 *   shared at section boundaries).
 * - bayCenters and bayLengths have length totalBays.
 */
export interface SectionLayout {
  totalBays: number;
  totalLength: number;
  standardXs: number[];
  bayCenters: number[];
  bayLengths: number[];
}

/**
 * Compute layout (standard positions, bay centers, bay lengths) for a tower
 * built from one or more sections. Standards are shared at section boundaries,
 * so the total standards in X = totalBays + 1.
 */
export function computeSectionLayout(
  sections: Array<{ bays: number; bay_length: number }>
): SectionLayout {
  const totalBays = sections.reduce((sum, s) => sum + s.bays, 0);
  const totalLength = sections.reduce((sum, s) => sum + s.bays * s.bay_length, 0);
  const standardXs: number[] = [];
  const bayCenters: number[] = [];
  const bayLengths: number[] = [];
  let x = -totalLength / 2;
  for (const section of sections) {
    for (let i = 0; i < section.bays; i++) {
      standardXs.push(x);
      bayLengths.push(section.bay_length);
      bayCenters.push(x + section.bay_length / 2);
      x += section.bay_length;
    }
  }
  standardXs.push(x); // last standard
  return { totalBays, totalLength, standardXs, bayCenters, bayLengths };
}

/**
 * Split a total height into standard ringlock standard lengths.
 * E.g. 8m → 3m + 3m + 2m (not one 8m bar, which doesn't exist).
 * Uses the largest available standard sizes first (greedy approach).
 */
function splitIntoStandards(totalHeight: number): { length: number; weight: number }[] {
  const result: { length: number; weight: number }[] = [];
  let remaining = totalHeight;

  // Greedy: use largest standards first
  const sortedLengths = [...STANDARD_LENGTHS].sort((a, b) => b - a);

  for (const len of sortedLengths) {
    while (remaining >= len) {
      result.push({ length: len, weight: STANDARD_WEIGHTS[len] });
      remaining -= len;
    }
  }

  // If there's a remainder, pick the smallest standard that covers it
  if (remaining > 0) {
    const closest = STANDARD_LENGTHS.find(l => l >= remaining) ?? STANDARD_LENGTHS[0];
    result.push({ length: closest, weight: STANDARD_WEIGHTS[closest] });
  }

  return result;
}

/**
 * Parse a dimension string like "2.5x2x6m" or "2570x2000x6000mm" or "2.5 2 6"
 * into structured dimensions (in mm).
 *
 * Supports:
 * - "2.5x2x6m" → 2500 x 2000 x 6000 mm
 * - "2570x2000x6000mm" → same
 * - "2.5 2 6" → 2500 x 2000 x 6000 mm (space-separated)
 * - "8x6x20ft" → feet → mm conversion
 */
export function parseDimensions(input: string): TowerDimensions | null {
  const cleaned = input.trim().toLowerCase().replace(/[×*]/g, "x");

  // Detect unit
  let unitMultiplier = 1000; // default: meters → mm
  if (cleaned.includes("mm")) {
    unitMultiplier = 1;
  } else if (cleaned.includes("ft") || cleaned.includes("feet") || cleaned.includes("'")) {
    unitMultiplier = 304.8; // feet → mm
  } else if (cleaned.includes("cm")) {
    unitMultiplier = 10;
  } else if (cleaned.includes("in") || cleaned.includes("inch")) {
    unitMultiplier = 25.4;
  }

  // Extract numbers
  const numbers = cleaned
    .replace(/[a-z'"']/g, " ")
    .split(/[\sx]+/)
    .map((s) => parseFloat(s))
    .filter((n) => !isNaN(n) && n > 0);

  if (numbers.length < 3) {
    return null;
  }

  return {
    requestedLength: Math.round(numbers[0] * unitMultiplier),
    requestedWidth: Math.round(numbers[1] * unitMultiplier),
    requestedHeight: Math.round(numbers[2] * unitMultiplier),
  };
}

/**
 * Find the closest standard bay size to the requested dimension.
 */
function closestStandard(requested: number, standards: number[]): number {
  return standards.reduce((closest, current) =>
    Math.abs(current - requested) < Math.abs(closest - requested)
      ? current
      : closest
  );
}

/**
 * Calculate the number of bays needed to reach the requested dimension
 * using the closest standard bay size.
 */
function calculateBays(requested: number, standards: number[]): { count: number; size: number } {
  const baySize = closestStandard(requested, standards);
  const count = Math.max(1, Math.round(requested / baySize));
  return { count, size: baySize };
}

/**
 * Split a total ladder height into 3m + 2m Monker ladder sections (greedy,
 * largest first). Each section connects to the next via a spigot coupler
 * (MDCSWC0125 = 1.25 kg). Returns the cumulative section weight, the
 * section count, and the spigot count (sections − 1, or 0 if only 1 section).
 *
 * Catalog values used (BOM blank.xlsx rows r87–r88):
 *   MDCMON2000  LADDER 2000  = 5.75 kg
 *   MDCMON3000  LADDER 3000  = 7.96 kg
 *
 * For heights below 2000mm, the smallest catalog section (2000mm) is used
 * and the weight is scaled linearly by actual_length / 2000.
 */
function computeLadderAssembly(totalHeight: number): {
  sectionWeight: number;
  sectionCount: number;
  spigotCount: number;
} {
  // Below the smallest catalog section — scale linearly.
  if (totalHeight <= 2000) {
    const scale = totalHeight / 2000;
    return {
      sectionWeight: LADDER_WEIGHTS[2000] * scale,
      sectionCount: 1,
      spigotCount: 0,
    };
  }

  // Greedy: use 3m sections first, then 2m.
  const result: { length: number; weight: number }[] = [];
  let remaining = totalHeight;
  while (remaining >= 3000) {
    result.push({ length: 3000, weight: LADDER_WEIGHTS[3000] });
    remaining -= 3000;
  }
  while (remaining >= 2000) {
    result.push({ length: 2000, weight: LADDER_WEIGHTS[2000] });
    remaining -= 2000;
  }
  // If there's a remainder, add another 2m section (overhang).
  if (remaining > 0) {
    result.push({ length: 2000, weight: LADDER_WEIGHTS[2000] });
  }

  const sectionWeight = result.reduce((s, r) => s + r.weight, 0);
  const sectionCount = result.length;
  const spigotCount = Math.max(0, sectionCount - 1);
  return { sectionWeight, sectionCount, spigotCount };
}

/**
 * Split a side length into toeboard sections. Catalog max toeboard length is
 * 2570mm — anything longer must be assembled from multiple sections joined
 * end-to-end. Returns the list of section lengths (last section may be shorter
 * than 2570mm to fit the remainder).
 */
function splitIntoToeboardSections(totalLength: number): number[] {
  const maxLen = 2570;
  if (totalLength <= maxLen) return [totalLength];
  const sections: number[] = [];
  let remaining = totalLength;
  while (remaining > maxLen) {
    sections.push(maxLen);
    remaining -= maxLen;
  }
  if (remaining > 0) sections.push(remaining);
  return sections;
}

/**
 * Assemble a complete tower from user-requested dimensions.
 *
 * This is the core "assemble on demand" function — given a user's request
 * like "2.5x2x6m", it calculates the bay configuration and complete BOM.
 */
export function assembleTower(
  input: TowerDimensions,
  overrides?: Partial<BayConfig>
): AssemblyResult {
  const warnings: string[] = [];

  // Sections override takes precedence over bay_length_x / bays_x.
  const sections = overrides?.sections && overrides.sections.length > 0 ? overrides.sections : undefined;

  // Calculate bay configuration along X.
  // - When `sections` is provided: bayX.count = total bays across all
  //   sections, bayX.size = average bay length (for display only), and the
  //   real length is the sum of (bays × bay_length) per section.
  // - Otherwise, respect bay_length_x and bays_x overrides independently
  //   (so each can be tweaked without resetting the other).
  let bayX: { count: number; size: number };
  let actualLength: number;
  if (sections) {
    const totalBays = sections.reduce((s, sec) => s + sec.bays, 0);
    const totalLen = sections.reduce((s, sec) => s + sec.bays * sec.bay_length, 0);
    bayX = { count: totalBays, size: Math.round(totalLen / totalBays) };
    actualLength = totalLen;
  } else if (overrides?.bay_length_x != null) {
    const cnt = overrides?.bays_x ?? Math.max(1, Math.round(input.requestedLength / overrides.bay_length_x));
    bayX = { count: cnt, size: overrides.bay_length_x };
    actualLength = cnt * overrides.bay_length_x;
  } else if (overrides?.bays_x != null) {
    bayX = { count: overrides.bays_x, size: closestStandard(input.requestedLength, STANDARD_BAY_LENGTHS) };
    actualLength = bayX.count * bayX.size;
  } else {
    bayX = calculateBays(input.requestedLength, STANDARD_BAY_LENGTHS);
    actualLength = bayX.count * bayX.size;
  }

  // Same pattern for bayY — bay_length_y override is now respected
  // independently of bays_y.
  let bayY: { count: number; size: number };
  if (overrides?.bay_length_y != null) {
    const cnt = overrides?.bays_y ?? Math.max(1, Math.round(input.requestedWidth / overrides.bay_length_y));
    bayY = { count: cnt, size: overrides.bay_length_y };
  } else if (overrides?.bays_y != null) {
    bayY = { count: overrides.bays_y, size: closestStandard(input.requestedWidth, STANDARD_BAY_WIDTHS) };
  } else {
    bayY = calculateBays(input.requestedWidth, STANDARD_BAY_WIDTHS);
  }

  const liftHeight = overrides?.lift_height ?? closestStandard(
    Math.min(input.requestedHeight, 2000),
    STANDARD_LIFT_HEIGHTS
  );
  const numLifts = overrides?.num_lifts ?? Math.max(1, Math.round(input.requestedHeight / liftHeight));

  const actualWidth = bayY.count * bayY.size;
  const actualHeight = numLifts * liftHeight;

  // Secondary access auto-triggers at ≥20m height OR ≥20m length.
  const secondary_access =
    overrides?.secondary_access ??
    (numLifts * liftHeight >= 20000 || actualLength >= 20000);

  const config: BayConfig = {
    bays_x: bayX.count,
    bays_y: bayY.count,
    bay_length_x: bayX.size,
    bay_length_y: bayY.size,
    lift_height: liftHeight,
    num_lifts: numLifts,
    base_type: overrides?.base_type ?? "jack",
    include_gratings: overrides?.include_gratings ?? true,
    include_toeboards: overrides?.include_toeboards ?? true,
    include_braces: overrides?.include_braces ?? true,
    disabled_platform_levels: overrides?.disabled_platform_levels ?? [],
    include_ladder: overrides?.include_ladder ?? false,
    plank_width: overrides?.plank_width ?? 320,
    secondary_access,
    sections,
  };

  // Warn if actual differs significantly from requested
  const lengthDiff = Math.abs(actualLength - input.requestedLength);
  const widthDiff = Math.abs(actualWidth - input.requestedWidth);
  const heightDiff = Math.abs(actualHeight - input.requestedHeight);

  if (!sections && lengthDiff > 200) {
    warnings.push(
      `Length adjusted from ${input.requestedLength}mm to ${actualLength}mm (standard bay size ${bayX.size}mm × ${bayX.count} bays)`
    );
  }
  if (widthDiff > 200) {
    warnings.push(
      `Width adjusted from ${input.requestedWidth}mm to ${actualWidth}mm (standard bay size ${bayY.size}mm × ${bayY.count} bays)`
    );
  }
  if (heightDiff > 200) {
    warnings.push(
      `Height adjusted from ${input.requestedHeight}mm to ${actualHeight}mm (${numLifts} lifts × ${liftHeight}mm)`
    );
  }

  // ─── BUILD PART COUNTS ───
  // For sections, numStandards in X = totalBays + 1 (standards shared at
  // section boundaries). For uniform bays, (bayX.count + 1). Same number.
  const numStandards = (bayX.count + 1) * (bayY.count + 1);
  const rosettesPerStandard = numLifts;
  const rosettes = numStandards * rosettesPerStandard;

  // Group bays along X by bay_length (for sections, multiple lengths).
  // For uniform bays, the group is just { [bayX.size]: bayX.count }.
  const bayLengthGroupsX: Record<number, number> = {};
  if (sections) {
    for (const sec of sections) {
      bayLengthGroupsX[sec.bay_length] = (bayLengthGroupsX[sec.bay_length] ?? 0) + sec.bays;
    }
  } else {
    bayLengthGroupsX[bayX.size] = bayX.count;
  }

  // Y-ledgers per level: (bayX.count + 1) standards in X × bayY.count bays in Y
  const ledgersYPerLevel = (bayX.count + 1) * bayY.count;

  // Total X-ledgers across all lift levels + basement
  let ledgersXTotal = 0;
  for (const numBays of Object.values(bayLengthGroupsX)) {
    ledgersXTotal += numBays * (bayY.count + 1) * (numLifts + 1);
  }
  const ledgersYTotal = ledgersYPerLevel * (numLifts + 1);
  const ledgers = ledgersXTotal + ledgersYTotal;

  // Braces — per bay_length group. Each bay_length from X sections + bay_length_y
  // gets its own BOM entry. Face count for X-bayLen = 2 × baysWithThisXLength;
  // for Y-bayLen = 2 × bayY.count. Brace qty = faceCount × numLifts.
  const braceGroups: { bayLength: number; faceCount: number }[] = [];
  let totalBraces = 0;
  for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
    const faceCount = 2 * numBays; // front + back of each X-bay
    braceGroups.push({ bayLength: parseInt(lenStr), faceCount });
    totalBraces += faceCount * numLifts;
  }
  if (config.include_braces) {
    const yFaceCount = 2 * bayY.count; // left + right ends of the tower
    braceGroups.push({ bayLength: bayY.size, faceCount: yFaceCount });
    totalBraces += yFaceCount * numLifts;
  }
  const braces = config.include_braces ? totalBraces : 0;

  // Base jacks or wheels
  const baseJacks = numStandards;

  // Gratings count — planksPerBay = floor(bay_length / plank_width).
  // Access bay (i=0) gets planksPerBay - 1 (one row open for ladder).
  // Other bays get full count. Grating length = bay_length_y.
  const enabledLevels = numLifts - config.disabled_platform_levels.length;
  let gratings = 0;
  if (config.include_gratings) {
    if (sections) {
      let bayIdx = 0;
      for (const sec of sections) {
        const planksPerBay = Math.max(1, Math.floor(sec.bay_length / config.plank_width));
        for (let i = 0; i < sec.bays; i++) {
          const count = bayIdx === 0 ? Math.max(0, planksPerBay - 1) : planksPerBay;
          gratings += count * bayY.count * enabledLevels;
          bayIdx++;
        }
      }
    } else {
      const planksPerBay = Math.max(1, Math.floor(bayX.size / config.plank_width));
      const accessBayGratings = Math.max(0, planksPerBay - 1) * bayY.count * enabledLevels;
      const otherBayGratings = planksPerBay * Math.max(0, bayX.count - 1) * bayY.count * enabledLevels;
      gratings = accessBayGratings + otherBayGratings;
    }
  }
  const planks = gratings; // alias for PartsBom object

  // Toeboards: 3 sides per level
  const toeboards = config.include_toeboards ? 3 * numLifts : 0;

  // ─── BUILD DETAILED BOM WITH STANDARD CATALOG WEIGHTS ───
  const details: BomDetailItem[] = [];
  let totalWeight = 0;

  // STANDARDS: split tower height into standard lengths (max 3m each).
  // Catalog MDCSTA0xxx — fallback formula derived from slope of catalog data
  // (slope ≈ 4.5 kg/m, intercept ≈ 1.0).
  const towerHeightTotal = numLifts * liftHeight;
  const standardSegments = splitIntoStandards(towerHeightTotal);
  const standardGroups: Record<number, number> = {};
  for (const seg of standardSegments) {
    standardGroups[seg.length] = (standardGroups[seg.length] ?? 0) + 1;
  }
  for (const [len, count] of Object.entries(standardGroups)) {
    const lenNum = parseInt(len);
    const qty = count * numStandards;
    const unitW = lookupWeight(STANDARD_WEIGHTS, lenNum, 4.5, 1.0);
    const totalW = qty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Standard",
      description: `Cuplock standard ${lenNum / 1000}m (48.3×3.2) — MDCSTA${String(lenNum).padStart(4, "0")}`,
      size: `${lenNum}mm`,
      quantity: qty,
      unit_weight_kg: Math.round(unitW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // LEDGERS along X — grouped by bay_length (one BOM line per length).
  // Catalog MDCLED0xxx — fallback formula (slope ≈ 3.5 kg/m, intercept ≈ 1.0).
  // For long bays (>= 1570mm), use reinforced ledger weights (MDCRLE0xxx)
  // when the bay_length is in that catalog — they're the proper spec for
  // heavy-duty X-ledger spans.
  for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
    const len = parseInt(lenStr);
    const ledgersXForThisLength = numBays * (bayY.count + 1); // per level
    const ledgerXQty = ledgersXForThisLength * (numLifts + 1); // + basement
    const useReinforced = REINFORCED_LEDGER_WEIGHTS[len] != null;
    const ledgerXWeight = useReinforced
      ? REINFORCED_LEDGER_WEIGHTS[len]
      : lookupWeight(LEDGER_WEIGHTS, len, 3.5, 1.0);
    const totalW = ledgerXQty * ledgerXWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: useReinforced
        ? `Reinforced ledger ${len}mm (48.3×3.2) incl. basement — MDCRLE${String(len).padStart(4, "0")}`
        : `Ledger ${len}mm (48.3×3.2) incl. basement reinforcing — MDCLED${String(len).padStart(4, "0")}`,
      size: `${len}mm`,
      quantity: ledgerXQty,
      unit_weight_kg: Math.round(ledgerXWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // LEDGERS along Y (including basement reinforcing).
  // Catalog MDCLED0xxx — Y-ledgers use regular (not reinforced) catalog.
  {
    const ledgerYWeight = lookupWeight(LEDGER_WEIGHTS, bayY.size, 3.5, 1.0);
    const ledgerYQty = ledgersYPerLevel * (numLifts + 1);
    const totalW = ledgerYQty * ledgerYWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: `Ledger ${bayY.size}mm (48.3×3.2) incl. basement reinforcing — MDCLED${String(bayY.size).padStart(4, "0")}`,
      size: `${bayY.size}mm`,
      quantity: ledgerYQty,
      unit_weight_kg: Math.round(ledgerYWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // DIAGONAL BRACES — one BOM line per bay_length group.
  // Catalog MDCVDB0xxx (keyed by bay_length, valid for 2000mm lift height).
  // For other lift heights, weight is scaled by the ratio of actual brace
  // length to the catalog (2000mm lift) brace length.
  if (braces > 0) {
    const catalogLiftHeight = 2000;
    for (const group of braceGroups) {
      const braceLengthMm = Math.sqrt(group.bayLength ** 2 + liftHeight ** 2);
      const catalogBraceLength = Math.sqrt(group.bayLength ** 2 + catalogLiftHeight ** 2);
      const catalogWeight = lookupWeight(BRACE_WEIGHTS, group.bayLength, 3.0, 3.0);
      // Scale by actual-vs-catalog brace length (handles non-2000mm lifts)
      const braceW = liftHeight === catalogLiftHeight
        ? catalogWeight
        : catalogWeight * (braceLengthMm / catalogBraceLength);
      const qty = group.faceCount * numLifts;
      const totalW = qty * braceW;
      totalWeight += totalW;
      details.push({
        part_type: "Diagonal brace",
        description: `Diagonal brace ${Math.round(braceLengthMm)}mm (48.3×2.5) — MDCVDB${String(group.bayLength).padStart(4, "0")}${liftHeight !== catalogLiftHeight ? ` (scaled from 2000mm lift)` : ""}`,
        size: `${Math.round(braceLengthMm)}mm`,
        quantity: qty,
        unit_weight_kg: Math.round(braceW * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // BASE ASSEMBLY (sole board + base collar + base jack/wheel per standard).
  // Reference BOMs include all three per standard base. Default base jack
  // changed to FIX (MDCFBJ0600) to match both reference BOMs.
  //   MDCSLB0450  SOLE BOARDS0450    = 1.80 kg  (1 per standard, jack base only)
  //   MDCBCO0280  BASE_COLLAR        = 1.72 kg  (1 per standard, jack base only)
  //   MDCFBJ0600  FIX_BASE_JACK      = 3.39 kg  (default for "jack" type)
  //   MDCBCO0600  SWIVEL_BASE_JACK   = 3.81 kg  (alternative jack — not default)
  //   MDCWHE0300  WHEEL              = 17.00 kg (heavy-duty total-lock)
  {
    const isWheel = config.base_type === "wheel";
    const unitW = isWheel ? WHEEL_WEIGHT : FIXED_BASE_JACK_WEIGHT;
    const desc = isWheel
      ? 'Wheel (heavy-duty total-lock) — MDCWHE0300'
      : "Fix base jack 38×600mm — MDCFBJ0600";
    const totalW = baseJacks * unitW;
    totalWeight += totalW;
    details.push({
      part_type: isWheel ? "Caster wheel" : "Base jack",
      description: desc,
      size: isWheel ? "Ø200×50mm" : "38×600mm",
      quantity: baseJacks,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });

    // Sole boards + base collars — only for jack bases (wheels have their
    // own mounting, no sole board needed).
    if (!isWheel) {
      const soleW = baseJacks * SOLE_BOARD_WEIGHT;
      totalWeight += soleW;
      details.push({
        part_type: "Sole board",
        description: "Sole board 450mm (under base jack) — MDCSLB0450",
        size: "450mm",
        quantity: baseJacks,
        unit_weight_kg: SOLE_BOARD_WEIGHT,
        total_weight_kg: Math.round(soleW * 100) / 100,
      });

      const collarW = baseJacks * BASE_COLLAR_WEIGHT;
      totalWeight += collarW;
      details.push({
        part_type: "Base collar",
        description: "Base collar (connects jack to standard) — MDCBCO0280",
        size: "280mm",
        quantity: baseJacks,
        unit_weight_kg: BASE_COLLAR_WEIGHT,
        total_weight_kg: Math.round(collarW * 100) / 100,
      });
    }
  }

  // SPIGOT WITH COUPLER for stacked standards (MDCSWC0125 = 1.25 kg).
  // When tower height > 3m, each standard stack is assembled from multiple
  // segments (3m + 3m + 2m for 8m, etc.) joined by spigot couplers.
  // Number of spigots per stack = (number of segments - 1).
  {
    const segmentsPerStack = standardSegments.length;
    const spigotsPerStack = Math.max(0, segmentsPerStack - 1);
    const spigotQty = spigotsPerStack * numStandards;
    if (spigotQty > 0) {
      const totalW = spigotQty * SPIGOT_WITH_COUPLER_WEIGHT;
      totalWeight += totalW;
      details.push({
        part_type: "Spigot with coupler",
        description: `Spigot with coupler (standard joint) — MDCSWC0125  ×${spigotsPerStack} per standard`,
        size: "125mm",
        quantity: spigotQty,
        unit_weight_kg: SPIGOT_WITH_COUPLER_WEIGHT,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // GRATINGS (steel planks with hook, width = plank_width, length = bay_length_x).
  // Catalog MDCSPH0xxx. The planks span across the X-bay (rest on Y-ledgers),
  // so plank LENGTH = bay_length_x (per section). One BOM line per unique
  // bay_length so each catalog size gets its own entry.
  // For 230mm planks, weights are scaled by 230/320 = 0.719.
  if (gratings > 0) {
    const pw = config.plank_width;
    const plankWeights = plankWeightTable(pw);
    const enabledLevelsCount = numLifts - config.disabled_platform_levels.length;
    const gap = 4;

    for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
      const len = parseInt(lenStr);
      const planksPerBay = Math.max(1, Math.floor((len + gap) / (pw + gap)));
      // Access bay (first bay of first section) has one row open for trapdoor.
      const accessBayLength = sections ? sections[0].bay_length : bayX.size;
      const isAccessLength = len === accessBayLength;
      const accessBaysAtThisLength = isAccessLength ? 1 : 0;
      const nonAccessBaysAtThisLength = numBays - accessBaysAtThisLength;
      const planksThisLength = (
        Math.max(0, planksPerBay - 1) * accessBaysAtThisLength +
        planksPerBay * nonAccessBaysAtThisLength
      ) * bayY.count * enabledLevelsCount;
      if (planksThisLength <= 0) continue;

      const unitW = lookupWeight(plankWeights, len, plankKgPerM(pw), plankEndWeight(pw));
      const totalW = planksThisLength * unitW;
      totalWeight += totalW;
      details.push({
        part_type: "Grating",
        description: `Steel hook plank ${pw}×${len}mm — MDCSPH${String(len).padStart(4, "0")}${pw === 230 ? " (230mm scaled)" : ""}`,
        size: `${pw}×${len}mm`,
        quantity: planksThisLength,
        unit_weight_kg: Math.round(unitW * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // TOEBOARDS — per-length catalog weights (MDCTOB0xxx).
  // 3 sides per level: 1 along X (back, length=towerX) + 2 along Y (left/right,
  // length=towerY each). Front (+Y) is open for access.
  // Each side longer than the catalog max (2570mm) is split into multiple
  // sections joined end-to-end; sections are grouped by length for the BOM.
  if (toeboards > 0) {
    const towerXmm = sections
      ? sections.reduce((s, sec) => s + sec.bays * sec.bay_length, 0)
      : bayX.count * bayX.size;
    const towerYmm = bayY.count * bayY.size;

    // Per-side section lists (one entry per section, length in mm).
    const backSections = splitIntoToeboardSections(towerXmm);
    const sideSections = splitIntoToeboardSections(towerYmm);

    // Group: { length -> { backQty, sideQty } } across all lift levels.
    const toeboardGroups: Record<number, { backQty: number; sideQty: number }> = {};
    for (const lenMm of backSections) {
      toeboardGroups[lenMm] = toeboardGroups[lenMm] ?? { backQty: 0, sideQty: 0 };
      toeboardGroups[lenMm].backQty += numLifts;
    }
    for (const lenMm of sideSections) {
      toeboardGroups[lenMm] = toeboardGroups[lenMm] ?? { backQty: 0, sideQty: 0 };
      toeboardGroups[lenMm].sideQty += 2 * numLifts; // 2 sides per level
    }

    for (const [lenStr, { backQty, sideQty }] of Object.entries(toeboardGroups)) {
      const lenMm = parseInt(lenStr);
      const totalQty = backQty + sideQty;
      if (totalQty === 0) continue;
      const unitW = lookupWeight(TOEBOARD_WEIGHTS, lenMm, 3.0, 1.0);
      const totalW = totalQty * unitW;
      totalWeight += totalW;
      const sideTags: string[] = [];
      if (backQty > 0) sideTags.push(`back ×${backQty}`);
      if (sideQty > 0) sideTags.push(`sides ×${sideQty}`);
      details.push({
        part_type: "Toeboard",
        description: `Toeboard ${lenMm}mm (yellow, 100mm high, ${sideTags.join(", ")}) — MDCTOB${String(lenMm).padStart(4, "0")}`,
        size: `${lenMm}mm`,
        quantity: totalQty,
        unit_weight_kg: Math.round(unitW * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // GUARDRAIL POSTS (top level only).
  // Catalog doesn't list a guardrail-post assembled item — keep the 8.35 kg
  // estimate (post + end fittings + small rosette). TUBE_1000 = 3.55 kg in
  // catalog is just bare pipe, not the assembled post.
  // NOTE: Reference BOMs don't list guardrail posts separately — they appear
  // to be baked into the trapdoor-with-ladder assembly. Kept here as an
  // engineering estimate so the tonnage isn't under-counted.
  {
    const grQty = numStandards;
    const unitW = 8.35;
    const totalW = grQty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Guardrail post",
      description: "Guardrail post 1m (38×2.5) incl. fittings (estimated)",
      size: "1000mm",
      quantity: grQty,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // TRAPDOOR WITH LADDER (MDCWL0xxx) — at each lift on access bays.
  // Each access bay has 1 trapdoor per lift (replaces a section of grating).
  // Per reference BOMs: 8 trapdoors for 4 lifts → 2 access bays × 4 lifts.
  // Length chosen from catalog: closest to access bay's bay_length_x.
  if (config.include_gratings && config.include_ladder) {
    const accessBayLength = sections ? sections[0].bay_length : bayX.size;
    // Pick closest catalog trapdoor length
    const trapdoorKeys = Object.keys(TRAPDOOR_WEIGHTS).map(Number);
    const trapdoorLen = trapdoorKeys.reduce((closest, current) =>
      Math.abs(current - accessBayLength) < Math.abs(closest - accessBayLength)
        ? current : closest, trapdoorKeys[0]);
    const numAccessBays = 1 + (config.secondary_access ? 1 : 0);
    const trapdoorQty = numAccessBays * numLifts;
    const unitW = TRAPDOOR_WEIGHTS[trapdoorLen];
    const totalW = trapdoorQty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Trapdoor with ladder",
      description: `Trapdoor with ladder ${trapdoorLen}mm — MDCTWL${String(trapdoorLen).padStart(4, "0")}  ×${numAccessBays} access bay(s) × ${numLifts} lifts`,
      size: `${trapdoorLen}mm`,
      quantity: trapdoorQty,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // STEEL GAP FILLER (MDCSGF0xxx) — bridges residual gap between steel planks
  // and ledgers. Per reference BOMs: ~2 per bay (one at each end of the bay
  // along X). Length chosen from catalog: closest to (bay_length - 50mm).
  // Grouped by catalog length.
  if (config.include_gratings && gratings > 0) {
    const gapFillerGroups: Record<number, number> = {};
    const addGapFillersForBayLength = (bayLength: number, numBays: number) => {
      // 2 gap fillers per bay (one at each end), not per lift.
      const qty = numBays * 2;
      if (qty <= 0) return;
      const targetLen = bayLength - 50;
      const gapKeys = Object.keys(GAP_FILLER_WEIGHTS).map(Number);
      const gapLen = gapKeys.reduce((closest, current) =>
        Math.abs(current - targetLen) < Math.abs(closest - targetLen)
          ? current : closest, gapKeys[0]);
      gapFillerGroups[gapLen] = (gapFillerGroups[gapLen] ?? 0) + qty;
    };

    if (sections) {
      sections.forEach((sec) => {
        addGapFillersForBayLength(sec.bay_length, sec.bays);
      });
    } else {
      addGapFillersForBayLength(bayX.size, bayX.count);
    }

    for (const [lenStr, qty] of Object.entries(gapFillerGroups)) {
      const lenMm = parseInt(lenStr);
      if (qty <= 0) continue;
      const unitW = GAP_FILLER_WEIGHTS[lenMm];
      const totalW = qty * unitW;
      totalWeight += totalW;
      details.push({
        part_type: "Steel gap filler",
        description: `Steel gap filler ${lenMm}mm (between planks and ledgers, 2 per bay) — MDCSGF${String(lenMm).padStart(4, "0")}`,
        size: `${lenMm}mm`,
        quantity: qty,
        unit_weight_kg: unitW,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // PRIMARY LADDER (if enabled).
  // Catalog: MDCMON2000 = 5.75 kg, MDCMON3000 = 7.96 kg (Monker ladder sections).
  // Towers taller than 3m stack 3m + 2m sections + spigot couplers
  // (MDCSWC0125 = 1.25 kg each). Linear interpolation between catalog sizes.
  if (config.include_ladder) {
    const { sectionWeight, sectionCount, spigotCount } = computeLadderAssembly(towerHeightTotal);
    const totalW = sectionWeight + spigotCount * SPIGOT_WITH_COUPLER_WEIGHT;
    const rungCount = Math.floor(towerHeightTotal / 300);
    totalWeight += totalW;
    details.push({
      part_type: "Ladder",
      description: `Primary vertical ladder — ${sectionCount} section(s) + ${spigotCount} spigot(s), 2×Ø30 rail + ${rungCount} rungs @300mm`,
      size: `${towerHeightTotal}mm`,
      quantity: 1,
      unit_weight_kg: Math.round(totalW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // SECONDARY LADDER (escape, auto at ≥20m height/length).
  // Same catalog logic as primary ladder (MDCMON2000/3000 sections + spigots).
  if (config.secondary_access) {
    const { sectionWeight, sectionCount, spigotCount } = computeLadderAssembly(towerHeightTotal);
    const totalW = sectionWeight + spigotCount * SPIGOT_WITH_COUPLER_WEIGHT;
    const rungCount = Math.floor(towerHeightTotal / 300);
    totalWeight += totalW;
    details.push({
      part_type: "Ladder",
      description: `Secondary vertical ladder (escape) — ${sectionCount} section(s) + ${spigotCount} spigot(s), 2×Ø30 rail + ${rungCount} rungs @300mm`,
      size: `${towerHeightTotal}mm`,
      quantity: 1,
      unit_weight_kg: Math.round(totalW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // REMOVABLE STAIRCASE + ACCESSORIES (MDCRSC2134 + MDCGRFS2134 + MDCSFS0860).
  // Per reference BOM façade Tana 1 (50×2×8m): 8 staircases, 8 guard rails,
  // 40 steps (5 per staircase). Spacing ≈ 6m along tower length.
  // Triggered when secondary_access is true (auto at ≥20m height/length).
  if (config.secondary_access) {
    const staircaseCount = Math.max(1, Math.floor(actualLength / STAIRCASE_SPACING_MM));
    const staircaseTotalW = staircaseCount * REMOVABLE_STAIRCASE_WEIGHT;
    const guardRailTotalW = staircaseCount * STAIRCASE_GUARD_RAIL_WEIGHT;
    const stepQty = staircaseCount * STEPS_PER_STAIRCASE;
    const stepTotalW = stepQty * STAIRCASE_STEP_WEIGHT;

    totalWeight += staircaseTotalW + guardRailTotalW + stepTotalW;

    details.push({
      part_type: "Removable staircase",
      description: `Removable staircase 2134mm — MDCRSC2134  (1 per ~6m of length)`,
      size: "2134mm",
      quantity: staircaseCount,
      unit_weight_kg: REMOVABLE_STAIRCASE_WEIGHT,
      total_weight_kg: Math.round(staircaseTotalW * 100) / 100,
    });
    details.push({
      part_type: "Staircase guard rail",
      description: `Guard rail for staircase — MDCGRFS2134  (1 per staircase)`,
      size: "2134mm",
      quantity: staircaseCount,
      unit_weight_kg: STAIRCASE_GUARD_RAIL_WEIGHT,
      total_weight_kg: Math.round(guardRailTotalW * 100) / 100,
    });
    details.push({
      part_type: "Staircase step",
      description: `Step for staircase — MDCSFS0860  (5 per staircase)`,
      size: "860mm",
      quantity: stepQty,
      unit_weight_kg: STAIRCASE_STEP_WEIGHT,
      total_weight_kg: Math.round(stepTotalW * 100) / 100,
    });
  }

  const estimatedWeight = Math.round(totalWeight);

  const bom: PartsBom = {
    standards: numStandards,
    ledgers,
    braces,
    base_jacks: baseJacks,
    rosettes,
    planks,
    gratings,
    toeboards,
    total_parts: numStandards + ledgers + braces + baseJacks + rosettes + planks + gratings + toeboards,
    estimated_weight_kg: Math.round(estimatedWeight),
    details,
  };

  return {
    input,
    config,
    bom,
    actualDimensions: {
      length: actualLength,
      width: actualWidth,
      height: actualHeight,
    },
    warnings,
  };
}

/**
 * Convert an AssemblyResult into a TowerConfig that can be sent to the
 * STEP generation API.
 */
export function assemblyToTowerConfig(result: AssemblyResult) {
  return {
    type: "tower" as const,
    bays_x: result.config.bays_x,
    bays_y: result.config.bays_y,
    bay_length_x: result.config.bay_length_x,
    bay_length_y: result.config.bay_length_y,
    lift_height: result.config.lift_height,
    num_lifts: result.config.num_lifts,
    tube_od: 48.3,
    tube_wall: 3.2,
    rosette_pitch: 500,
    rosette_disc_od: 122,
    rosette_thickness: 10,
    rosette_center_bore: 50,
    spigot_od: 38,
    spigot_length: 150,
    ledger_od: 48.3,
    ledger_wall: 3.2,
    include_braces: result.config.include_braces,
    include_base_jacks: result.config.base_type === "jack",
    base_jack_od: 38,
    base_jack_length: 600,
    include_planks: false,
    plank_thickness: 50,
    include_gratings: result.config.include_gratings,
    include_toeboards: result.config.include_toeboards,
    base_type: result.config.base_type,
    disabled_platform_levels: result.config.disabled_platform_levels,
    include_ladder: result.config.include_ladder,
    plank_width: result.config.plank_width,
    secondary_access: result.config.secondary_access,
    sections: result.config.sections,
  };
}

/**
 * Format dimensions for display.
 */
export function formatDimensions(dim: { length: number; width: number; height: number }): string {
  const m = (mm: number) => (mm / 1000).toFixed(2).replace(/\.?0+$/, "");
  return `${m(dim.length)}m × ${m(dim.width)}m × ${m(dim.height)}m`;
}

/**
 * Quick presets for common tower sizes.
 */
export const TOWER_PRESETS: Array<{
  label: string;
  input: string;
  description: string;
  sections?: Array<{ bays: number; bay_length: number }>;
}> = [
  {
    label: "Mobile tower",
    input: "1x1x2m",
    description: "Single bay, 4-leg mobile tower, 2m high",
  },
  {
    label: "Work platform",
    input: "2x1x4m",
    description: "2-bay work platform, 4m high, with planks",
  },
  {
    label: "Access tower",
    input: "2x2x6m",
    description: "Big access tower, 9 standards, 6m high",
  },
  {
    label: "Façade scaffold",
    input: "3x1x8m",
    description: "Long façade scaffold, 8m high",
  },
  {
    label: "Heavy-duty",
    input: "2x2x10m",
    description: "Heavy-duty access tower, 10m high",
  },
  {
    label: "Mixed 4m + 3m",
    input: "25x1x8m",
    description: "Mixed sections: 19 bays × 3070mm + 6 bays × 2570mm, 8m high",
    sections: [
      { bays: 19, bay_length: 3070 },
      { bays: 6, bay_length: 2570 },
    ],
  },
];
