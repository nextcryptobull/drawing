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
  base_type: "jack" | "wheel" | "suspended";
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
  /** Staircase type: 'ladder' (15° inclined, compact) or 'stairs' (proper staircase with flat treads) */
  staircase_type: "ladder" | "stairs";
  /** Staircase type for SECONDARY access (escape) — independent of primary.
   *  Defaults to 'ladder' if not set. */
  secondary_staircase_type?: "ladder" | "stairs";
  /** Staircase tower mode: stairs in ALL bays (not just access bay), alternating per lift */
  staircase_tower: boolean;
  /** Door opening: creates a walk-through passage in the scaffold frame.
      Position = which bay (0-indexed). Width and height in mm.
      When set, ledgers + braces are removed at that bay/level to create the passage. */
  door_opening?: {
    bay_index: number;  // which bay has the door (0-indexed)
    width: number;      // door width in mm (e.g., 900)
    height: number;     // door height in mm (e.g., 2000)
  };
  /** Plank width: 320mm (heavy-duty) or 230mm (light) */
  plank_width: 320 | 230;
  /** Suspended beam length (when base_type='suspended'): 4000 or 6000mm */
  suspended_beam_length: 4000 | 6000;
  /** Secondary access ladder (auto at >=20m height or length) */
  secondary_access: boolean;
  /** Optional mixed sections (overrides bays_x/bay_length_x) */
  sections?: Array<{ bays: number; bay_length: number; label?: string }>;
  /** Optional scaffold path (L-shaped, U-shaped, angled corners).
      Each segment has bays + length + turn angle (degrees).
      When set, overrides sections + bays_x/bay_length_x. */
  scaffold_path?: Array<{
    bays: number;
    bay_length: number;
    turn_angle: number; // 0=straight, 90=right, -90=left, 180=U-turn
    label?: string;
  }>;
  /** Optional circular scaffold layout (around tanks/towers).
      When set, overrides sections + bays_x/bay_length_x + scaffold_path. */
  circular_layout?: {
    diameter_mm: number;       // outer scaffold diameter
    num_segments: number;      // number of bays around the circle (e.g., 12)
    bay_width_mm: number;      // scaffold width (radial depth, e.g., 2000)
    label?: string;            // optional label (ACCESS / STAIRCASE / REINFORCED)
  };
  /** Include filler planks (gap fillers between gratings and ledgers).
   *  Renders thin steel planks at the edges of each grating platform. */
  include_fillers?: boolean;
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
 * Note: catalog uses 2072mm (MDCRLE2072), but standard bay length is 2070mm.
 * Both 2070 and 2072 map to the same catalog item (2mm tolerance).
 */
const REINFORCED_LEDGER_WEIGHTS: Record<number, number> = {
  1570: 9.08,   // MDCRLE1570
  2000: 10.00,  // MDCRLE2000 (interpolated between 1570=9.08 and 2070=12.00)
  2070: 12.00,  // MDCRLE2072 (bay_length 2070mm → catalog 2072mm)
  2072: 12.00,  // MDCRLE2072 (exact catalog match)
  2130: 12.32,  // MDCRLE2130 (same as 2134 — catalog tolerance)
  2134: 12.32,  // MDCRLE2134
  2500: 13.50,  // MDCRLE2500 (interpolated between 2070=12.00 and 2570=14.54)
  2570: 14.54,  // MDCRLE2570
  3070: 16.00,  // MDCRLE3070 (extrapolated from 2570=14.54)
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
 * Ladder beam weights (kg) — from BOM blank.xlsx catalog.
 * Source rows r66–r69 (MDCLBE0xxx). Used for suspended frame support.
 * Ladder beams span across the scaffold width and support the frame from above.
 */
const LADDER_BEAM_WEIGHTS: Record<number, number> = {
  2000: 20.80,   // MDCLBE2000
  3000: 32.40,   // MDCLBE3000
  4000: 46.00,   // MDCLBE4000
  6000: 64.80,   // MDCLBE6000
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
 * Split a total height into standard lengths.
 * Uses ONLY 3m standards (matches reference BOM practice — no 2m or shorter
 * standards, no spigot couplers needed). If the height doesn't divide evenly
 * by 3000, the last standard is trimmed (cut to size on site).
 */
function splitIntoStandards(totalHeight: number): { length: number; weight: number }[] {
  const result: { length: number; weight: number }[] = [];
  const stdLen = 3000;
  const numFull = Math.floor(totalHeight / stdLen);
  for (let i = 0; i < numFull; i++) {
    result.push({ length: stdLen, weight: STANDARD_WEIGHTS[stdLen] });
  }
  // Remainder: use a 3m standard trimmed to size (still billed as 3m)
  if (totalHeight % stdLen > 0) {
    result.push({ length: stdLen, weight: STANDARD_WEIGHTS[stdLen] });
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
    staircase_type: overrides?.staircase_type ?? "ladder",
    secondary_staircase_type: overrides?.secondary_staircase_type ?? "ladder",
    staircase_tower: overrides?.staircase_tower ?? false,
    door_opening: overrides?.door_opening,
    scaffold_path: overrides?.scaffold_path,
    circular_layout: overrides?.circular_layout,
    include_fillers: overrides?.include_fillers ?? false,
    plank_width: overrides?.plank_width ?? 320,
    suspended_beam_length: overrides?.suspended_beam_length ?? 4000,
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

  // Door opening: subtract removed Y-ledgers at the door bay (-Y face)
  // Each lift level below the door height has 1 Y-ledger removed at -Y face
  let doorLedgersRemoved = 0;
  if (config.door_opening) {
    const doorLifts = Math.ceil(config.door_opening.height / liftHeight);
    doorLedgersRemoved = doorLifts + 1; // +1 for basement level
  }
  const ledgers = ledgersXTotal + ledgersYTotal - doorLedgersRemoved;

  // Braces — per bay_length group. Diagonals are placed at every 3rd bay
  // and at the two extremities (bay 0 + last bay) per the user's rule:
  // "Diagonals are needed at every 3rd bays and at two extremities."
  // Face count for X-bayLen = 2 × bracedBaysAtThisLength (front + back);
  // for Y-bayLen = 2 × bayY.count (left + right ends, always braced).
  const totalBaysCount = sections
    ? sections.reduce((s, sec) => s + sec.bays, 0)
    : bayX.count;
  const lastBayIdx = totalBaysCount - 1;
  const shouldBraceBay = (bi: number) =>
    bi === 0 || bi % 3 === 0 || bi === lastBayIdx;

  // Count braced bays per bay_length
  const bracedBaysByLength: Record<number, number> = {};
  if (sections) {
    let bayIdx = 0;
    for (const sec of sections) {
      for (let i = 0; i < sec.bays; i++) {
        if (shouldBraceBay(bayIdx)) {
          bracedBaysByLength[sec.bay_length] = (bracedBaysByLength[sec.bay_length] ?? 0) + 1;
        }
        bayIdx++;
      }
    }
  } else {
    for (let bi = 0; bi < bayX.count; bi++) {
      if (shouldBraceBay(bi)) {
        bracedBaysByLength[bayX.size] = (bracedBaysByLength[bayX.size] ?? 0) + 1;
      }
    }
  }

  const braceGroups: { bayLength: number; faceCount: number }[] = [];
  let totalBraces = 0;
  for (const [lenStr, numBracedBays] of Object.entries(bracedBaysByLength)) {
    const faceCount = 2 * numBracedBays; // front + back of each braced X-bay
    braceGroups.push({ bayLength: parseInt(lenStr), faceCount });
    totalBraces += faceCount * numLifts;
  }
  // (Y-axis braces removed — reference BOM doesn't list them.
  //  Only X-axis perimeter braces are counted, matching reference practice.)
  const braces = config.include_braces ? totalBraces : 0;

  // Base jacks or wheels
  const baseJacks = numStandards;

  // Gratings count — planks span along X (length = bay_length_x), laid side by
  // side along Y. planksPerBay = floor(bay_length_y / plank_width).
  // Access bay (i=0):
  //   - If include_ladder or secondary_access: planksPerBay - 2 (two rows removed for staircase)
  //   - If no ladder: planksPerBay - 1 (one row removed for trapdoor access)
  // Secondary access bay (last bay, if secondary_access):
  //   - planksPerBay - 2 (two rows removed for escape staircase)
  // Other bays: full count. Grating length = bay_length_x per section.
  const enabledLevels = numLifts - config.disabled_platform_levels.length;
  const gap = 4;
  // planksPerBay is based on bay_length_y (the Y width), not bay_length_x
  const planksPerBayY = Math.max(2, Math.floor((bayY.size + gap) / (config.plank_width + gap)));
  const accessBayPlanksRemoved = (config.include_ladder || config.secondary_access) ? 2 : 1;
  const secondaryPlanksRemoved = 2; // secondary_access always has a staircase
  let gratings = 0;
  if (config.include_gratings) {
    if (sections) {
      let bayIdx = 0;
      const totalBays = sections.reduce((s, sec) => s + sec.bays, 0);
      for (const sec of sections) {
        for (let i = 0; i < sec.bays; i++) {
          let count = planksPerBayY;
          if (bayIdx === 0) {
            count = Math.max(0, planksPerBayY - accessBayPlanksRemoved);
          } else if (bayIdx === totalBays - 1 && config.secondary_access) {
            count = Math.max(0, planksPerBayY - secondaryPlanksRemoved);
          }
          gratings += count * enabledLevels;
          bayIdx++;
        }
      }
    } else {
      const accessBayGratings = Math.max(0, planksPerBayY - accessBayPlanksRemoved) * enabledLevels;
      let otherBayGratings = planksPerBayY * Math.max(0, bayX.count - 1) * enabledLevels;
      // Secondary access bay (last bay, if separate from access bay)
      if (config.secondary_access && bayX.count > 1) {
        otherBayGratings -= secondaryPlanksRemoved * enabledLevels;
      }
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

  // LEDGERS along X — grouped by bay_length AND reinforcement status.
  // Reinforced ledgers (MDCRLE0xxx) are used at:
  //   1. Staircase extremity bays (bay 0 = primary, last bay = secondary)
  //      — these carry the staircase live load + impact forces
  //   2. Force-application bays (every 3rd bay + extremities, same as diagonals)
  //      — these carry lateral bracing forces
  // Regular ledgers (MDCLED0xxx) are used at all other bays.
  // BOM emits one line per (length, reinforced?) combination.
  const totalBaysForLedgers = sections
    ? sections.reduce((s, sec) => s + sec.bays, 0)
    : bayX.count;
  const lastBayIdxForLedgers = totalBaysForLedgers - 1;
  // Reference BOM practice: only bays explicitly marked as "REINFORCED"
  // in the text parser use reinforced ledgers (MDCRLE0xxx). Regular bays
  // always use regular ledgers (MDCLED0xxx). This matches the reference
  // BOM Tana Façade which shows MDCRLE2072 only for specific reinforced bays.
  const needsReinforcedLedger = (bayLength: number, label?: string): boolean => {
    return label === "REINFORCED" && REINFORCED_LEDGER_WEIGHTS[bayLength] != null;
  };

  // Build a map: { bayLength -> { reinforced: bayCount, regular: bayCount } }
  const ledgerBaysByLength: Record<number, { reinforced: number; regular: number }> = {};
  if (sections) {
    let bayIdx = 0;
    for (const sec of sections) {
      for (let i = 0; i < sec.bays; i++) {
        const len = sec.bay_length;
        if (!ledgerBaysByLength[len]) ledgerBaysByLength[len] = { reinforced: 0, regular: 0 };
        if (needsReinforcedLedger(len, sec.label)) {
          ledgerBaysByLength[len].reinforced++;
        } else {
          ledgerBaysByLength[len].regular++;
        }
        bayIdx++;
      }
    }
  } else {
    for (let bi = 0; bi < bayX.count; bi++) {
      const len = bayX.size;
      if (!ledgerBaysByLength[len]) ledgerBaysByLength[len] = { reinforced: 0, regular: 0 };
      if (needsReinforcedLedger(len)) {
        ledgerBaysByLength[len].reinforced++;
      } else {
        ledgerBaysByLength[len].regular++;
      }
    }
  }

  // Emit BOM lines: one for reinforced, one for regular, per bay_length
  for (const [lenStr, counts] of Object.entries(ledgerBaysByLength)) {
    const len = parseInt(lenStr);
    // Reinforced ledgers (MDCRLE0xxx) — only if catalog has this length
    if (counts.reinforced > 0) {
      const reinforcedWeight = REINFORCED_LEDGER_WEIGHTS[len];
      const useReinforced = reinforcedWeight != null;
      // If no catalog reinforced weight, fall back to regular weight + 50% safety factor
      const weight = useReinforced
        ? reinforcedWeight
        : lookupWeight(LEDGER_WEIGHTS, len, 3.5, 1.0) * 1.5;
      const ledgersXForThisLength = counts.reinforced * (bayY.count + 1); // per level
      const ledgerXQty = ledgersXForThisLength * (numLifts + 1); // + basement
      const totalW = ledgerXQty * weight;
      totalWeight += totalW;
      details.push({
        part_type: "Ledger",
        description: useReinforced
          ? `Reinforced ledger ${len}mm (48.3×3.2) incl. basement — MDCRLE${String(len).padStart(4, "0")}  (staircase/force bays: ×${counts.reinforced})`
          : `Reinforced ledger ${len}mm (estimated 1.5× regular) incl. basement  (staircase/force bays: ×${counts.reinforced})`,
        size: `${len}mm`,
        quantity: ledgerXQty,
        unit_weight_kg: Math.round(weight * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
    // Regular ledgers (MDCLED0xxx)
    if (counts.regular > 0) {
      const regularWeight = lookupWeight(LEDGER_WEIGHTS, len, 3.5, 1.0);
      const ledgersXForThisLength = counts.regular * (bayY.count + 1);
      const ledgerXQty = ledgersXForThisLength * (numLifts + 1);
      const totalW = ledgerXQty * regularWeight;
      totalWeight += totalW;
      details.push({
        part_type: "Ledger",
        description: `Ledger ${len}mm (48.3×3.2) incl. basement reinforcing — MDCLED${String(len).padStart(4, "0")}  (regular bays: ×${counts.regular})`,
        size: `${len}mm`,
        quantity: ledgerXQty,
        unit_weight_kg: Math.round(regularWeight * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // (Y-ledgers removed from BOM — reference BOM doesn't list them separately.
  //  They're counted as part of the X-ledger groups by length.)

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

  // BASE ASSEMBLY (sole board + base collar + base jack/wheel/ladder beam per standard).
  //   Jack: MDCFBJ0600 + MDCSLB0450 + MDCBCO0280
  //   Wheel: MDCWHE0300 only
  //   Suspended: MDCLBE4000 or MDCLBE6000 (ladder beams spanning the width)
  //             + suspension brackets (1 per standard, estimated 2.5 kg)
  {
    const isWheel = config.base_type === "wheel";
    const isSuspended = config.base_type === "suspended";

    if (isSuspended) {
      // SUSPENDED MODE: ladder beams + suspension brackets
      // Ladder beams span across the scaffold width (bay_length_y direction),
      // one per row of standards along X. Each beam supports 2+ standards.
      // Number of beams = number of standard rows in X = bayX.count + 1
      const beamRowsX = bayX.count + 1;
      const beamLength = config.suspended_beam_length;
      const beamWeight = LADDER_BEAM_WEIGHTS[beamLength] ?? 46.0;
      const beamQty = beamRowsX;
      const beamTotalW = beamQty * beamWeight;

      details.push({
        part_type: "Ladder beam",
        description: `Ladder beam ${beamLength}mm (suspended support) — MDCLBE${String(beamLength).padStart(4, "0")}  (${beamRowsX} rows along X)`,
        size: `${beamLength}mm`,
        quantity: beamQty,
        unit_weight_kg: beamWeight,
        total_weight_kg: Math.round(beamTotalW * 100) / 100,
      });

      // Suspension brackets (1 per standard, connects standard to beam above)
      const bracketWeight = 2.5; // estimated
      const bracketQty = baseJacks; // same as numStandards
      const bracketTotalW = bracketQty * bracketWeight;

      details.push({
        part_type: "Suspension bracket",
        description: `Suspension bracket (connects standard to ladder beam) — estimated`,
        size: "standard",
        quantity: bracketQty,
        unit_weight_kg: bracketWeight,
        total_weight_kg: Math.round(bracketTotalW * 100) / 100,
      });
    } else {
      // JACK or WHEEL mode (existing logic)
      const unitW = isWheel ? WHEEL_WEIGHT : FIXED_BASE_JACK_WEIGHT;
      const desc = isWheel
        ? 'Wheel (heavy-duty total-lock) — MDCWHE0300'
        : "Fix base jack 38×600mm — MDCFBJ0600";
      const totalW = baseJacks * unitW;
      details.push({
        part_type: isWheel ? "Caster wheel" : "Base jack",
        description: desc,
        size: isWheel ? "Ø200×50mm" : "38×600mm",
        quantity: baseJacks,
        unit_weight_kg: unitW,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });

      // Sole boards + base collars — only for jack bases
      if (!isWheel) {
        const soleW = baseJacks * SOLE_BOARD_WEIGHT;
        details.push({
          part_type: "Sole board",
          description: "Sole board 450mm (under base jack) — MDCSLB0450",
          size: "450mm",
          quantity: baseJacks,
          unit_weight_kg: SOLE_BOARD_WEIGHT,
          total_weight_kg: Math.round(soleW * 100) / 100,
        });

        const collarW = baseJacks * BASE_COLLAR_WEIGHT;
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
  }

  // (Spigots removed from BOM — reference BOM doesn't list them separately.
  //  With only 3m standards, spigots are implicit in the standard assembly.)

  // GRATINGS (steel planks with hook, width = plank_width, length = bay_length_x).
  // Catalog MDCSPH0xxx. The planks span across the X-bay (rest on Y-ledgers),
  // so plank LENGTH = bay_length_x (per section). One BOM line per unique
  // bay_length so each catalog size gets its own entry.
  // For 230mm planks, weights are scaled by 230/320 = 0.719.
  // Access bay (first bay): removes 2 planks if include_ladder, else 1 (trapdoor).
  // Secondary access bay (last bay): removes 2 planks if secondary_access.
  if (gratings > 0) {
    const pw = config.plank_width;
    const plankWeights = plankWeightTable(pw);
    const enabledLevelsCount = numLifts - config.disabled_platform_levels.length;
    const gap = 4;
    const accessBayPlanksRemoved = config.include_ladder ? 2 : 1;
    const accessBayLength = sections ? sections[0].bay_length : bayX.size;
    const lastBayLength = sections
      ? sections[sections.length - 1].bay_length
      : bayX.size;
    const totalBaysCount = sections
      ? sections.reduce((s, sec) => s + sec.bays, 0)
      : bayX.count;
    // Single-bay tower: access bay IS the last bay, don't double-subtract
    const accessAndLastAreSame = totalBaysCount === 1;

    for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
      const len = parseInt(lenStr);
      const planksPerBay = Math.max(2, Math.floor((len + gap) / (pw + gap)));
      const isAccessLength = len === accessBayLength;
      const isLastBayLength = len === lastBayLength;

      // Start with all bays fully filled
      let planksThisLength = planksPerBay * numBays * bayY.count * enabledLevelsCount;

      // Subtract access bay planks (1 access bay, at the first bay)
      if (isAccessLength) {
        planksThisLength -= accessBayPlanksRemoved * bayY.count * enabledLevelsCount;
      }

      // Subtract secondary access bay planks (1 bay, at the last bay)
      if (config.secondary_access && isLastBayLength && !accessAndLastAreSame) {
        planksThisLength -= 2 * bayY.count * enabledLevelsCount;
      } else if (config.secondary_access && accessAndLastAreSame) {
        // Single-bay tower: access + secondary both in same bay, remove max(2, 2) = 2
        // (already subtracted 2 for access if include_ladder, subtract 0 more)
        // If no ladder but secondary_access: subtract 2 for secondary
        if (!config.include_ladder) {
          planksThisLength -= 1 * bayY.count * enabledLevelsCount; // already removed 1 for trapdoor, remove 1 more
        }
      }

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

  // WORK PLATFORM DIAGONAL BRACES (under gratings)
  // Reference BOMs show diagonal braces under the gratings to strengthen the
  // work platform. These are short diagonal braces at each bay × each lift level,
  // connecting the ledger to the standard below the platform.
  // Uses the same catalog as perimeter braces (MDCVDB0xxx), one per bay per level.
  if (config.include_gratings && config.include_braces) {
    const enabledLevelsCount = numLifts - config.disabled_platform_levels.length;
    for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
      const len = parseInt(lenStr);
      const platformBraceQty = numBays * enabledLevelsCount;
      if (platformBraceQty <= 0) continue;
      const catalogLiftHeight = 2000;
      const braceLengthMm = Math.sqrt(len * len + catalogLiftHeight * catalogLiftHeight);
      const catalogWeight = lookupWeight(BRACE_WEIGHTS, len, 3.0, 3.0);
      const braceW = liftHeight === catalogLiftHeight
        ? catalogWeight
        : catalogWeight * (braceLengthMm / Math.sqrt(len * len + catalogLiftHeight * catalogLiftHeight));
      const totalW = platformBraceQty * braceW;
      totalWeight += totalW;
      details.push({
        part_type: "Platform brace",
        description: `Work platform diagonal ${Math.round(braceLengthMm)}mm (under gratings) — MDCVDB${String(len).padStart(4, "0")}`,
        size: `${Math.round(braceLengthMm)}mm`,
        quantity: platformBraceQty,
        unit_weight_kg: Math.round(braceW * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // TOEBOARDS — per-length catalog weights (MDCTOB0xxx).
  // 3 sides per level: 1 along X (back, length=towerX) + 2 along Y (left/right,
  // length=towerY each). Front (+Y) is open for access.
  // Each side longer than the catalog max (2570mm) is split into multiple
  // sections joined end-to-end; sections are grouped by length for the BOM.
  //
  // FIX-7: towerX for the back toeboard is computed from bayLayout.totalLength
  //   (i.e. the sum of ALL sections, including access sections, since access
  //   bays ARE structural bays and are in the sections array). This makes the
  //   back toeboard length deterministic for "identical" scaffolds regardless
  //   of the access type (ladder vs stairs).
  if (toeboards > 0) {
    const towerXmm = actualLength; // = bayLayout.totalLength (all sections incl. access)
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

  // (Guardrail posts removed from BOM — reference BOM doesn't list them.
  //  They're assumed part of the handrail/trapdoor assembly.)

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
    // Count access bays the same way as the staircase/ladder section
    let trapdoorAccessBays: number;
    if (sections) {
      trapdoorAccessBays = sections.filter(
        (s) => s.label === "ACCESS" || s.label === "STAIRCASE"
      ).reduce((sum, s) => sum + s.bays, 0);
      if (trapdoorAccessBays === 0 && (config.include_ladder || config.secondary_access)) {
        trapdoorAccessBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
      }
    } else {
      trapdoorAccessBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
    }
    const trapdoorQty = trapdoorAccessBays * numLifts;
    const unitW = TRAPDOOR_WEIGHTS[trapdoorLen];
    const totalW = trapdoorQty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Trapdoor with ladder",
      description: `Trapdoor with ladder ${trapdoorLen}mm — MDCTWL${String(trapdoorLen).padStart(4, "0")}  ×${trapdoorAccessBays} access bay(s) × ${numLifts} lifts`,
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

  // ACCESS ITEMS: emit Monker ladders AND/OR staircases depending on section labels.
  // - Sections labeled "ACCESS" (without "STAIRCASE") → Monker ladder (MDCMON)
  // - Sections labeled "STAIRCASE" → removable staircase (MDCRSC2134 + rail + steps)
  // - Legacy (no sections): use staircase_type to decide (ladder vs stairs)
  // Both types can coexist in the same scaffold (e.g., 2 Monker access + 1 staircase access).
  {
    // Count Monker access bays vs staircase access bays
    let numMonkerBays: number;
    let numStaircaseBays: number;
    if (sections) {
      numMonkerBays = sections.filter(
        (s) => s.label === "ACCESS"
      ).reduce((sum, s) => sum + s.bays, 0);
      numStaircaseBays = sections.filter(
        (s) => s.label === "STAIRCASE"
      ).reduce((sum, s) => sum + s.bays, 0);
      // Fallback: if parser set include_ladder but no labelled access bays,
      // use legacy logic based on staircase_type
      if (numMonkerBays === 0 && numStaircaseBays === 0 && (config.include_ladder || config.secondary_access)) {
        if (config.staircase_type === "stairs") {
          numStaircaseBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
        } else {
          numMonkerBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
        }
      }
    } else {
      // Legacy: no sections, use staircase_type
      if (config.staircase_type === "stairs") {
        numStaircaseBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
        numMonkerBays = 0;
      } else {
        numMonkerBays = (config.include_ladder ? 1 : 0) + (config.secondary_access ? 1 : 0);
        numStaircaseBays = 0;
      }
    }

    // Emit Monker ladders (if any Monker access bays)
    if (numMonkerBays > 0) {
      const ladderSections = computeLadderAssembly(towerHeightTotal);
      const totalLadderQty = numMonkerBays * numLifts;
      const sectionWeight = ladderSections.sectionWeight;
      const spigotCount = ladderSections.spigotCount;
      const totalSpigotQty = totalLadderQty * spigotCount;
      const ladderTotalW = totalLadderQty * sectionWeight;
      const spigotTotalW = totalSpigotQty * SPIGOT_WITH_COUPLER_WEIGHT;

      details.push({
        part_type: "Ladder",
        description: `Monker ladder (${ladderSections.sectionCount} sections + ${spigotCount} spigots per lift) — ${numMonkerBays} Monker access bay(s), ${numLifts} lifts`,
        size: `${towerHeightTotal}mm`,
        quantity: totalLadderQty,
        unit_weight_kg: Math.round((sectionWeight + spigotCount * SPIGOT_WITH_COUPLER_WEIGHT) * 100) / 100,
        total_weight_kg: Math.round((ladderTotalW + spigotTotalW) * 100) / 100,
      });
    }

    // Emit staircases (if any staircase access bays)
    if (numStaircaseBays > 0) {
      const totalStaircaseQty = numStaircaseBays * numLifts;
      const totalGuardRailQty = totalStaircaseQty;
      const totalStepQty = totalStaircaseQty * STEPS_PER_STAIRCASE;

      const staircaseTotalW = totalStaircaseQty * REMOVABLE_STAIRCASE_WEIGHT;
      const guardRailTotalW = totalGuardRailQty * STAIRCASE_GUARD_RAIL_WEIGHT;
      const stepTotalW = totalStepQty * STAIRCASE_STEP_WEIGHT;

      details.push({
        part_type: "Removable staircase",
        description: `Removable staircase 2134mm — MDCRSC2134  (${numStaircaseBays} staircase access bay(s), ${numLifts} lifts each, non-adjacent angular)`,
        size: "2134mm",
        quantity: totalStaircaseQty,
        unit_weight_kg: REMOVABLE_STAIRCASE_WEIGHT,
        total_weight_kg: Math.round(staircaseTotalW * 100) / 100,
      });
      details.push({
        part_type: "Staircase guard rail",
        description: `Guard rail for staircase — MDCGRFS2134  (1 per staircase)`,
        size: "2134mm",
        quantity: totalGuardRailQty,
        unit_weight_kg: STAIRCASE_GUARD_RAIL_WEIGHT,
        total_weight_kg: Math.round(guardRailTotalW * 100) / 100,
      });
      details.push({
        part_type: "Staircase step",
        description: `Step for staircase — MDCSFS0860  (${STEPS_PER_STAIRCASE} per staircase)`,
        size: "860mm",
        quantity: totalStepQty,
        unit_weight_kg: STAIRCASE_STEP_WEIGHT,
        total_weight_kg: Math.round(stepTotalW * 100) / 100,
      });
    }
  }

  // DOOR OPENING: header beam (strengthening beam above the door)
  // Uses a reinforced ledger (MDCRLE0xxx) as the header beam
  if (config.door_opening) {
    const doorBayLen = sections
      ? sections[config.door_opening.bay_index]?.bay_length ?? bayX.size
      : bayX.size;
    const headerWeight = REINFORCED_LEDGER_WEIGHTS[doorBayLen]
      ?? lookupWeight(LEDGER_WEIGHTS, doorBayLen, 3.5, 1.0) * 1.5;
    const totalW = headerWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Header beam",
      description: `Door header beam ${doorBayLen}mm (reinforced, above door opening) — MDCRLE${String(doorBayLen).padStart(4, "0")}`,
      size: `${doorBayLen}mm`,
      quantity: 1,
      unit_weight_kg: Math.round(headerWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  const estimatedWeight = Math.round(
    details.reduce((sum, d) => sum + d.quantity * d.unit_weight_kg, 0)
  );

  const bom: PartsBom = {
    standards: numStandards,
    ledgers,
    braces,
    base_jacks: baseJacks,
    rosettes,
    planks,
    gratings,
    toeboards,
    total_parts: details.reduce((sum, d) => sum + d.quantity, 0),
    estimated_weight_kg: estimatedWeight,
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
    staircase_type: result.config.staircase_type,
    secondary_staircase_type: result.config.secondary_staircase_type,
    staircase_tower: result.config.staircase_tower,
    door_opening: result.config.door_opening,
    scaffold_path: result.config.scaffold_path,
    circular_layout: result.config.circular_layout,
    include_fillers: result.config.include_fillers,
    plank_width: result.config.plank_width,
    suspended_beam_length: result.config.suspended_beam_length,
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
  staircase_type?: "ladder" | "stairs";
  include_ladder?: boolean;
  staircase_tower?: boolean;
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
    label: "Staircase tower",
    input: "2x2x6m",
    description: "Dedicated staircase tower — stairs in every bay, 6m high",
    include_ladder: true,
    staircase_type: "stairs",
    staircase_tower: true,
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

/**
 * Parse a natural-language scaffold request into sections + overrides.
 *
 * Supports French and English keywords:
 *   - "baies" / "bays" → regular bays
 *   - "accès" / "access" → access bays (with ladder)
 *   - "staircase" / "escalier" → staircase tower section
 *   - "renforcée" / "reinforced" → reinforced section
 *   - "porte" / "door" → door opening
 *
 * Format: comma-separated sections, each like:
 *   "17 baies de 2.5x2x8m"           → 17 bays × 2500mm, height 8m
 *   "2 accès 2.5x2x8m"               → 2 access bays × 2500mm
 *   "1 accès staircase 2.13x2x8m"    → 1 staircase access bay × 2130mm
 *   "1 baie renforcée 2.5x2x8m"     → 1 reinforced bay × 2500mm
 *   "porte 2x2m"                     → door opening 2m wide × 2m high
 *
 * Returns: { sections, height, width, overrides } or null if parse fails.
 */
export interface ParsedScaffoldRequest {
  sections: Array<{ bays: number; bay_length: number; label?: string }>;
  height: number;  // mm
  width: number;   // mm
  overrides: Partial<BayConfig>;
  parseWarnings: string[];
}

export function parseScaffoldRequest(text: string): ParsedScaffoldRequest | null {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;

  // ─── Auto-detect circular scaffold requests (around tanks/towers) ───
  // Keywords: "circular", "circulaire", "round", "tank" + diameter + segments
  if (/\b(?:circular|circulaire|round|tank)\b/.test(cleaned)) {
    const circ = parseCircularRequest(text);
    if (circ) {
      const hasAccess = /acc\u00e8s|access/.test(cleaned);
      const hasStaircase = /staircase|straircase|escalier|stairs/.test(cleaned);
      const hasReinforced = /renforc|reinforc/.test(cleaned);
      // Pick label: prefer per-segment label, then auto-detect
      let label = circ.label;
      if (!label) {
        if (hasStaircase) label = "STAIRCASE";
        else if (hasAccess) label = "ACCESS";
        else if (hasReinforced) label = "REINFORCED";
      }
      const includeLadder = hasAccess || hasStaircase || label === "ACCESS" || label === "STAIRCASE";
      const stairsType = hasStaircase || label === "STAIRCASE" ? "stairs" : "ladder";
      return {
        sections: [{ bays: circ.num_segments, bay_length: Math.round(circ.diameter_mm * Math.PI / circ.num_segments), label: "CIRCULAR" }],
        height: 6000,
        width: circ.bay_width_mm,
        overrides: {
          circular_layout: {
            diameter_mm: circ.diameter_mm,
            num_segments: circ.num_segments,
            bay_width_mm: circ.bay_width_mm,
            label,
          },
          include_ladder: includeLadder,
          secondary_access: false,
          staircase_tower: false,
          staircase_type: stairsType,
          secondary_staircase_type: stairsType,
          // Clear any stale path
          scaffold_path: undefined,
        },
        parseWarnings: [
          `Circular scaffold: ⌀${(circ.diameter_mm / 1000).toFixed(1)}m, ${circ.num_segments} segments, ${circ.bay_width_mm}mm width` +
            (includeLadder ? `; access ${stairsType}` : "") +
            (label === "REINFORCED" ? "; reinforced" : ""),
        ],
      };
    }
    // If circular keyword but parse failed, fall through to regular parser
  }

  // ─── Auto-detect angle-scaffold requests (L-shape, U-shape, virage, turn) ───
  // If the input contains angle-scaffold keywords, route it through
  // parseScaffoldPath instead — so users can type L/U-shape strings in EITHER
  // the multi-section request field OR the dedicated path field.
  // Detects:
  //   - L-shape / U-shape / lshape / ushape (with or without dash/space)
  //   - "en forme de L" / "en forme de U"
  //   - "virage" (any variant: virage droite/gauche, virage à droite, etc.)
  //   - "turn left" / "turn right"
  //   - "à droite" / "à gauche" (when followed by an angle)
  //   - bare "droite 90" / "gauche 90"
  const hasAngleKeyword = /\b(?:l[-\s]?shape|u[-\s]?shape|en\s+forme\s+de\s+[lu]|virage|tourner?|turn\s+(?:left|right|droite|gauche)|(?:[àa]\s+)?(?:droite|gauche)\s+\d+\s*°?|(?:right|left)\s+turn)\b/.test(cleaned);
  if (hasAngleKeyword) {
    const path = parseScaffoldPath(text);
    if (path && path.length > 0) {
      // Detect access / staircase / reinforced keywords anywhere in the input.
      // These turn on ladders/stairs in the first segment of the path.
      const hasAccess = /acc\u00e8s|access/.test(cleaned);
      const hasStaircase = /staircase|straircase|escalier|stairs/.test(cleaned);
      const hasReinforced = /renforc|reinforc/.test(cleaned);
      const totalBays = path.reduce((s, p) => s + p.bays, 0);
      const firstBayLen = path[0].bay_length;
      // Only apply auto-labels when the path parser didn't already label
      // segments (i.e., the user didn't put keywords on each segment).
      const anyLabeled = path.some(p => p.label);
      if (!anyLabeled) {
        // When user specifies "renforcée", label the longest segment as reinforced.
        if (hasReinforced) {
          let maxIdx = 0;
          for (let i = 1; i < path.length; i++) {
            if (path[i].bays * path[i].bay_length > path[maxIdx].bays * path[maxIdx].bay_length) {
              maxIdx = i;
            }
          }
          path[maxIdx].label = "REINFORCED";
        }
        // When user specifies "accès staircase", label first segment as STAIRCASE.
        // For "accès" alone, label first segment as ACCESS (ladder access).
        if (hasStaircase) {
          path[0].label = "STAIRCASE";
        } else if (hasAccess) {
          path[0].label = "ACCESS";
        }
      }
      // include_ladder is true if ANY segment has ACCESS or STAIRCASE label,
      // OR if the user explicitly typed access/staircase keywords.
      const pathHasAccess = path.some(p => p.label === "ACCESS" || p.label === "STAIRCASE");
      const includeLadder = hasAccess || hasStaircase || pathHasAccess;
      const stairsType = hasStaircase || path.some(p => p.label === "STAIRCASE") ? "stairs" : "ladder";
      return {
        sections: [{ bays: totalBays, bay_length: firstBayLen, label: "ANGLE" }],
        height: 6000,
        width: 2000,
        overrides: {
          scaffold_path: path,
          include_ladder: includeLadder,
          secondary_access: false,
          staircase_tower: false,
          staircase_type: stairsType,
          secondary_staircase_type: stairsType,
        },
        parseWarnings: [
          `Angle scaffold detected: ${path.length} segments, ${totalBays} bays total` +
            (includeLadder ? `; access ${stairsType === "stairs" ? "(stairs)" : "(ladder)"} on first labeled segment` : "") +
            (hasReinforced ? "; reinforced on longest segment" : ""),
        ],
      };
    }
    // If path parsing failed, fall through to the regular parser (which will
    // likely also fail and report "Could not parse request").
  }

  const parts = cleaned.split(/,/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const sections: Array<{ bays: number; bay_length: number; label?: string }> = [];
  const overrides: Partial<BayConfig> = {};
  const parseWarnings: string[] = [];
  let height = 0;
  let width = 0;
  let hasStaircase = false;
  let hasAccess = false;

  for (const part of parts) {
    // Extract number of bays (first number)
    const bayCountMatch = part.match(/^(\d+)\s+/);
    if (!bayCountMatch) {
      parseWarnings.push(`Could not parse bay count in: "${part}"`);
      continue;
    }
    const bayCount = parseInt(bayCountMatch[1]);

    // Extract dimensions (LxWxH format)
    const dimsMatch = part.match(/(\d+\.?\d*)\s*[x\u00d7*]\s*(\d+\.?\d*)\s*[x\u00d7*]\s*(\d+\.?\d*)\s*(m|mm|cm)?/);
    if (!dimsMatch) {
      parseWarnings.push(`Could not parse dimensions in: "${part}"`);
      continue;
    }

    let unitMult = 1000; // default: meters → mm
    if (dimsMatch[4] === "mm") unitMult = 1;
    else if (dimsMatch[4] === "cm") unitMult = 10;

    const bayLength = Math.round(parseFloat(dimsMatch[1]) * unitMult);
    const bayWidth = Math.round(parseFloat(dimsMatch[2]) * unitMult);
    const bayHeight = Math.round(parseFloat(dimsMatch[3]) * unitMult);

    // Track height and width (use first non-zero)
    if (height === 0) height = bayHeight;
    if (width === 0) width = bayWidth;

    // Detect keywords
    const isAccess = /acc\u00e8s|access/.test(part);
    const isStaircase = /staircase|straircase|escalier|stairs/.test(part);
    const isReinforced = /renforc|reinforc/.test(part);
    const isDoor = /porte|door/.test(part);

    if (isDoor) {
      // Door opening: "porte 2x2m" → width=2000, height=2000
      overrides.door_opening = {
        bay_index: sections.reduce((s, sec) => s + sec.bays, 0),
        width: bayLength,
        height: bayWidth,
      };
      continue; // door is not a bay section
    }

    if (isStaircase && isAccess) {
      // "accès staircase" = access bay that uses STAIRS instead of ladder
      // NOT a staircase tower — just an access bay with staircase_type="stairs"
      hasStaircase = true;
      overrides.staircase_type = "stairs";
      // Do NOT set staircase_tower=true
    } else if (isStaircase) {
      // "staircase" (without "accès") = dedicated staircase tower
      hasStaircase = true;
      overrides.staircase_type = "stairs";
      overrides.staircase_tower = true;
    }

    if (isAccess) {
      hasAccess = true;
      overrides.include_ladder = true;
    }

    // Add as a section with label
    // "accès staircase" → label "STAIRCASE" (staircase access bay, uses MDCRSC)
    // "accès" (without staircase) → label "ACCESS" (Monker ladder access bay)
    // "staircase" (without accès) → label "STAIRCASE" (staircase tower mode)
    // "renforcée" → label "REINFORCED"
    const label = isStaircase ? "STAIRCASE" : isAccess ? "ACCESS" : isReinforced ? "REINFORCED" : undefined;
    sections.push({ bays: bayCount, bay_length: bayLength, label });

    // Mark reinforced sections
    if (isReinforced) {
      parseWarnings.push(`Section "${part}" marked as reinforced — using reinforced ledgers at extremity bays`);
    }
  }

  if (sections.length === 0) {
    parseWarnings.push("No valid sections found");
    return null;
  }

  // Set defaults
  if (hasAccess && !hasStaircase) {
    overrides.include_ladder = true;
    overrides.staircase_type = "ladder";
  }
  // When user explicitly specifies access bays in the text request,
  // disable auto secondary_access (don't auto-trigger escape at ≥20m)
  if (hasAccess) {
    overrides.secondary_access = false;
  }
  // When no access is specified at all, also disable auto secondary_access
  // (the user's spec is explicit — don't add access they didn't ask for)
  if (!hasAccess && !hasStaircase) {
    overrides.include_ladder = false;
    overrides.secondary_access = false;
  }

  return { sections, height, width, overrides, parseWarnings };
}

// ─── ANGLE SCAFFOLD (L-shaped, U-shaped, angled corners) ──────────────

/**
 * Layout for an angled scaffold path. Each segment runs in a direction
 * determined by accumulated turn angles. Standards are placed at segment
 * boundaries (not shared at corners — separate standards per segment).
 */
export interface PathLayout {
  segments: Array<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    dirX: number; // unit direction along the segment
    dirY: number;
    perpX: number; // unit direction perpendicular to segment (rotated +90°)
    perpY: number;
    angleDeg: number; // segment direction in degrees
    bayLength: number;
    numBays: number;
    label?: string;
  }>;
  totalBays: number;
  totalLength: number;
  // All standard positions (X, Y) — TWO rows per segment (front + back,
  // offset by `bayWidth` perpendicular to the segment direction).
  // The grid is: for each segment, for each bay boundary (numBays+1 positions),
  // for each of 2 rows (front=+perp, back=-perp).
  standardPositions: Array<[number, number]>;
  // Standard positions grouped per-segment (so renderer can iterate per segment).
  // Each entry: {segIdx, positions: [[x,y], ...]} where positions has length
  // (numBays+1) * 2 (front row 0..numBays, then back row 0..numBays).
  segmentStandards: Array<{
    segIdx: number;
    positions: Array<[number, number]>;
    numBays: number;
  }>;
}

/**
 * Compute 2D positions for an angled scaffold path.
 * Segments start at origin (0,0) and each subsequent segment starts where
 * the previous one ended, rotated by the accumulated turn angle.
 * Standards are placed in TWO rows per segment (front + back, offset by
 * half the bay width on each side perpendicular to the segment direction).
 * Standards at corners are NOT shared between segments.
 *
 * @param bayWidth The scaffold width (Y direction for linear scaffolds).
 *                 Defaults to 2000mm.
 */
export function computePathLayout(
  path: Array<{ bays: number; bay_length: number; turn_angle: number; label?: string }>,
  bayWidth: number = 2000
): PathLayout {
  const segments: PathLayout["segments"] = [];
  const standardPositions: Array<[number, number]> = [];
  const segmentStandards: PathLayout["segmentStandards"] = [];
  let totalBays = 0;
  let totalLength = 0;

  // Starting position and direction
  let curX = 0;
  let curY = 0;
  // Direction in degrees: 0 = +X (east), 90 = +Y (north), 180 = -X, -90 = -Y
  let curAngleDeg = 0;

  const halfWidth = bayWidth / 2;

  for (let segIdx = 0; segIdx < path.length; segIdx++) {
    const seg = path[segIdx];
    const angleRad = curAngleDeg * Math.PI / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
    // Perpendicular direction (rotate +90°): (dirX, dirY) → (-dirY, dirX)
    const perpX = -dirY;
    const perpY = dirX;
    const segLen = seg.bays * seg.bay_length;

    const segPositions: Array<[number, number]> = [];
    // Place standards in TWO rows along this segment.
    // Front row: at +halfWidth perpendicular offset.
    // Back row: at -halfWidth perpendicular offset.
    // For each row, place standards at i = 0..numBays (numBays+1 standards).
    // End-of-segment standards are also placed (not shared with next segment).
    for (let i = 0; i <= seg.bays; i++) {
      const baseX = curX + dirX * i * seg.bay_length;
      const baseY = curY + dirY * i * seg.bay_length;
      const fx = baseX + perpX * halfWidth;
      const fy = baseY + perpY * halfWidth;
      const bx = baseX - perpX * halfWidth;
      const by = baseY - perpY * halfWidth;
      standardPositions.push([fx, fy]);
      segPositions.push([fx, fy]);
      // Avoid duplicate standards at the exact same position when the back row
      // of one segment overlaps the front row of the next segment at a corner.
      // We push both rows unconditionally — duplicates will be filtered by the
      // renderer (Three.js doesn't care about overlap, and the BOM doesn't
      // count standards from pathLayout directly).
      standardPositions.push([bx, by]);
      segPositions.push([bx, by]);
    }

    const endX = curX + dirX * segLen;
    const endY = curY + dirY * segLen;

    segments.push({
      startX: curX, startY: curY,
      endX, endY,
      dirX, dirY,
      perpX, perpY,
      angleDeg: curAngleDeg,
      bayLength: seg.bay_length,
      numBays: seg.bays,
      label: seg.label,
    });
    segmentStandards.push({ segIdx, positions: segPositions, numBays: seg.bays });

    curX = endX;
    curY = endY;
    // Small gap at the corner (so standards from adjacent segments don't overlap)
    curX += dirX * 50;
    curY += dirY * 50;

    totalBays += seg.bays;
    totalLength += segLen;

    // Apply turn angle for the NEXT segment
    curAngleDeg += seg.turn_angle;
  }

  return { segments, totalBays, totalLength, standardPositions, segmentStandards };
}

/**
 * Parse a natural-language angle scaffold request.
 *
 * Supports French and English, with many variants:
 *   "en forme de L: 5 baies 2.5m, virage droite 90°, 3 baies 2.5m"
 *   "en forme de L: 5 baies 2.5m, virage à droite 90°, 3 baies 2.5m"  (with "à")
 *   "L-shape: 5 bays 2.5m, turn right 90°, 3 bays 2.5m"
 *   "5 bays 2.5m, turn right 90, 3 bays 2.5m"                          (no L/U prefix)
 *   "5 baies 2.5m, à droite 90°, 3 baies 2.5m"                         (just "à droite")
 *   "5 baies 2.5m, droite 90°, 3 baies 2.5m"                           (just "droite")
 *   "5 baies 2.5m, virage gauche 90°, 3 baies 2.5m, virage gauche 90°, 4 baies 2.5m"  (U-shape)
 *   "U-shape: 4 bays north, turn left 90, 3 bays, turn left 90, 4 bays south"
 *
 * Returns a scaffold_path array with bays, bay_length, and turn_angle.
 */
export function parseScaffoldPath(text: string): Array<{
  bays: number;
  bay_length: number;
  turn_angle: number;
  label?: string;
}> | null {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;

  // Split by commas or semicolons
  const parts = cleaned.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const path: Array<{ bays: number; bay_length: number; turn_angle: number; label?: string }> = [];

  for (const part of parts) {
    // Check if this is a turn instruction. We accept MANY variants:
    //   "virage droite 90"   / "virage gauche 90"
    //   "virage à droite 90" / "virage à gauche 90"
    //   "tourner à droite"   / "tourne à gauche"
    //   "turn right 90"      / "turn left 90"
    //   "à droite 90"        / "à gauche 90"        (no verb)
    //   "droite 90"          / "gauche 90"           (just direction + angle)
    //   "right turn 90"      / "left turn 90"        (reversed word order)
    // Optional "à" / "a" / "vers la" between verb and direction.
    // Optional "°" suffix on the angle.
    // Default angle is 90° if omitted.
    const turnMatch =
      // Standard: "virage/tourner/turn + (optional à/vers la) + droite/right/gauche/left + (optional angle)"
      part.match(/(?:virage|tourner?|turn)\s+(?:[àa]\s+|vers\s+la\s+)?(droite|right|gauche|left)\s*(\d+)?\s*°?/) ||
      // Bare direction: "à droite 90" / "droite 90" / "right 90"
      part.match(/(?:[àa]\s+)?(droite|right|gauche|left)\s+(\d+)\s*°?/) ||
      // Reversed: "right turn 90" / "left turn 90"
      part.match(/(droite|right|gauche|left)\s+(?:turn|virage)\s*(\d+)?\s*°?/);

    if (turnMatch) {
      const direction = turnMatch[1];
      const angle = turnMatch[2] ? parseInt(turnMatch[2]) : 90;
      const turnAngle = (direction === "droite" || direction === "right") ? angle : -angle;
      // Apply turn to the last segment
      if (path.length > 0) {
        path[path.length - 1].turn_angle = turnAngle;
      }
      continue;
    }

    // Parse bays + length (length optional — defaults to 2500mm)
    // Examples:
    //   "5 baies 2.5m" → bays=5, bayLength=2500
    //   "5 bays"        → bays=5, bayLength=2500 (default)
    //   "5 baies de 3m" → bays=5, bayLength=3000
    const bayMatch = part.match(/(\d+)\s*(?:baies?|bays?)\s*(?:de\s+)?(\d+\.?\d*)\s*m/);
    const bayCountOnlyMatch = !bayMatch ? part.match(/(\d+)\s*(?:baies?|bays?)/) : null;

    let bays: number;
    let bayLength: number;
    if (bayMatch) {
      bays = parseInt(bayMatch[1]);
      bayLength = Math.round(parseFloat(bayMatch[2]) * 1000);
    } else if (bayCountOnlyMatch) {
      bays = parseInt(bayCountOnlyMatch[1]);
      bayLength = 2500; // default bay length when not specified
    } else {
      continue;
    }

    // Detect label per segment (optional — overrides auto-detection from full text)
    let label: string | undefined;
    if (/accès|access/.test(part)) label = "ACCESS";
    else if (/staircase|escalier/.test(part)) label = "STAIRCASE";
    else if (/renforc|reinforc/.test(part)) label = "REINFORCED";

    path.push({ bays, bay_length: bayLength, turn_angle: 0, label });
  }

  return path.length > 0 ? path : null;
}

// ─── CIRCULAR SCAFFOLD (around tanks/towers) ──────────────────────────

/**
 * Layout for a circular scaffold. Standards are placed on TWO concentric
 * circles (outer + inner) at regular angular intervals. Each segment
 * (between two adjacent angular positions) forms a bay whose arc-length
 * on the outer circle equals bay_length_x. Ledgers connect:
 *   - Outer ring: adjacent outer standards (along the arc)
 *   - Inner ring: adjacent inner standards (along the arc)
 *   - Radial: outer standard to inner standard (along the radius)
 */
export interface CircularLayout {
  diameter_mm: number;          // outer scaffold diameter
  radius_mm: number;            // outer radius = diameter / 2
  innerRadius_mm: number;       // inner radius = outer - bay_width
  num_segments: number;         // number of bays around the circle
  bay_width_mm: number;         // scaffold width (radial depth)
  bay_arc_length_mm: number;    // arc length of one bay on the outer circle
  angle_per_segment_rad: number;// 2π / num_segments
  // Outer ring standards (num_segments positions, [x, y])
  outerStandards: Array<[number, number]>;
  // Inner ring standards (num_segments positions, [x, y])
  innerStandards: Array<[number, number]>;
  // All standard positions (outer + inner, deduplicated at corners)
  allStandards: Array<[number, number]>;
}

/**
 * Compute 2D positions for a circular scaffold.
 * Standards are placed on two concentric circles:
 *   - Outer: at radius = diameter / 2
 *   - Inner: at radius = outer - bay_width
 * Each angular position has ONE outer standard + ONE inner standard.
 * The first segment starts at angle 0 (along +X axis).
 */
export function computeCircularLayout(
  diameter_mm: number,
  num_segments: number,
  bay_width_mm: number = 2000
): CircularLayout {
  const radius_mm = diameter_mm / 2;
  const innerRadius_mm = Math.max(0, radius_mm - bay_width_mm);
  const angle_per_segment_rad = (2 * Math.PI) / num_segments;
  // Arc length of one bay on the outer circle
  const bay_arc_length_mm = radius_mm * angle_per_segment_rad;

  const outerStandards: Array<[number, number]> = [];
  const innerStandards: Array<[number, number]> = [];
  for (let i = 0; i < num_segments; i++) {
    const angle = i * angle_per_segment_rad;
    outerStandards.push([
      radius_mm * Math.cos(angle),
      radius_mm * Math.sin(angle),
    ]);
    innerStandards.push([
      innerRadius_mm * Math.cos(angle),
      innerRadius_mm * Math.sin(angle),
    ]);
  }
  // Combine outer + inner (no dedup needed since they're on different radii)
  const allStandards: Array<[number, number]> = [
    ...outerStandards,
    ...innerStandards,
  ];

  return {
    diameter_mm,
    radius_mm,
    innerRadius_mm,
    num_segments,
    bay_width_mm,
    bay_arc_length_mm,
    angle_per_segment_rad,
    outerStandards,
    innerStandards,
    allStandards,
  };
}

/**
 * Parse a natural-language circular scaffold request.
 *
 * Supports:
 *   "circular: diameter 10m, 12 segments"        (defaults to 2m width)
 *   "circular: diameter 10m, 12 bays, 2m width"
 *   "circulaire: diamètre 10m, 12 baies"
 *   "round: diameter 8m, 8 segments"
 *   "tank: 6m diameter, 10 segments"
 *
 * Returns a circular_layout object.
 */
export function parseCircularRequest(text: string): {
  diameter_mm: number;
  num_segments: number;
  bay_width_mm: number;
  label?: string;
} | null {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;

  // Detect circular keyword
  const hasCircular = /\b(?:circular|circulaire|round|tank)\b/.test(cleaned);
  if (!hasCircular) return null;

  // Extract diameter (e.g., "diameter 10m" / "diamètre 10m" / "10m diameter")
  const diameterMatch =
    cleaned.match(/(?:diameter|diam[eè]tre)\s*(\d+\.?\d*)\s*m/) ||
    cleaned.match(/(\d+\.?\d*)\s*m\s*(?:diameter|diam[eè]tre)/) ||
    cleaned.match(/(\d+\.?\d*)\s*m\s*(?:de\s+)?(?:diam)/);
  if (!diameterMatch) return null;
  const diameter_mm = Math.round(parseFloat(diameterMatch[1]) * 1000);

  // Extract number of segments/bays
  const segMatch =
    cleaned.match(/(\d+)\s*(?:segments?|baies?|bays?)/);
  if (!segMatch) return null;
  const num_segments = parseInt(segMatch[1]);
  if (num_segments < 3) return null; // need at least 3 to form a polygon

  // Extract optional width (default 2000mm)
  let bay_width_mm = 2000;
  const widthMatch = cleaned.match(/(?:width|largeur)\s*(\d+\.?\d*)\s*m/);
  if (widthMatch) {
    bay_width_mm = Math.round(parseFloat(widthMatch[1]) * 1000);
  }

  // Detect label
  let label: string | undefined;
  if (/accès|access/.test(cleaned)) label = "ACCESS";
  else if (/staircase|escalier/.test(cleaned)) label = "STAIRCASE";
  else if (/renforc|reinforc/.test(cleaned)) label = "REINFORCED";

  return { diameter_mm, num_segments, bay_width_mm, label };
}

// ─── SAFETY GUARDS ────────────────────────────────────────────────────

/**
 * Safety guard: check if the current config is safe.
 * Returns an array of warning strings (empty = all safe).
 */
export function checkSafetyGuards(config: BayConfig): string[] {
  const warnings: string[] = [];
  const towerHeight = config.num_lifts * config.lift_height;
  const towerLength = config.bays_x * config.bay_length_x;

  // Guard 1: Cannot use wheels when scaffold is too tall (> 8m)
  if (config.base_type === "wheel" && towerHeight > 8000) {
    warnings.push(`Wheels are not safe for scaffolds taller than 8m (current: ${(towerHeight / 1000).toFixed(1)}m). Please switch to Jack or Suspended.`);
  }

  // Guard 2: Cannot use wheels when scaffold is too long (> 20m)
  if (config.base_type === "wheel" && towerLength > 20000) {
    warnings.push(`Wheels are not recommended for scaffolds longer than 20m (current: ${(towerLength / 1000).toFixed(1)}m). Please switch to Jack or Suspended.`);
  }

  // Guard 3: Suspended frames require reinforced ledgers for large spans
  if (config.base_type === "suspended") {
    const totalWeight = (towerHeight * towerLength) / 1000000; // rough estimate in tons
    if (totalWeight > 50 && !config.sections?.some(s => s.label === "REINFORCED")) {
      warnings.push(`Suspended frames with large area (${(towerLength / 1000).toFixed(1)}m × ${(towerHeight / 1000).toFixed(1)}m) require reinforced ledgers. Please add a "renforcée" section.`);
    }
  }

  // Guard 4: Suspended beams must be longer than bay width
  if (config.base_type === "suspended") {
    const bayWidth = config.bay_length_y;
    if (config.suspended_beam_length < bayWidth) {
      warnings.push(`Suspended beam (${config.suspended_beam_length}mm) is shorter than bay width (${bayWidth}mm). Please use a longer beam.`);
    }
  }

  return warnings;
}
