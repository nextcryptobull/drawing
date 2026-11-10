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
 * Steel plank weights (kg) by plank width — from wm-scaffold catalog.
 * Two width variants: 320mm (heavy-duty) and 230mm (light).
 */
const PLANK_WEIGHTS_320: Record<number, number> = {
  1090: 11.50,
  1570: 15.60,
  2070: 19.36,
  2570: 23.13,
  3070: 26.89,
};

const PLANK_WEIGHTS_230: Record<number, number> = {
  1090: 8.80,
  1570: 11.85,
  2070: 14.90,
  2570: 18.00,
  3070: 21.10,
};

function plankWeightTable(width: 320 | 230): Record<number, number> {
  return width === 320 ? PLANK_WEIGHTS_320 : PLANK_WEIGHTS_230;
}

function plankKgPerM(width: 320 | 230): number {
  return width === 320 ? 8.5 : 6.4;
}

function plankEndWeight(width: 320 | 230): number {
  return width === 320 ? 2.3 : 1.8;
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

  // STANDARDS: split tower height into standard lengths (max 3m each)
  const towerHeightTotal = numLifts * liftHeight;
  const standardSegments = splitIntoStandards(towerHeightTotal);
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

  // LEDGERS along X — grouped by bay_length (one BOM line per length)
  for (const [lenStr, numBays] of Object.entries(bayLengthGroupsX)) {
    const len = parseInt(lenStr);
    const ledgersXForThisLength = numBays * (bayY.count + 1); // per level
    const ledgerXQty = ledgersXForThisLength * (numLifts + 1); // + basement
    const ledgerXWeight = LEDGER_WEIGHTS[len] ?? ((len / 1000) * 3.56 + 1.0);
    const totalW = ledgerXQty * ledgerXWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: `Ledger ${len}mm (48.3×3.2) incl. basement reinforcing`,
      size: `${len}mm`,
      quantity: ledgerXQty,
      unit_weight_kg: Math.round(ledgerXWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // LEDGERS along Y (including basement reinforcing)
  {
    const ledgerYWeight = LEDGER_WEIGHTS[bayY.size] ?? ((bayY.size / 1000) * 3.56 + 1.0);
    const ledgerYQty = ledgersYPerLevel * (numLifts + 1);
    const totalW = ledgerYQty * ledgerYWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ledger",
      description: `Ledger ${bayY.size}mm (48.3×3.2) incl. basement reinforcing`,
      size: `${bayY.size}mm`,
      quantity: ledgerYQty,
      unit_weight_kg: Math.round(ledgerYWeight * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // DIAGONAL BRACES — one BOM line per bay_length group
  if (braces > 0) {
    for (const group of braceGroups) {
      const braceLengthMm = Math.sqrt(group.bayLength ** 2 + liftHeight ** 2);
      const braceW = (braceLengthMm / 1000) * 2.75 + 1.0;
      const qty = group.faceCount * numLifts;
      const totalW = qty * braceW;
      totalWeight += totalW;
      details.push({
        part_type: "Diagonal brace",
        description: `Diagonal brace ${Math.round(braceLengthMm)}mm (48.3×2.5)`,
        size: `${Math.round(braceLengthMm)}mm`,
        quantity: qty,
        unit_weight_kg: Math.round(braceW * 100) / 100,
        total_weight_kg: Math.round(totalW * 100) / 100,
      });
    }
  }

  // BASE JACKS / WHEELS — compliant to ringlock standard
  // Base jack solid 38×600mm: 5.2 kg (ACE catalog), base plate 150×150×6mm
  // Base jack hollow 38×600mm: 4.3 kg (wm-scaffold), adjustable 40-450mm
  // Caster wheel 8" (200mm) total-lock: 5.7 kg (12.5 lbs), Ø200×50mm, PU on cast iron
  //   - Total lock brake (wheel + swivel)
  //   - Stem Ø35mm (1-3/8") round with pin hole
  //   - Load capacity: 500 lbs / 227 kg per wheel
  {
    const unitW = config.base_type === "wheel" ? 5.7 : 5.2;
    const desc = config.base_type === "wheel"
      ? 'Caster wheel 8" (200mm) total-lock, PU on cast iron'
      : "Base jack 38×600mm solid, ACME thread, base plate 150×150×6mm";
    const totalW = baseJacks * unitW;
    totalWeight += totalW;
    details.push({
      part_type: config.base_type === "wheel" ? "Caster wheel" : "Base jack",
      description: desc,
      size: config.base_type === "wheel" ? "Ø200×50mm" : "38×600mm",
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

  // GRATINGS (steel planks, width = plank_width, length = bay_length_y)
  if (gratings > 0) {
    const pw = config.plank_width;
    const plankLen = bayY.size; // grating length = bay_length_y
    const plankWeights = plankWeightTable(pw);
    const plankLenKey = Object.keys(plankWeights).map(Number).find(
      (l) => Math.abs(l - plankLen) < 200
    ) ?? Math.round(plankLen);
    const unitW = plankWeights[plankLenKey] ?? ((plankLen / 1000) * plankKgPerM(pw) + plankEndWeight(pw));
    const totalW = gratings * unitW;
    totalWeight += totalW;
    details.push({
      part_type: "Grating",
      description: `Steel hook plank ${pw}×${Math.round(plankLen)}mm`,
      size: `${pw}×${Math.round(plankLen)}mm`,
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

  // PRIMARY LADDER (if enabled)
  if (config.include_ladder) {
    const rungSpacing = 300;
    const rungCount = Math.floor(towerHeightTotal / rungSpacing);
    const railWeight = (towerHeightTotal / 1000) * 1.7 * 2; // 2 rails, Ø30mm ≈ 1.7 kg/m
    const rungWeight = rungCount * 0.3;
    const totalW = railWeight + rungWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ladder",
      description: `Primary vertical ladder 2×Ø30 rail + ${rungCount} rungs @300mm`,
      size: `${towerHeightTotal}mm`,
      quantity: 1,
      unit_weight_kg: Math.round(totalW * 100) / 100,
      total_weight_kg: Math.round(totalW * 100) / 100,
    });
  }

  // SECONDARY LADDER (escape, auto at ≥20m height/length)
  if (config.secondary_access) {
    const rungSpacing = 300;
    const rungCount = Math.floor(towerHeightTotal / rungSpacing);
    const railWeight = (towerHeightTotal / 1000) * 1.7 * 2;
    const rungWeight = rungCount * 0.3;
    const totalW = railWeight + rungWeight;
    totalWeight += totalW;
    details.push({
      part_type: "Ladder",
      description: `Secondary vertical ladder (escape) 2×Ø30 rail + ${rungCount} rungs @300mm`,
      size: `${towerHeightTotal}mm`,
      quantity: 1,
      unit_weight_kg: Math.round(totalW * 100) / 100,
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
