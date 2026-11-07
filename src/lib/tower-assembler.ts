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
const STANDARD_BAY_WIDTHS = [1090, 1400, 1520, 1570];
const STANDARD_LIFT_HEIGHTS = [1000, 1500, 2000, 2500];

/**
 * Standard ringlock standard (vertical) lengths (mm).
 * A tower taller than 3m must be built from multiple stacked standards.
 * Max single standard = 3m (per ACE Scaffold catalog).
 */
const STANDARD_LENGTHS = [500, 1000, 1500, 2000, 2500, 3000];

/**
 * Standard ringlock standard weights (kg) — from ACE Scaffold catalog.
 */
const STANDARD_WEIGHTS: Record<number, number> = {
  500: 3.32,
  1000: 5.66,
  1500: 6.89,
  2000: 10.35,
  2500: 12.65,
  3000: 15.03,
};

/**
 * Standard ringlock ledger weights (kg) — from ACE/wm-scaffold catalog.
 */
const LEDGER_WEIGHTS: Record<number, number> = {
  1090: 5.00,
  1400: 6.00,
  1520: 6.30,
  1570: 6.50,
  2070: 8.00,
  2570: 9.50,
  3070: 11.00,
};

/**
 * Standard steel plank weights (kg, 320mm wide) — from wm-scaffold catalog.
 */
const PLANK_WEIGHTS: Record<number, number> = {
  1090: 11.50,
  1570: 15.60,
  2070: 19.36,
  2570: 23.13,
  3070: 26.89,
};

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

  // Calculate bay configuration — use overrides if provided, otherwise calculate
  const bayX = overrides?.bays_x && overrides?.bay_length_x
    ? { count: overrides.bays_x, size: overrides.bay_length_x }
    : calculateBays(input.requestedLength, STANDARD_BAY_LENGTHS);
  const bayY = overrides?.bays_y && overrides?.bay_length_y
    ? { count: overrides.bays_y, size: overrides.bay_length_y }
    : calculateBays(input.requestedWidth, STANDARD_BAY_WIDTHS);
  const liftHeight = overrides?.lift_height ?? closestStandard(
    Math.min(input.requestedHeight, 2000),
    STANDARD_LIFT_HEIGHTS
  );
  const numLifts = overrides?.num_lifts ?? Math.max(1, Math.round(input.requestedHeight / liftHeight));

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
  };

  // Calculate actual dimensions (may differ from requested due to standard bay sizes)
  const actualLength = bayX.count * bayX.size;
  const actualWidth = bayY.count * bayY.size;
  const actualHeight = numLifts * liftHeight;

  // Warn if actual differs significantly from requested
  const lengthDiff = Math.abs(actualLength - input.requestedLength);
  const widthDiff = Math.abs(actualWidth - input.requestedWidth);
  const heightDiff = Math.abs(actualHeight - input.requestedHeight);

  if (lengthDiff > 200) {
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

  // Calculate BOM — using STANDARD ringlock part sizes
  const numStandards = (bayX.count + 1) * (bayY.count + 1);
  const rosettesPerStandard = numLifts;
  const rosettes = numStandards * rosettesPerStandard;

  // Ledgers
  const ledgersXPerLevel = (bayX.count) * (bayY.count + 1);
  const ledgersYPerLevel = (bayX.count + 1) * (bayY.count);
  const ledgers = (ledgersXPerLevel + ledgersYPerLevel) * numLifts;

  // Braces
  const perimeterFaces = 2 * (bayX.count + bayY.count);
  const braces = config.include_braces ? perimeterFaces * numLifts : 0;

  // Base jacks or wheels
  const baseJacks = numStandards;

  // Planks
  const planks = bayX.count * bayY.count;

  // Gratings: 2 per bay per level
  const gratings = config.include_gratings ? bayX.count * bayY.count * numLifts * 2 : 0;

  // Toeboards: 3 sides per level
  const toeboards = config.include_toeboards ? 3 * numLifts : 0;

  // ─── BUILD DETAILED BOM WITH STANDARD CATALOG WEIGHTS ───
  const details: BomDetailItem[] = [];
  let totalWeight = 0;

  // STANDARDS: split tower height into standard lengths (max 3m each)
  const towerHeightTotal = numLifts * liftHeight;
  const standardSegments = splitIntoStandards(towerHeightTotal);
  // Group by length
  const standardGroups: Record<number, number> = {};
  for (const seg of standardSegments) {
    standardGroups[seg.length] = (standardGroups[seg.length] ?? 0) + 1;
  }
  for (const [len, count] of Object.entries(standardGroups)) {
    const lenNum = parseInt(len);
    const qty = count * numStandards;
    const unitW = STANDARD_WEIGHTS[lenNum] ?? ((lenNum / 1000) * 3.56 + 0.6 + 0.5);
    const totalW = qty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Standard",
      description: `Ringlock standard ${lenNum / 1000}m (48.3×3.2)`,
      size: `${lenNum}mm`,
      quantity: qty,
      unit_weight_kg: Math.round(unitW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // LEDGERS along X
  const ledgerXWeight = LEDGER_WEIGHTS[bayX.size] ?? ((bayX.size / 1000) * 3.56 + 1.0);
  const ledgerXQty = ledgersXPerLevel * numLifts;
  {
    const totalW = ledgerXQty * ledgerXWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: `Ledger ${bayX.size}mm (48.3×3.2)`,
      size: `${bayX.size}mm`,
      quantity: ledgerXQty,
      unit_weight_kg: Math.round(ledgerXWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // LEDGERS along Y
  const ledgerYWeight = LEDGER_WEIGHTS[bayY.size] ?? ((bayY.size / 1000) * 3.56 + 1.0);
  const ledgerYQty = ledgersYPerLevel * numLifts;
  {
    const totalW = ledgerYQty * ledgerYWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: `Ledger ${bayY.size}mm (48.3×3.2)`,
      size: `${bayY.size}mm`,
      quantity: ledgerYQty,
      unit_weight_kg: Math.round(ledgerYWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // DIAGONAL BRACES
  if (braces > 0) {
    const braceLengthMm = Math.sqrt(
      Math.max(bayX.size, bayY.size) ** 2 + liftHeight ** 2
    );
    const braceW = (braceLengthMm / 1000) * 2.75 + 1.0;
    const totalW = braces * braceW;
    totalWeight += totalW;
    details.push({
      part_type: "Diagonal brace",
      description: `Diagonal brace ${Math.round(braceLengthMm)}mm (48.3×2.5)`,
      size: `${Math.round(braceLengthMm)}mm`,
      quantity: braces,
      unit_weight_kg: Math.round(braceW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // BASE JACKS / WHEELS
  {
    const unitW = config.base_type === "wheel" ? 4.5 : 5.2;
    const desc = config.base_type === "wheel" ? "Caster wheel 200mm" : "Base jack 38×600mm (solid)";
    const totalW = baseJacks * unitW;
    totalWeight += totalW;
    details.push({
      part_type: config.base_type === "wheel" ? "Caster wheel" : "Base jack",
      description: desc,
      size: config.base_type === "wheel" ? "200mm" : "38×600mm",
      quantity: baseJacks,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // ROSETTES
  {
    const unitW = 0.6;
    const totalW = rosettes * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Rosette",
      description: "Rosette Ø122×10mm",
      size: "Ø122mm",
      quantity: rosettes,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // GRATINGS (steel planks 320mm wide)
  if (gratings > 0) {
    const gratingLen = bayX.size / 3;
    // Find closest standard plank length
    const plankLenKey = Object.keys(PLANK_WEIGHTS).map(Number).find(
      (l) => Math.abs(l - gratingLen) < 200
    ) ?? Math.round(gratingLen);
    const unitW = PLANK_WEIGHTS[plankLenKey] ?? ((gratingLen / 1000) * 8.5 + 2.3);
    const totalW = gratings * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Grating",
      description: `Steel plank 320×${Math.round(gratingLen)}mm`,
      size: `320×${Math.round(gratingLen)}mm`,
      quantity: gratings,
      unit_weight_kg: Math.round(unitW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // TOEBOARDS
  if (toeboards > 0) {
    const unitW = 2.0;
    const totalW = toeboards * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Toeboard",
      description: "Toeboard (yellow, 100mm high)",
      size: "100mm",
      quantity: toeboards,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // GUARDRAIL POSTS (top level only)
  {
    const grQty = numStandards;
    const unitW = 8.35;
    const totalW = grQty * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Guardrail post",
      description: "Guardrail post 1m (38×2.5)",
      size: "1000mm",
      quantity: grQty,
      unit_weight_kg: unitW,
      total_weight_kg: Math.round(totalW * 100) / 100,
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
export const TOWER_PRESETS = [
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
];
