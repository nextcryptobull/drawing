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

  // Calculate BOM
  const standards = (bayX.count + 1) * (bayY.count + 1);
  const rosettesPerStandard = numLifts;
  const rosettes = standards * rosettesPerStandard;

  // Ledgers: 2 per bay per level (one on each side), plus perimeter
  const ledgersXPerLevel = (bayX.count) * (bayY.count + 1); // along X
  const ledgersYPerLevel = (bayX.count + 1) * (bayY.count); // along Y
  const ledgers = (ledgersXPerLevel + ledgersYPerLevel) * numLifts;

  // Braces: ONE diagonal per perimeter bay face per level
  const perimeterFaces = 2 * (bayX.count + bayY.count);
  const braces = config.include_braces ? perimeterFaces * numLifts : 0;

  // Base jacks or wheels: one per standard
  const baseJacks = standards;

  // Planks: one per bay (top level only)
  const planks = bayX.count * bayY.count;

  // Gratings: 2 per bay per level (2 pieces + 1 open for access)
  const gratings = config.include_gratings ? bayX.count * bayY.count * numLifts * 2 : 0;

  // Toeboards: 4 sides per level (if enabled)
  const toeboards = config.include_toeboards ? 4 * numLifts : 0;

  // ACCURATE INDUSTRY-STANDARD WEIGHTS
  // Sources: ACE Scaffold catalog, wm-scaffold.com, SSP Global, EN 12811
  //
  // Standards (per piece, includes rosettes + spigot):
  //   0.5m=3.32kg, 1.0m=5.66kg, 1.5m=6.89kg, 2.0m=10.35kg, 2.5m=12.65kg, 3.0m=15.03kg
  //   → formula: 3.56 kg/m tube + 0.6 kg/rosette + 0.5 kg spigot
  //
  // Ledgers (48.3×3.2 tube + 2 wedge heads):
  //   1.09m=5.0kg, 1.57m=6.0kg, 2.07m=8.0kg, 2.57m=9.5kg, 3.07m=11.0kg
  //   → formula: 3.56 kg/m + 1.0 kg (2 wedge heads)
  //
  // Steel planks (320mm wide, with hooks):
  //   1.57m=15.60kg, 2.07m=19.36kg, 2.57m=23.13kg, 3.07m=26.89kg
  //   → formula: ~8.5 kg/m + 2.3 kg (hooks)
  //
  // Diagonal braces (48.3×2.5 tube + 2 heads):
  //   2.07×2.0m=~8.0kg, 2.57×2.0m=~9.97kg, 3.05×2.0m=~11.2kg
  //   → formula: brace_length × 1.7 kg/m + 1.0 kg (2 heads)
  //
  // Base jacks:
  //   Solid 38×600mm = 5.2 kg (ACE), 8.10 kg (SSP)
  //   Hollow 38×600mm = 4.10 kg (SSP)
  //   → use 5.2 kg for solid (most common)
  //
  // Caster wheel assembly = 4.5 kg (typical 200mm)
  //
  // Guardrail posts = 8.35 kg per 1m post (catalog)
  //
  // Toeboards = 2.0 kg per piece (estimate)

  const towerH = numLifts * liftHeight;
  const standardWeight = (towerH / 1000) * 3.56 + numLifts * 0.6 + 0.5;
  const ledgerWeightX = (bayX.size / 1000) * 3.56 + 1.0;
  const ledgerWeightY = (bayY.size / 1000) * 3.56 + 1.0;
  const braceLength = Math.sqrt(
    Math.max(bayX.size, bayY.size) ** 2 + liftHeight ** 2
  );
  const braceWeight = (braceLength / 1000) * 1.7 + 1.0;

  // Steel plank weight (320mm wide, follows bay_length_x)
  // Formula: 8.5 kg/m + 2.3 kg hooks
  const plankWeight = (bayX.size / 1000) * 8.5 + 2.3;

  // Grating = steel plank (320mm wide, 1/3 of bay length each piece)
  // 2 pieces per bay per level, each covers 1/3 of bay
  const gratingPieceLength = (bayX.size / 3) / 1000; // meters
  const gratingPieceWeight = gratingPieceLength * 8.5 + 2.3; // kg per piece

  const baseWeight = config.base_type === "wheel" ? 4.5 : 5.2;
  const guardrailWeight = 8.35; // 1m guardrail post
  const guardrailCount = config.include_braces ? bayX.count * 4 : 0; // 4 posts per bay on top level
  const toeboardWeight = 2.0;

  const estimatedWeight =
    standards * standardWeight +
    ledgersXPerLevel * numLifts * ledgerWeightX +
    ledgersYPerLevel * numLifts * ledgerWeightY +
    braces * braceWeight +
    baseJacks * baseWeight +
    planks * plankWeight +
    gratings * gratingPieceWeight +
    toeboards * toeboardWeight +
    guardrailCount * guardrailWeight;

  const bom: PartsBom = {
    standards,
    ledgers,
    braces,
    base_jacks: baseJacks,
    rosettes,
    planks,
    gratings,
    toeboards,
    total_parts: standards + ledgers + braces + baseJacks + rosettes + planks + gratings + toeboards,
    estimated_weight_kg: Math.round(estimatedWeight),
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
