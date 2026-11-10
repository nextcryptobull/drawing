"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { TowerConfig } from "@/lib/part-types";
import { computeSectionLayout } from "@/lib/tower-assembler";

/**
 * Procedural scaffold tower assembly built from THREE primitives.
 *
 * Coordinate system (mm):
 *   - Ground is the XY plane, +Z is up.
 *   - Standards placed on a grid at (bayLayout.standardXs[i], j*bay_length_y, 0).
 *     For uniform bays, standardXs = [-towerX/2, -towerX/2 + bay_length_x, ...].
 *     For mixed sections, standardXs reflects each bay's actual length.
 *   - Each standard spans z = 0 .. num_lifts*lift_height.
 *   - Rosettes welded onto standards at z = lift_height, 2*lift_height, ...
 *   - Ledgers connect adjacent standards at each rosette level (horizontal
 *     tubes along X and Y).
 *   - Diagonal braces cross each bay face on the perimeter.
 *   - Base jacks (short cylinders) sit below each standard when enabled.
 *   - Planks (thin boxes) cover the top of each bay when enabled.
 *   - Gratings = N steel planks per bay (count = floor(bay_length / plank_width)).
 *
 * The group is centred on the origin in XY so the camera frames the tower
 * nicely. Z=0 is ground level.
 */
export function ScaffoldTowerMesh({ config, onPartClick, removedParts, onRemovePart }: { config: TowerConfig; onPartClick?: (name: string, position: [number, number, number], id?: string) => void; removedParts?: Set<string>; onRemovePart?: (id: string) => void }) {
  const {
    bays_x,
    bays_y,
    bay_length_x,
    bay_length_y,
    lift_height,
    num_lifts,
    tube_od,
    tube_wall,
    rosette_disc_od,
    rosette_thickness,
    spigot_od,
    spigot_length,
    ledger_od,
    include_braces,
    include_base_jacks,
    base_jack_od,
    base_jack_length,
    include_planks,
    plank_thickness,
    // New fields with defaults for backward compat
    base_type = "jack",
    include_gratings = true,
    include_toeboards = true,
    disabled_platform_levels = [],
    include_ladder = false,
    plank_width = 320,
    secondary_access = false,
    sections,
  } = config as TowerConfig & {
    base_type?: "jack" | "wheel";
    include_gratings?: boolean;
    include_toeboards?: boolean;
    disabled_platform_levels?: number[];
    include_ladder?: boolean;
    plank_width?: 320 | 230;
    secondary_access?: boolean;
    sections?: Array<{ bays: number; bay_length: number }>;
  };

  // When secondary access is enabled (auto at ≥20m height/length), the primary
  // staircase must ALSO be present — it's the main access, secondary is the escape.
  // This ensures both staircases render when secondary_access auto-triggers,
  // even if the user didn't manually enable "Ladder (access side)".
  const hasPrimaryStaircase = include_ladder || secondary_access;

  const materials = useMemo(
    () => ({
      standard: new THREE.MeshStandardMaterial({
        color: "#8e9098",
        roughness: 0.45,
        metalness: 0.75,
      }),
      rosette: new THREE.MeshStandardMaterial({
        color: "#d9822e",
        roughness: 0.45,
        metalness: 0.55,
      }),
      ledger: new THREE.MeshStandardMaterial({
        color: "#6a6c74",
        roughness: 0.5,
        metalness: 0.7,
      }),
      brace: new THREE.MeshStandardMaterial({
        color: "#4a8c4a",
        roughness: 0.6,
        metalness: 0.5,
      }),
      baseJack: new THREE.MeshStandardMaterial({
        color: "#3a3c42",
        roughness: 0.7,
        metalness: 0.6,
      }),
      wheel: new THREE.MeshStandardMaterial({
        color: "#1a4dd8",
        roughness: 0.6,
        metalness: 0.3,
      }),
      wheelFork: new THREE.MeshStandardMaterial({
        color: "#6a6c74",
        roughness: 0.5,
        metalness: 0.7,
      }),
      brakePedal: new THREE.MeshStandardMaterial({
        color: "#cc2222",
        roughness: 0.6,
        metalness: 0.3,
      }),
      spigot: new THREE.MeshStandardMaterial({
        color: "#56585e",
        roughness: 0.4,
        metalness: 0.85,
      }),
      plank: new THREE.MeshStandardMaterial({
        color: "#8b6f47",
        roughness: 0.85,
        metalness: 0.1,
      }),
      grating: new THREE.MeshStandardMaterial({
        color: "#5a6c7a",
        roughness: 0.5,
        metalness: 0.7,
        transparent: true,
        opacity: 0.7,
      }),
      toeboard: new THREE.MeshStandardMaterial({
        color: "#d4a017",
        roughness: 0.6,
        metalness: 0.3,
      }),
      innerBore: new THREE.MeshStandardMaterial({
        color: "#2a2a30",
        roughness: 0.85,
        metalness: 0.1,
      }),
      ladder: new THREE.MeshStandardMaterial({
        color: "#f5c518",
        roughness: 0.5,
        metalness: 0.4,
      }),
      ladderSecondary: new THREE.MeshStandardMaterial({
        color: "#ff8c00",
        roughness: 0.5,
        metalness: 0.4,
      }),
    }),
    [],
  );

  // Check if a part ID has been removed by the user
  const isRemoved = (id: string) => removedParts?.has(id) ?? false;

  // ─── BAY LAYOUT ─────────────────────────────────────────────────────────
  // For uniform bays: a single section of bays_x × bay_length_x.
  // For mixed sections: each section's bays/length are honoured separately.
  // bayLayout.standardXs has length totalBays + 1 (standards shared at
  // section boundaries). bayLayout.bayCenters and bayLengths have length
  // totalBays.
  const bayLayout = useMemo(() => {
    if (sections && sections.length > 0) {
      return computeSectionLayout(sections);
    }
    return computeSectionLayout([{ bays: bays_x, bay_length: bay_length_x }]);
  }, [sections, bays_x, bay_length_x]);

  const towerX = bayLayout.totalLength;
  const towerY = bays_y * bay_length_y;
  const towerHeight = num_lifts * lift_height;

  // Standard positions (grid corners) — uses bayLayout for X positions
  const standardPositions = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < bayLayout.standardXs.length; i++) {
      for (let j = 0; j <= bays_y; j++) {
        const x = bayLayout.standardXs[i];
        const y = j * bay_length_y - towerY / 2;
        pts.push([x, y]);
      }
    }
    return pts;
  }, [bayLayout, bays_y, bay_length_y, towerY]);

  // Rosette z-positions: one per lift
  const rosetteZs = useMemo(() => {
    const zs: number[] = [];
    for (let k = 1; k <= num_lifts; k++) {
      zs.push(k * lift_height);
    }
    return zs;
  }, [num_lifts, lift_height]);

  const verticalRotation: [number, number, number] = [Math.PI / 2, 0, 0];

  const tubeR = tube_od / 2;
  const tubeID = tube_od - 2 * tube_wall;
  const spigotR = spigot_od / 2;
  const rosetteR = rosette_disc_od / 2;
  const ledgerR = ledger_od / 2;
  const baseJackR = base_jack_od / 2;

  // Ledgers — uses bayLayout so each bay's actual length is respected
  const ledgers = useMemo(() => {
    const items: {
      x: number;
      y: number;
      z: number;
      len: number;
      axis: "x" | "y";
    }[] = [];
    for (let k = 0; k < num_lifts; k++) {
      const z = (k + 1) * lift_height;
      // Ledgers along X (per bay, length = bayLayout.bayLengths[i])
      for (let i = 0; i < bayLayout.bayCenters.length; i++) {
        for (let j = 0; j <= bays_y; j++) {
          const x = bayLayout.bayCenters[i];
          const y = j * bay_length_y - towerY / 2;
          items.push({ x, y, z, len: bayLayout.bayLengths[i], axis: "x" });
        }
      }
      // Ledgers along Y (per standard X position, length = bay_length_y)
      for (let i = 0; i < bayLayout.standardXs.length; i++) {
        for (let j = 0; j < bays_y; j++) {
          const x = bayLayout.standardXs[i];
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          items.push({ x, y: (y1 + y2) / 2, z, len: bay_length_y, axis: "y" });
        }
      }
    }
    return items;
  }, [
    bayLayout,
    bays_y,
    bay_length_y,
    lift_height,
    num_lifts,
    towerY,
  ]);

  // Diagonal braces (perimeter only).
  // Real scaffold practice: ONE diagonal per side, with opposite direction
  // across (adjacent sides have opposite diagonal directions). NOT an X-pattern.
  // X-axis perimeter faces: at first and last standard X positions (the two
  // extremities of the tower). Always braced.
  // Y-axis perimeter faces: only at every 3rd bay + the two extremity bays
  // (bay 0, bay 3, bay 6, ..., last bay). This follows the user's rule:
  // "Diagonals are needed at every 3rd bays and at two extremities."
  const braces = useMemo(() => {
    if (!include_braces) return [];
    const items: {
      from: [number, number, number];
      to: [number, number, number];
    }[] = [];
    const totalBays = bayLayout.bayCenters.length;
    const lastBayIdx = totalBays - 1;
    // A bay gets Y-axis braces if it's bay 0, every 3rd bay, or the last bay
    const shouldBraceBay = (bi: number) =>
      bi === 0 || bi % 3 === 0 || bi === lastBayIdx;

    for (let k = 0; k < num_lifts; k++) {
      const z1 = k * lift_height;
      const z2 = (k + 1) * lift_height;
      // X-axis perimeter faces (left/right ends of tower — first/last standard)
      // These are the "two extremities" — always braced.
      for (const sideIdx of [0, 1] as number[]) {
        const i = sideIdx === 0 ? 0 : bayLayout.standardXs.length - 1;
        const x = bayLayout.standardXs[i];
        const dir = sideIdx === 0 ? 1 : -1;
        for (let j = 0; j < bays_y; j++) {
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          if (dir > 0) {
            items.push({ from: [x, y1, z1], to: [x, y2, z2] });
          } else {
            items.push({ from: [x, y1, z2], to: [x, y2, z1] });
          }
        }
      }
      // Y-axis perimeter faces (front/back of tower) — only at every 3rd bay + extremities
      for (const sideIdx of [0, 1] as number[]) {
        const j = sideIdx === 0 ? 0 : bays_y;
        const y = j * bay_length_y - towerY / 2;
        const dir = sideIdx === 0 ? 1 : -1;
        for (let bi = 0; bi < totalBays; bi++) {
          if (!shouldBraceBay(bi)) continue; // skip non-braced bays
          const x1 = bayLayout.standardXs[bi];
          const x2 = bayLayout.standardXs[bi + 1];
          if (dir > 0) {
            items.push({ from: [x1, y, z1], to: [x2, y, z2] });
          } else {
            items.push({ from: [x1, y, z2], to: [x2, y, z1] });
          }
        }
      }
    }
    return items;
  }, [
    include_braces,
    bayLayout,
    bays_y,
    bay_length_y,
    lift_height,
    num_lifts,
    towerY,
  ]);

  // Planks (top-level platforms — separate from per-level gratings)
  const planks = useMemo(() => {
    if (!include_planks) return [];
    const items: { x: number; y: number; w: number; h: number; z: number }[] = [];
    const topZ = towerHeight + plank_thickness / 2;
    for (let i = 0; i < bayLayout.bayCenters.length; i++) {
      for (let j = 0; j < bays_y; j++) {
        const x = bayLayout.bayCenters[i];
        const y = (j + 0.5) * bay_length_y - towerY / 2;
        items.push({
          x,
          y,
          w: bayLayout.bayLengths[i] * 0.92,
          h: bay_length_y * 0.92,
          z: topZ,
        });
      }
    }
    return items;
  }, [
    include_planks,
    bayLayout,
    bays_y,
    bay_length_y,
    towerHeight,
    plank_thickness,
    towerY,
  ]);

  // ─── STAIRCASE OPENING POSITIONS (per lift, non-adjacent, 15° angle) ──
  // The staircase is inclined at 15° from vertical (the standard safe ladder
  // angle — the "1 in 4" rule). This makes it a steep stair/ladder hybrid.
  //
  // For a 2000mm lift height:
  //   horizontal run = lift_height × tan(15°) ≈ 536mm
  //   staircase length = lift_height / cos(15°) ≈ 2071mm (matches MDCRSC2134)
  //
  // The staircase TOP (exit) is at the 2-plank opening; the BOTTOM (entrance)
  // is 536mm inward. Direction alternates per lift to avoid adjacent traps:
  //   even lifts: opening at +X, staircase goes (-X inward)→(+X opening) on +Y
  //   odd  lifts: opening at -X, staircase goes (+X inward)→(-X opening) on -Y
  const staircaseOpenings = useMemo(() => {
    const gap = 4;
    const pw = plank_width;
    const angleFromVertical = 15 * (Math.PI / 180); // 15° in radians
    const staircaseRun = lift_height * Math.tan(angleFromVertical); // horizontal run
    const railOffset = 200; // 400mm between stringers → ±200mm (must match renderStaircaseSection)

    // `startOnPlusY` controls which face the FIRST lift (liftIdx 0) is on.
    // Primary staircase: startOnPlusY=true  → lift 0 on +Y, lift 1 on -Y, ...
    // Secondary staircase: startOnPlusY=false → lift 0 on -Y, lift 1 on +Y, ...
    // This ensures primary and secondary are ALWAYS on opposite faces at any
    // given lift (non-adjacent), so the primary is never occluded by the
    // secondary's bay geometry.
    const computeForBayAndLift = (bayIdx: number, liftIdx: number, startOnPlusY = true) => {
      if (bayIdx >= bayLayout.bayCenters.length) return null;
      const bayLenX = bayLayout.bayLengths[bayIdx];
      const planksPerBay = Math.max(2, Math.floor((bayLenX + gap) / (pw + gap)));
      const stepX = bayLenX / planksPerBay;
      const bayStartX = bayLayout.standardXs[bayIdx];
      const bayEndX = bayStartX + bayLenX;
      // Opening direction alternates per lift:
      //   even lift (0, 2, 4): opening at +X end
      //   odd  lift (1, 3, 5): opening at -X end
      const openingAtPlusX = liftIdx % 2 === 0;
      const count = 2; // 2 planks removed for staircase clearance
      const startIdx = openingAtPlusX ? planksPerBay - count : 0;
      // Staircase TOP (exit) is at the opening end of the bay
      const xTop = openingAtPlusX ? bayEndX : bayStartX;
      // Staircase BOTTOM (entrance) is `staircaseRun` mm inward from the top
      const xBottom = openingAtPlusX ? bayEndX - staircaseRun : bayStartX + staircaseRun;
      // Y face alternates per lift (non-adjacent), offset by startOnPlusY.
      // The yFace is the CENTERLINE of the staircase. The two stringers are
      // at yFace ± railOffset (±200mm). To keep both stringers INSIDE the
      // scaffold frame (|y| < towerY/2), yFace must be at
      // towerY/2 - railOffset - margin. Using 80mm margin from the outer
      // standard, so yFace = towerY/2 - 280, outer stringer = towerY/2 - 80.
      // Primary (true):   even=+Y face, odd=-Y face
      // Secondary (false): even=-Y face, odd=+Y face
      const onPlusY = startOnPlusY ? (liftIdx % 2 === 0) : (liftIdx % 2 === 1);
      const yMargin = 80; // distance from outer stringer to the standard
      const yFace = onPlusY ? (towerY / 2 - railOffset - yMargin) : -(towerY / 2 - railOffset - yMargin);
      // Trapdoor position (at the top of the staircase = the opening)
      const trapdoorX = bayStartX + (startIdx + count / 2) * stepX;
      const trapdoorWidth = count * stepX * 0.92;
      return {
        skipIndices: Array.from({ length: count }, (_, k) => startIdx + k),
        xBottom, xTop, yFace, onPlusY,
        trapdoorX, trapdoorWidth,
        planksPerBay, stepX, bayStartX,
      };
    };
    return { computeForBayAndLift };
  }, [bayLayout, plank_width, lift_height, towerY]);

  // ─── Staircase section helper (15° from vertical) ────────────────────
  // Renders one inclined staircase section covering a single lift level.
  // The staircase is at 15° from vertical (75° from horizontal) — a steep
  // stair/ladder hybrid (the standard safe ladder angle, "1 in 4" rule).
  //
  // For a 2000mm lift: horizontal run ≈ 536mm, staircase length ≈ 2071mm
  // (matches MDCRSC2134 catalog length of 2134mm).
  //
  // Each section: 2 stringers + 5 steps + 1 guard rail.
  //
  // NON-ADJACENT PATTERN (no adjacent ladder traps):
  //   - Each section alternates between +Y and -Y faces per lift
  //   - The staircase DIRECTION also alternates per lift:
  //       even lifts: -X → +X on +Y face (opening at +X end)
  //       odd  lifts: +X → -X on -Y face (opening at -X end)
  //   - This means the exit of one staircase = the entrance of the next,
  //     and the platform opening alternates +X/-X per lift → no two
  //     adjacent levels have openings in the same position.
  const renderStaircaseSection = (
    bayIdx: number,
    liftIdx: number,
    material: THREE.Material,
    partName: string,
    partIdPrefix: string,
    startOnPlusY: boolean,
  ) => {
    if (bayIdx >= bayLayout.bayCenters.length) return null;

    const opening = staircaseOpenings.computeForBayAndLift(bayIdx, liftIdx, startOnPlusY);
    if (!opening) return null;

    const railOffset = 200; // 400mm between stringers → ±200mm
    const stepCount = 5; // MDCSFS0860 = 5 per staircase
    const guardRailOffset = 100; // guard rail is 100mm above the stringer

    const zBottom = liftIdx * lift_height;
    const zTop = (liftIdx + 1) * lift_height;

    // Use the opening's computed xBottom/xTop/yFace (already alternated per lift)
    const { xBottom, xTop, yFace, onPlusY } = opening;

    // Direction vector (from bottom to top, in X-Z plane)
    const dx = xTop - xBottom;
    const dz = zTop - zBottom;
    const len = Math.sqrt(dx * dx + dz * dz);
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
    const euler = new THREE.Euler().setFromQuaternion(quat);

    // Midpoint of the staircase
    const midX = (xBottom + xTop) / 2;
    const midZ = (zBottom + zTop) / 2;

    return (
      <group
        key={`${partIdPrefix}-L${liftIdx}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onPartClick) onPartClick(`${partName} (lift ${liftIdx + 1})`, [midX, yFace, midZ], `${partIdPrefix}-L${liftIdx}`);
        }}
      >
        {/* Left stringer (offset -Y from yFace) */}
        <mesh
          rotation={[euler.x, euler.y, euler.z]}
          position={[midX, yFace - railOffset, midZ]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[15, 15, len, 16]} />
        </mesh>
        {/* Right stringer (offset +Y from yFace) */}
        <mesh
          rotation={[euler.x, euler.y, euler.z]}
          position={[midX, yFace + railOffset, midZ]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[15, 15, len, 16]} />
        </mesh>
        {/* Steps: 5 horizontal planks, spanning between stringers */}
        {Array.from({ length: stepCount }).map((_, si) => {
          const t = (si + 0.5) / stepCount; // 0.1, 0.3, 0.5, 0.7, 0.9
          const stepX = xBottom + dx * t;
          const stepZ = zBottom + dz * t;
          return (
            <mesh
              key={`${partIdPrefix}-step-L${liftIdx}-${si}`}
              position={[stepX, yFace, stepZ]}
              material={material}
              castShadow
            >
              <boxGeometry args={[100, railOffset * 2 + 40, 20]} />
            </mesh>
          );
        })}
        {/* Guard rail: parallel to stringers, on the outer side (away from platform center) */}
        <mesh
          rotation={[euler.x, euler.y, euler.z]}
          position={[
            midX,
            onPlusY ? yFace + railOffset + guardRailOffset : yFace - railOffset - guardRailOffset,
            midZ,
          ]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[12, 12, len, 16]} />
        </mesh>
      </group>
    );
  };

  // ─── Trapdoor renderer ────────────────────────────────────────────────
  // Renders a hatch covering 2 grating frames, positioned WITHIN the scaffold
  // frame. The trapdoor:
  // - X: ~1/3 of bay length (the staircase opening area)
  // - Y: 2 × plank_width (covers 2 grating frames)
  // - Hinge on the INNER Y edge (towards scaffold center)
  // - Positioned so the OUTER Y edge aligns with the outer standard (within frame)
  const renderTrapdoor = (
    opening: { xTop: number; yFace: number; onPlusY: boolean },
    bayLen: number,
    levelIdx: number,
    z: number,
    type: "primary" | "secondary",
  ) => {
    const pw = plank_width;
    const gap = 4;
    const trapThk = 50;
    const trapLenX = bayLen / 3;
    const trapX = opening.xTop - trapLenX / 2;
    // Y width: 2 plank widths + gap (covers 2 grating frames)
    const trapWidthY = pw * 2 + gap;

    // Position so the trapdoor stays WITHIN the scaffold frame:
    // The outer Y edge aligns just inside the outer standard (towerY/2 - margin)
    // The inner Y edge points toward scaffold center
    const frameMargin = 50; // 50mm inside the outer standard
    const outerEdgeY = opening.onPlusY
      ? towerY / 2 - frameMargin        // +Y staircase: outer edge at +Y side
      : -(towerY / 2 - frameMargin);   // -Y staircase: outer edge at -Y side
    // Trapdoor center = outer edge - half width (towards center)
    const trapY = opening.onPlusY
      ? outerEdgeY - trapWidthY / 2
      : outerEdgeY + trapWidthY / 2;

    const gratingTopZ = z - 2;
    const trapZ = gratingTopZ + trapThk / 2;
    const hingeThk = 25;
    const hingeHeight = 35;
    // Hinge on INNER Y edge (towards scaffold center)
    const hingeY = opening.onPlusY
      ? trapY - trapWidthY / 2 - hingeThk / 2  // +Y staircase → hinge at -Y (inner)
      : trapY + trapWidthY / 2 + hingeThk / 2; // -Y staircase → hinge at +Y (inner)
    const handleWidth = 60;
    const handleHeight = 50;
    const handleDepth = 25;
    const label = type === "primary" ? "Trap door" : "Trap door (escape)";
    return (
      <group key={`trapdoor-${type}-L${levelIdx}`}>
        <mesh
          position={[trapX, trapY, trapZ]}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            if (onPartClick) onPartClick(`${label} L${levelIdx + 1}`, [trapX, trapY, trapZ], `trapdoor-${type}-L${levelIdx}`);
          }}
        >
          <boxGeometry args={[trapLenX, trapWidthY, trapThk]} />
          <meshStandardMaterial color="#e85d04" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Hinge bar — on INNER Y edge (towards scaffold frame) */}
        <mesh position={[trapX, hingeY, trapZ]} castShadow>
          <boxGeometry args={[trapLenX + 10, hingeThk, trapThk + hingeHeight]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Silver handle/stay on top */}
        <mesh
          position={[trapX, trapY, trapZ + trapThk / 2 + handleHeight / 2]}
          castShadow
        >
          <boxGeometry args={[handleWidth, handleDepth, handleHeight]} />
          <meshStandardMaterial color="#c0c0c8" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Handle base plate */}
        <mesh
          position={[trapX, trapY, trapZ + trapThk / 2 + 2]}
          castShadow
        >
          <boxGeometry args={[handleWidth + 20, handleDepth + 20, 4]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.7} metalness={0.5} />
        </mesh>
      </group>
    );
  };

  return (
    <group>
      {/* ---- Standards (vertical tubes + rosettes + spigot) ---- */}
      {standardPositions.map(([x, y], idx) => (
        <group key={`std-${idx}`} position={[x, y, 0]}>
          {/* Vertical tube */}
          <mesh
            rotation={verticalRotation}
            position={[0, 0, towerHeight / 2]}
            material={materials.standard}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[tubeR, tubeR, towerHeight, 24]} />
          </mesh>
          {/* Inner bore (slightly taller to stay visible) */}
          <mesh
            rotation={verticalRotation}
            position={[0, 0, towerHeight / 2]}
            material={materials.innerBore}
          >
            <cylinderGeometry args={[tubeID / 2, tubeID / 2, towerHeight + 1, 20]} />
          </mesh>

          {/* Rosettes at each lift level */}
          {rosetteZs.map((z, ri) => (
            <mesh
              key={`ros-${idx}-${ri}`}
              rotation={verticalRotation}
              position={[0, 0, z]}
              material={materials.rosette}
              castShadow
            >
              <cylinderGeometry args={[rosetteR, rosetteR, rosette_thickness, 48]} />
            </mesh>
          ))}

          {/* Top spigot */}
          <mesh
            rotation={verticalRotation}
            position={[0, 0, towerHeight + spigot_length / 2]}
            material={materials.spigot}
            castShadow
          >
            <cylinderGeometry args={[spigotR, spigotR, spigot_length, 24]} />
          </mesh>

          {/* Base: jack or wheel (below ground line) */}
          {base_type === "wheel" ? (
            /* Standard ringlock caster wheel with brake (8" / 200mm):
               Built in TOWER Z-up coords:
               - Wheel axis = Y (horizontal, rolls along X)
               - Fork plates straddle wheel at Y±28
               - Stem axis = Z (vertical, connects to standard above)
               - Brake pedal extends in +X direction (red) */
            <group
              position={[0, 0, -180]}
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick("Caster wheel 8\" with brake", [x, y, -180], `wheel-${idx}`);
              }}
            >
              {/* === FORK (two plates straddling the wheel) === */}
              {/* Left fork plate (Y- side) */}
              <mesh position={[0, -28, 60]} material={materials.wheelFork} castShadow>
                <boxGeometry args={[6, 6, 120]} />
              </mesh>
              {/* Right fork plate (Y+ side) */}
              <mesh position={[0, 28, 60]} material={materials.wheelFork} castShadow>
                <boxGeometry args={[6, 6, 120]} />
              </mesh>

              {/* === WHEEL (between the forks, axis along Y) === */}
              {/* PU tread: Ø200mm × 48mm wide (default cylinder = Y axis = correct, NO rotation) */}
              <mesh material={materials.wheel} castShadow>
                <cylinderGeometry args={[100, 100, 48, 32]} />
              </mesh>
              {/* Cast iron hub: Ø60mm × 52mm */}
              <mesh material={materials.wheelFork} castShadow>
                <cylinderGeometry args={[30, 30, 52, 24]} />
              </mesh>
              {/* Axle: Ø16mm through hub */}
              <mesh material={materials.spigot} castShadow>
                <cylinderGeometry args={[8, 8, 56, 12]} />
              </mesh>

              {/* === SWIVEL HOUSING (above wheel, between fork top and stem) === */}
              {/* Ø70mm × 25mm tall (vertical = Z axis, needs rotation PI/2 around X) */}
              <mesh position={[0, 0, 130]} material={materials.wheelFork} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[35, 35, 25, 24]} />
              </mesh>

              {/* === BRAKE PEDAL (red, total-lock) === */}
              {/* Pedal arm: extends outward in +X from swivel housing */}
              <mesh position={[35, 0, 125]} material={materials.brakePedal} castShadow>
                <boxGeometry args={[40, 15, 6]} />
              </mesh>
              {/* Pedal pad: flat plate for foot pressure */}
              <mesh position={[55, 0, 120]} material={materials.brakePedal} castShadow>
                <boxGeometry args={[20, 25, 8]} />
              </mesh>

              {/* === STEM (connects swivel to standard above) === */}
              {/* Stem: Ø35mm × 40mm, vertical (Z axis, rotation PI/2 around X) */}
              <mesh position={[0, 0, 162]} material={materials.wheelFork} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[17.5, 17.5, 40, 16]} />
              </mesh>
            </group>
          ) : include_base_jacks ? (
            /* Standard ringlock base jack:
               - Solid: Ø38mm × 600mm, ACME thread (4 TPI)
               - Base plate: 150×150×6mm
               - Adjustment range: 40-450mm
               - Weight: solid 5.2 kg, hollow 4.3 kg
               - Load capacity: 155 kN at 450mm height */
            <group
              position={[0, 0, 0]}
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick("Base jack 38×600mm", [x, y, -base_jack_length / 2], `jack-${idx}`);
              }}
            >
              {/* Threaded shaft: Ø38mm × 600mm */}
              <mesh
                rotation={verticalRotation}
                position={[0, 0, -base_jack_length / 2]}
                material={materials.baseJack}
                castShadow
              >
                <cylinderGeometry args={[19, 19, base_jack_length, 20]} />
              </mesh>
              {/* Base plate: 150×150×6mm */}
              <mesh
                position={[0, 0, -base_jack_length + 3]}
                material={materials.baseJack}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[150, 150, 6]} />
              </mesh>
              {/* Adjusting nut (hex, Ø60mm × 20mm) */}
              <mesh
                rotation={verticalRotation}
                position={[0, 0, -20]}
                material={materials.spigot}
                castShadow
              >
                <cylinderGeometry args={[30, 30, 20, 6]} />
              </mesh>
            </group>
          ) : null}
        </group>
      ))}

      {/* ---- Reinforcing ledgers at basement level (clickable, different color) ---- */}
      {/* These are BASEMENT REINFORCING ledgers — different from regular lift ledgers.
          Uses a slightly different material color to distinguish them. */}
      {bayLayout.bayCenters.map((cx, i) =>
        Array.from({ length: bays_y + 1 }).map((_, j) => {
          const partId = `reinforce-x-${i}-${j}`;
          if (isRemoved(partId)) return null;
          const y = j * bay_length_y - towerY / 2;
          const len = bayLayout.bayLengths[i];
          return (
            <mesh
              key={partId}
              position={[cx, y, 100]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials.spigot}
              castShadow
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick(`Reinforcing ledger X (basement)`, [cx, y, 100], partId);
              }}
            >
              <cylinderGeometry args={[ledgerR, ledgerR, len, 16]} />
            </mesh>
          );
        })
      )}
      {bayLayout.standardXs.map((x, i) =>
        Array.from({ length: bays_y }).map((_, j) => {
          const partId = `reinforce-y-${i}-${j}`;
          if (isRemoved(partId)) return null;
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          const midY = (y1 + y2) / 2;
          return (
            <mesh
              key={partId}
              position={[x, midY, 100]}
              material={materials.spigot}
              castShadow
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick(`Reinforcing ledger Y (basement)`, [x, midY, 100], partId);
              }}
            >
              <cylinderGeometry args={[ledgerR, ledgerR, bay_length_y, 16]} />
            </mesh>
          );
        })
      )}

      {/* ---- Regular ledgers (horizontal tubes at lift levels, clickable) ---- */}
      {ledgers.map((l, idx) => {
        const partId = `ledger-${idx}`;
        if (isRemoved(partId)) return null;
        const rot: [number, number, number] =
          l.axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
        return (
          <mesh
            key={partId}
            rotation={rot}
            position={[l.x, l.y, l.z]}
            material={materials.ledger}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              if (onPartClick) onPartClick(`Ledger ${l.axis.toUpperCase()} L${Math.ceil(l.z / lift_height)}`, [l.x, l.y, l.z], partId);
            }}
          >
            <cylinderGeometry args={[ledgerR, ledgerR, l.len, 20]} />
          </mesh>
        );
      })}

      {/* ---- Diagonal braces (clickable) ---- */}
      {braces.map((b, idx) => {
        const partId = `brace-${idx}`;
        if (isRemoved(partId)) return null;
        const [x1, y1, z1] = b.from;
        const [x2, y2, z2] = b.to;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Midpoint
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const mz = (z1 + z2) / 2;

        // Compute rotation: cylinder default axis is +Y.
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
        const euler = new THREE.Euler().setFromQuaternion(quat);

        return (
          <mesh
            key={partId}
            rotation={[euler.x, euler.y, euler.z]}
            position={[mx, my, mz]}
            material={materials.brace}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              if (onPartClick) onPartClick(`Diagonal brace ${idx}`, [mx, my, mz], partId);
            }}
          >
            <cylinderGeometry args={[tubeR * 0.4, tubeR * 0.4, len, 8]} />
          </mesh>
        );
      })}

      {/* ---- Planks (top level) ---- */}
      {planks.map((p, idx) => (
        <mesh
          key={`plank-${idx}`}
          position={[p.x, p.y, p.z]}
          material={materials.plank}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[p.w, p.h, plank_thickness]} />
        </mesh>
      ))}

      {/* ---- Grating platforms per level ---- */}
      {/* PLANK ORIENTATION (matches reference BOM catalog codes):
          - Planks span along X (length = bay_length_x per section)
            → e.g., MDCSPH2570 for a 2570mm bay, MDCSPH2070 for 2070mm
          - Laid side by side along Y (width = plank_width, default 320mm)
          - planksPerBay = floor(bay_length_y / plank_width)
          - Plank dimensions: X = bay_length_x, Y = plank_width, Z = 8mm

          STAIRCASE OPENING (non-adjacent, no adjacent traps):
          - The staircase meets the platform at one Y face (+Y or -Y)
          - Remove 2 planks at the staircase's Y face
          - Primary: even lifts at +Y, odd at -Y (alternates)
          - Secondary: opposite of primary
          - The opening is at the Y face where the staircase top exits */}
      {include_gratings && rosetteZs.map((z, levelIdx) => {
        const levelNum = levelIdx + 1;
        if (disabled_platform_levels.includes(levelNum)) return null;
        return (
        <group key={`grating-${levelIdx}`}>
          {bayLayout.bayCenters.map((bayCx, i) => {
            const bayLenX = bayLayout.bayLengths[i];
            const bayStartX = bayLayout.standardXs[i];
            const pw = plank_width;
            const gap = 4;
            const gratingThk = 8;
            // Planks span along X (length = bay_length_x), laid side by side along Y
            const plankLenX = bayLenX * 0.96;
            const planksPerBay = Math.max(2, Math.floor((bay_length_y + gap) / (pw + gap)));
            const stepY = bay_length_y / planksPerBay;
            const bayStartY = -towerY / 2;

            // Determine which plank indices (Y positions) to skip for this bay+level.
            const skipIndices = new Set<number>();
            const isPrimaryBay = i === 0;
            const isSecondaryBay = i === bayLayout.bayCenters.length - 1;
            const primaryHasStaircase = isPrimaryBay && hasPrimaryStaircase;
            const secondaryHasStaircase = isSecondaryBay && secondary_access && !isPrimaryBay;

            if (primaryHasStaircase || secondaryHasStaircase) {
              // Staircase present: skip 2 planks at the staircase's Y face.
              // Primary: even lifts at +Y (last 2 planks), odd at -Y (first 2)
              // Secondary: opposite of primary
              const startOnPlusY = primaryHasStaircase;
              const opening = staircaseOpenings.computeForBayAndLift(i, levelIdx, startOnPlusY);
              if (opening) {
                // The opening is at the staircase's Y face.
                // onPlusY = true → opening at +Y end (last 2 planks)
                // onPlusY = false → opening at -Y end (first 2 planks)
                const count = 2;
                const startIdx = opening.onPlusY ? planksPerBay - count : 0;
                for (let k = 0; k < count; k++) skipIndices.add(startIdx + k);
              }
            } else if (isPrimaryBay && !hasPrimaryStaircase) {
              // No staircase, trapdoor only: skip 1 alternating
              const accessOpenIdx = levelIdx % 2 === 0 ? planksPerBay - 1 : 0;
              skipIndices.add(accessOpenIdx);
            }

            const planks: React.ReactNode[] = [];
            for (let p = 0; p < planksPerBay; p++) {
              if (skipIndices.has(p)) continue;
              const partId = `grating-L${levelIdx}-${i}-${p}`;
              if (isRemoved(partId)) continue;
              const plankY = bayStartY + (p + 0.5) * stepY;
              const gratingZ = z - gratingThk / 2 - 2;
              const plankX = bayStartX + bayLenX / 2;
              planks.push(
                <mesh
                  key={partId}
                  position={[plankX, plankY, gratingZ]}
                  material={materials.grating}
                  receiveShadow
                  castShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Grating L${levelIdx + 1} Bay ${i}`, [plankX, plankY, gratingZ], partId);
                  }}
                >
                  {/* Plank spans along X (length = bay_length_x), width along Y */}
                  <boxGeometry args={[plankLenX, pw, gratingThk]} />
                </mesh>
              );
            }
            return planks;
          })}
        </group>
        );
      })}

      {/* ---- Toeboards per level ---- */}
      {/* Toeboards are low vertical boards around the platform edge to prevent
          tools/materials from falling off. We render them as thin vertical
          boxes around the perimeter of each platform level.
          Note: the access side (+Y front) has no toeboard (for ladder access). */}
      {include_toeboards && rosetteZs.map((z, levelIdx) => {
        const toeboardH = 100; // 100mm high (industry standard)
        const toeboardThk = 10; // 10mm thick
        const gratingZ = z - 5 - 5; // align with grating level
        return (
          <group key={`toeboard-${levelIdx}`}>
            {/* South side (along Y-) — back */}
            <mesh
              position={[0, -towerY / 2 + toeboardThk / 2, gratingZ + toeboardH / 2]}
              material={materials.toeboard}
              castShadow
            >
              <boxGeometry args={[towerX, toeboardThk, toeboardH]} />
            </mesh>
            {/* East side (along X+) — right */}
            <mesh
              position={[towerX / 2 - toeboardThk / 2, 0, gratingZ + toeboardH / 2]}
              material={materials.toeboard}
              castShadow
            >
              <boxGeometry args={[toeboardThk, towerY, toeboardH]} />
            </mesh>
            {/* West side (along X-) — left */}
            <mesh
              position={[-towerX / 2 + toeboardThk / 2, 0, gratingZ + toeboardH / 2]}
              material={materials.toeboard}
              castShadow
            >
              <boxGeometry args={[toeboardThk, towerY, toeboardH]} />
            </mesh>
            {/* Note: North side (+Y front) has NO toeboard — open for access */}
          </group>
        );
      })}

      {/* ---- Handrails and middle rails on TOP level ---- */}
      {/* EN 12811: top guardrail at 1000mm, middle rail at 500mm above platform.
          Rails ATTACHED to the guardrail posts (which sit on the standards).
          Guardrail posts extend from top rosette upward 1000mm.
          Rails connect between posts on 3 sides — front (+Y) open for access.
          All coordinates in Z-up (tower's own coordinate system). */}
      {(() => {
        const topZ = towerHeight;
        const railH1 = topZ + 500; // middle rail
        const railH2 = topZ + 1000; // top guardrail
        const railR = tubeR * 0.8;

        // Rail length = distance between outermost posts on that side
        const railLenX = towerX; // along X = towerX
        const railLenY = towerY; // along Y = towerY

        return (
          <group>
            {/* Guardrail posts — vertical tubes from top platform to 1000mm above */}
            {standardPositions.map(([x, y], idx) => (
              <mesh
                key={`grpost-${idx}`}
                rotation={[Math.PI / 2, 0, 0]}
                position={[x, y, topZ + 500]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, 1000, 16]} />
                <meshStandardMaterial color="#8e9098" />
              </mesh>
            ))}

            {/* Back side (Y-) — 2 rails along X, at Y of back standards */}
            {[railH1, railH2].map((rz, ri) => (
              <mesh
                key={`rail-back-${ri}`}
                position={[0, -towerY / 2, rz]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenX, 16]} />
                <meshStandardMaterial color="#8e9098" />
              </mesh>
            ))}
            {/* Right side (X+) — 2 rails along Y, at X of right standards */}
            {[railH1, railH2].map((rz, ri) => (
              <mesh
                key={`rail-right-${ri}`}
                position={[towerX / 2, 0, rz]}
                rotation={[0, 0, 0]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenY, 16]} />
                <meshStandardMaterial color="#8e9098" />
              </mesh>
            ))}
            {/* Left side (X-) — 2 rails along Y, at X of left standards */}
            {[railH1, railH2].map((rz, ri) => (
              <mesh
                key={`rail-left-${ri}`}
                position={[-towerX / 2, 0, rz]}
                rotation={[0, 0, 0]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenY, 16]} />
                <meshStandardMaterial color="#8e9098" />
              </mesh>
            ))}

            {/* (trapdoor moved to top-level — see below) */}
          </group>
        );
      })()}

      {/* ---- Trapdoors (ladder traps) — one per lift per staircase ---- */}
      {/* Small hatch (~1/3 of grating) with hinge turned TOWARDS the scaffold
          frame (interior), not outside. The hinge is on the INNER Y edge
          (scaffold center side) so the trapdoor opens towards the staircase
          (outward) — the worker lifts the handle from inside the scaffold.
          Renders for BOTH primary (bay 0) and secondary (last bay) staircases. */}

      {/* Primary trapdoors (access #1) */}
      {hasPrimaryStaircase && rosetteZs.map((z, levelIdx) => {
        const opening = staircaseOpenings.computeForBayAndLift(0, levelIdx, true);
        if (!opening) return null;
        const bayLen = bayLayout.bayLengths[0];
        return renderTrapdoor(opening, bayLen, levelIdx, z, "primary");
      })}

      {/* Secondary trapdoors (access #2) */}
      {secondary_access && rosetteZs.map((z, levelIdx) => {
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        if (lastBayIdx === 0) return null; // same as primary, skip
        const opening = staircaseOpenings.computeForBayAndLift(lastBayIdx, levelIdx, false);
        if (!opening) return null;
        const bayLen = bayLayout.bayLengths[lastBayIdx];
        return renderTrapdoor(opening, bayLen, levelIdx, z, "secondary");
      })}

      {/* ---- Handrails + middle rails on staircase bays ---- */}
      {/* SAFETY: where there are stairs, both Y faces (+Y and -Y) of the
          staircase bay need handrails (top rail at 1000mm above platform)
          and middle rails (at 500mm above platform) for every lift level.
          The staircase alternates Y face per lift, so both faces need
          continuous rails for the full tower height.
          Rails run along X (the bay length), at the bay's Y boundary. */}
      {hasPrimaryStaircase && (() => {
        const railR = tubeR * 0.7;
        const railLenX = bayLayout.bayLengths[0]; // primary staircase bay length
        const bayStartX = bayLayout.standardXs[0];
        const railCenterX = bayStartX + railLenX / 2;
        const rails: React.ReactNode[] = [];
        for (let liftIdx = 0; liftIdx < num_lifts; liftIdx++) {
          const platformZ = (liftIdx + 1) * lift_height;
          const middleRailZ = platformZ + 500;
          const topRailZ = platformZ + 1000;
          for (const yFace of [towerY / 2, -towerY / 2]) {
            // Middle rail
            rails.push(
              <mesh
                key={`handrail-primary-L${liftIdx}-mid-${yFace > 0 ? "pY" : "mY"}`}
                position={[railCenterX, yFace, middleRailZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenX, 16]} />
              </mesh>
            );
            // Top handrail
            rails.push(
              <mesh
                key={`handrail-primary-L${liftIdx}-top-${yFace > 0 ? "pY" : "mY"}`}
                position={[railCenterX, yFace, topRailZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenX, 16]} />
              </mesh>
            );
          }
        }
        return <group>{rails}</group>;
      })()}
      {secondary_access && (() => {
        const railR = tubeR * 0.7;
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        const railLenX = bayLayout.bayLengths[lastBayIdx];
        const bayStartX = bayLayout.standardXs[lastBayIdx];
        const railCenterX = bayStartX + railLenX / 2;
        const rails: React.ReactNode[] = [];
        for (let liftIdx = 0; liftIdx < num_lifts; liftIdx++) {
          const platformZ = (liftIdx + 1) * lift_height;
          const middleRailZ = platformZ + 500;
          const topRailZ = platformZ + 1000;
          for (const yFace of [towerY / 2, -towerY / 2]) {
            rails.push(
              <mesh
                key={`handrail-secondary-L${liftIdx}-mid-${yFace > 0 ? "pY" : "mY"}`}
                position={[railCenterX, yFace, middleRailZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenX, 16]} />
              </mesh>
            );
            rails.push(
              <mesh
                key={`handrail-secondary-L${liftIdx}-top-${yFace > 0 ? "pY" : "mY"}`}
                position={[railCenterX, yFace, topRailZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, railLenX, 16]} />
              </mesh>
            );
          }
        }
        return <group>{rails}</group>;
      })()}

      {/* ---- Landing pads (3 planks) at the bottom of each primary staircase ---- */}
      {/* SAFETY: each staircase bottom needs a 3-plank-wide solid standing area
          for safe access. These are rendered at the platform level below each
          staircase entrance (or at ground level for lift 0).
          The landing spans 3 plank widths along X, centered on xBottom,
          and spans the full bay width along Y. Aligned within the scaffold
          frame (bay center Y = 0), same gray material as regular gratings. */}
      {hasPrimaryStaircase && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const opening = staircaseOpenings.computeForBayAndLift(0, liftIdx, true);
        if (!opening) return null;
        const { xBottom, yFace } = opening;
        const pw = plank_width;
        const gap = 4;
        const landingThk = 8;
        const landingZ = liftIdx === 0
          ? landingThk / 2 + 2  // just above ground
          : liftIdx * lift_height - landingThk / 2 - 2;  // just below platform surface
        // Landing planks span along X (same as regular gratings), 3 planks
        // laid side by side along Y, centered on the staircase bottom entrance.
        const bayLen0 = bayLayout.bayLengths[0];
        const plankLenX = bayLen0 * 0.96;
        const landingX = bayLayout.standardXs[0] + bayLen0 / 2;
        return (
          <group key={`landing-primary-L${liftIdx}`}>
            {Array.from({ length: 3 }).map((_, pi) => {
              // 3 planks centered on yFace (staircase entrance position in Y)
              const plankY = yFace + (pi - 1) * (pw + gap);
              return (
                <mesh
                  key={`landing-primary-L${liftIdx}-${pi}`}
                  position={[landingX, plankY, landingZ]}
                  material={materials.grating}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Landing pad L${liftIdx + 1} plank ${pi + 1}`, [landingX, plankY, landingZ], `landing-primary-L${liftIdx}-${pi}`);
                  }}
                >
                  {/* Plank spans along X (length = bay_length_x), width along Y */}
                  <boxGeometry args={[plankLenX, pw, landingThk]} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* ---- Landing pads (3 planks) at the bottom of each secondary staircase ---- */}
      {secondary_access && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        const opening = staircaseOpenings.computeForBayAndLift(lastBayIdx, liftIdx, false);
        if (!opening) return null;
        const { yFace } = opening;
        const pw = plank_width;
        const gap = 4;
        const landingThk = 8;
        const landingZ = liftIdx === 0
          ? landingThk / 2 + 2
          : liftIdx * lift_height - landingThk / 2 - 2;
        const bayLenLast = bayLayout.bayLengths[lastBayIdx];
        const plankLenX = bayLenLast * 0.96;
        const landingX = bayLayout.standardXs[lastBayIdx] + bayLenLast / 2;
        return (
          <group key={`landing-secondary-L${liftIdx}`}>
            {Array.from({ length: 3 }).map((_, pi) => {
              const plankY = yFace + (pi - 1) * (pw + gap);
              return (
                <mesh
                  key={`landing-secondary-L${liftIdx}-${pi}`}
                  position={[landingX, plankY, landingZ]}
                  material={materials.grating}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Secondary landing pad L${liftIdx + 1} plank ${pi + 1}`, [landingX, plankY, landingZ], `landing-secondary-L${liftIdx}-${pi}`);
                  }}
                >
                  <boxGeometry args={[plankLenX, pw, landingThk]} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* ---- Primary staircase sections (yellow, access bay 0) ---- */}
      {/* NON-ADJACENT ANGULAR STAIRCASES (no adjacent ladder traps):
          One inclined staircase per lift level. The staircase DIRECTION
          alternates per lift:
            even lifts: -X → +X on +Y face (opening at +X end)
            odd  lifts: +X → -X on -Y face (opening at -X end)
          This means the exit of one staircase = the entrance of the next,
          and the platform opening alternates +X/-X per lift → no two
          adjacent levels have openings in the same position.
          Each section: 2 stringers + 5 steps + 1 guard rail
          (MDCRSC2134 + MDCGRFS2134 + MDCSFS0860). */}
      {hasPrimaryStaircase && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        return renderStaircaseSection(
          0, // bay 0 (access bay)
          liftIdx,
          materials.ladder,
          "Primary staircase",
          "staircase-primary",
          true, // start on +Y
        );
      })}

      {/* ---- Secondary staircase sections (orange, escape, last bay) ---- */}
      {/* Same non-adjacent angular pattern, but starts on -Y (opposite face from primary).
          The direction alternation is the same (even lifts: -X→+X, odd: +X→-X), so
          the secondary staircase also has no adjacent ladder traps. */}
      {secondary_access && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        return renderStaircaseSection(
          lastBayIdx, // last bay
          liftIdx,
          materials.ladderSecondary,
          "Secondary staircase (escape)",
          "staircase-secondary",
          false, // start on -Y (opposite of primary)
        );
      })}
    </group>
  );
}
