"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { TowerConfig } from "@/lib/part-types";
import { computeSectionLayout, computePathLayout, computeCircularLayout } from "@/lib/tower-assembler";

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
    suspended_beam_length = 4000,
    include_gratings = true,
    include_toeboards = true,
    disabled_platform_levels = [],
    include_ladder = false,
    staircase_type = "ladder",
    secondary_staircase_type = "ladder",
    staircase_tower = false,
    door_opening,
    plank_width = 320,
    secondary_access = false,
    sections,
    scaffold_path,
    circular_layout,
    include_fillers = false,
  } = config as TowerConfig & {
    base_type?: "jack" | "wheel" | "suspended";
    suspended_beam_length?: number;
    include_gratings?: boolean;
    include_toeboards?: boolean;
    disabled_platform_levels?: number[];
    include_ladder?: boolean;
    staircase_type?: "ladder" | "stairs";
    secondary_staircase_type?: "ladder" | "stairs";
    staircase_tower?: boolean;
    door_opening?: { bay_index: number; width: number; height: number };
    plank_width?: 320 | 230;
    secondary_access?: boolean;
    sections?: Array<{ bays: number; bay_length: number; label?: string }>;
    scaffold_path?: Array<{ bays: number; bay_length: number; turn_angle: number; label?: string }>;
    circular_layout?: {
      diameter_mm: number;
      num_segments: number;
      bay_width_mm: number;
      label?: string;
    };
    include_fillers?: boolean;
  };

  // When secondary access is enabled (auto at ≥20m height/length), the primary
  // staircase must ALSO be present — it's the main access, secondary is the escape.
  // This ensures both staircases render when secondary_access auto-triggers,
  // even if the user didn't manually enable "Ladder (access side)".
  const hasPrimaryStaircase = include_ladder || secondary_access || staircase_tower;

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
      reinforcedLedger: new THREE.MeshStandardMaterial({
        color: "#cc4422",
        roughness: 0.4,
        metalness: 0.6,
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
      bayIdx: number; // which bay this ledger belongs to (for reinforced check)
    }[] = [];
    for (let k = 0; k < num_lifts; k++) {
      const z = (k + 1) * lift_height;
      // Ledgers along X (per bay, length = bayLayout.bayLengths[i])
      for (let i = 0; i < bayLayout.bayCenters.length; i++) {
        for (let j = 0; j <= bays_y; j++) {
          const x = bayLayout.bayCenters[i];
          const y = j * bay_length_y - towerY / 2;
          items.push({ x, y, z, len: bayLayout.bayLengths[i], axis: "x", bayIdx: i });
        }
      }
      // Ledgers along Y (per standard X position, length = bay_length_y)
      for (let i = 0; i < bayLayout.standardXs.length; i++) {
        for (let j = 0; j < bays_y; j++) {
          const x = bayLayout.standardXs[i];
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          // Y-ledgers belong to the bay to their left (bay i-1) or bay i
          const bayIdx = Math.min(i, bayLayout.bayCenters.length - 1);
          items.push({ x, y: (y1 + y2) / 2, z, len: bay_length_y, axis: "y", bayIdx });
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
      // Opening direction alternates per lift.
      // For access towers: even=+X, odd=-X (simple alternation per lift)
      // For staircase towers: direction flips every 2 lifts (round) so that
      // when returning to the same bay (lift 2 in bay 0), the direction is
      // OPPOSITE from lift 0 — no stairs directly above each other.
      // floor(liftIdx / numBays) % 2 gives the "round" number, which flips
      // direction each time we cycle through all bays.
      const numBays = bayLayout.bayCenters.length;
      const round = Math.floor(liftIdx / Math.max(1, numBays));
      const openingAtPlusX = round % 2 === 0 ? (liftIdx % 2 === 0) : (liftIdx % 2 === 1);
      const count = 2;
      const startIdx = openingAtPlusX ? planksPerBay - count : 0;
      // Staircase TOP (exit) at opening end — full bay span (for stairs)
      const xTop = openingAtPlusX ? bayEndX : bayStartX;
      // Staircase BOTTOM (entrance) at the opposite end — full bay span (for stairs)
      const xBottom = openingAtPlusX ? bayStartX : bayEndX;
      // LADDER positions (15° from vertical): only 536mm run, not full bay
      // Used by renderStaircaseSection (ladder). renderStairs uses xBottom/xTop (full bay).
      const xTopLadder = xTop;
      const xBottomLadder = openingAtPlusX ? bayEndX - staircaseRun : bayStartX + staircaseRun;
      // Y face alternates per lift (non-adjacent), offset by startOnPlusY.
      // The yFace is the CENTERLINE of the staircase. The two stringers are
      // at yFace ± railOffset (±200mm). To keep ALL ladder parts INSIDE the
      // scaffold frame (stringers AND guard rail), yFace must be far enough
      // from the outer standard. The guard rail extends 100mm beyond the
      // outer stringer, so total ladder width = 2*railOffset + 100 = 500mm.
      // Using yMargin=120 from the outer standard:
      //   yFace = towerY/2 - 200 - 120 = towerY/2 - 320
      //   outer stringer = towerY/2 - 120 ✓ (inside frame)
      //   guard rail = towerY/2 - 20    ✓ (inside frame, 20mm from standard)
      // Primary (true):   even=+Y face, odd=-Y face
      // Secondary (false): even=-Y face, odd=+Y face
      const onPlusY = startOnPlusY ? (liftIdx % 2 === 0) : (liftIdx % 2 === 1);
      const yMargin = 120; // distance from outer stringer to the standard (was 80 — caused guard rail to poke outside)
      const yFace = onPlusY ? (towerY / 2 - railOffset - yMargin) : -(towerY / 2 - railOffset - yMargin);
      // Trapdoor position (at the top of the staircase = the opening)
      const trapdoorX = bayStartX + (startIdx + count / 2) * stepX;
      const trapdoorWidth = count * stepX * 0.92;
      return {
        skipIndices: Array.from({ length: count }, (_, k) => startIdx + k),
        xBottom, xTop, yFace, onPlusY,
        xBottomLadder, xTopLadder,
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

    // Use the LADDER positions (15° from vertical, 536mm run — not full bay)
    const { yFace, onPlusY, xBottomLadder, xTopLadder } = opening;
    const xBottom = xBottomLadder;
    const xTop = xTopLadder;

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

  // ─── Stairs renderer (real staircase with flat horizontal treads) ────
  // Unlike the ladder (renderStaircaseSection) which has inclined steps
  // following the stringer angle at 15° from vertical, this renders proper
  // STAIRS with a shallow angle (~35° from horizontal) and:
  // - 2 inclined stringers (at ~35° from horizontal)
  // - Flat HORIZONTAL treads (level, not following stringer angle)
  // - Each tread is a flat plank you step on (like real stairs)
  // - Guard rail on the outer side
  // The staircase spans the full bay length, not just 536mm.
  const renderStairs = (
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
    const guardRailOffset = 100;
    const zBottom = liftIdx * lift_height;
    const zTop = (liftIdx + 1) * lift_height;
    const { yFace, onPlusY, xBottom, xTop } = opening;
    const dx = xTop - xBottom;
    const dz = zTop - zBottom;
    const len = Math.sqrt(dx * dx + dz * dz);
    // Stringer rotation (along the inclined direction)
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
    const euler = new THREE.Euler().setFromQuaternion(quat);
    const midX = (xBottom + xTop) / 2;
    const midZ = (zBottom + zTop) / 2;
    // Tread dimensions: flat horizontal planks spanning between stringers
    const treadWidth = railOffset * 2 + 40; // 440mm wide (Y)
    const treadDepth = 200; // 200mm deep (along the slope direction)
    const treadThk = 30; // 30mm thick
    const stepCount = 7; // 7 treads per lift (more comfortable than 5)
    return (
      <group
        key={`${partIdPrefix}-L${liftIdx}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onPartClick) onPartClick(`${partName} (lift ${liftIdx + 1})`, [midX, yFace, midZ], `${partIdPrefix}-L${liftIdx}`);
        }}
      >
        {/* Left stringer (inclined along the staircase direction) */}
        <mesh rotation={[euler.x, euler.y, euler.z]} position={[midX, yFace - railOffset, midZ]} material={material} castShadow>
          <cylinderGeometry args={[15, 15, len, 16]} />
        </mesh>
        {/* Right stringer */}
        <mesh rotation={[euler.x, euler.y, euler.z]} position={[midX, yFace + railOffset, midZ]} material={material} castShadow>
          <cylinderGeometry args={[15, 15, len, 16]} />
        </mesh>
        {/* Flat HORIZONTAL treads — level regardless of stringer angle */}
        {Array.from({ length: stepCount }).map((_, si) => {
          const t = (si + 1) / (stepCount + 1); // 0.125, 0.25, ... 0.875
          const treadX = xBottom + dx * t;
          const treadZ = zBottom + dz * t;
          return (
            <mesh
              key={`${partIdPrefix}-tread-L${liftIdx}-${si}`}
              position={[treadX, yFace, treadZ]}
              material={material}
              castShadow
            >
              {/* Flat horizontal tread: wide in Y, deep in X, thin in Z
                  NO rotation — treads stay horizontal */}
              <boxGeometry args={[treadDepth, treadWidth, treadThk]} />
            </mesh>
          );
        })}
        {/* Handrails on BOTH sides (inner + outer) */}
        {/* Outer handrail */}
        <mesh
          rotation={[euler.x, euler.y, euler.z]}
          position={[midX, onPlusY ? yFace + railOffset + guardRailOffset : yFace - railOffset - guardRailOffset, midZ]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[12, 12, len, 16]} />
        </mesh>
        {/* Inner handrail */}
        <mesh
          rotation={[euler.x, euler.y, euler.z]}
          position={[midX, onPlusY ? yFace - railOffset - guardRailOffset : yFace + railOffset + guardRailOffset, midZ]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[12, 12, len, 16]} />
        </mesh>
        {/* Vertical posts on BOTH sides (at each tread) */}
        {Array.from({ length: stepCount }).map((_, si) => {
          const t = (si + 1) / (stepCount + 1);
          const postX = xBottom + dx * t;
          const postZ = zBottom + dz * t;
          const postHeight = guardRailOffset + 200;
          return (
            <group key={`${partIdPrefix}-posts-L${liftIdx}-${si}`}>
              {/* Outer post */}
              <mesh
                position={[postX, onPlusY ? yFace + railOffset + postHeight / 2 : yFace - railOffset - postHeight / 2, postZ]}
                material={material}
                castShadow
              >
                <cylinderGeometry args={[8, 8, postHeight, 8]} />
              </mesh>
              {/* Inner post */}
              <mesh
                position={[postX, onPlusY ? yFace - railOffset - postHeight / 2 : yFace + railOffset + postHeight / 2, postZ]}
                material={material}
                castShadow
              >
                <cylinderGeometry args={[8, 8, postHeight, 8]} />
              </mesh>
            </group>
          );
        })}
      </group>
    );
  };
  // Renders a hatch covering 2 grating frames, positioned WITHIN the scaffold
  // frame. The trapdoor:
  // - X: ~1/3 of bay length (the staircase opening area)
  // - Y: 2 × plank_width (covers 2 grating frames)
  // - Hinge on the INNER Y edge (towards scaffold center)
  // - Positioned so the OUTER Y edge aligns with the outer standard (within frame)
  const renderTrapdoor = (
    opening: { xTop: number; xBottom: number; yFace: number; onPlusY: boolean },
    bayLen: number,
    levelIdx: number,
    z: number,
    type: "primary" | "secondary",
  ) => {
    const pw = plank_width;
    const gap = 4;
    const trapThk = 80;
    const trapLenX = bayLen / 3;
    // Trapdoor X: extends INWARD from the staircase exit.
    // When exit is at +X end (xTop > xBottom): trapX = xTop - trapLenX/2 (extends toward -X, inward)
    // When exit is at -X end (xTop < xBottom): trapX = xTop + trapLenX/2 (extends toward +X, inward)
    const atPlusX = opening.xTop > opening.xBottom;
    const trapX = atPlusX ? opening.xTop - trapLenX / 2 : opening.xTop + trapLenX / 2;
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
        {/* Main trapdoor panel — brown, opaque, uses shared plank material */}
        <mesh
          position={[trapX, trapY, trapZ]}
          castShadow
          receiveShadow
          material={materials.plank}
          onClick={(e) => {
            e.stopPropagation();
            if (onPartClick) onPartClick(`${label} L${levelIdx + 1}`, [trapX, trapY, trapZ], `trapdoor-${type}-L${levelIdx}`);
          }}
        >
          <boxGeometry args={[trapLenX, trapWidthY, trapThk]} />
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

  // ─── Angle scaffold path rendering ────────────────────────────────────
  // When scaffold_path is set, render standards + ledgers at 2D positions
  // following the path (L-shape, U-shape, etc.). Each segment has TWO rows
  // of standards (front + back) connected by ledgers + cross-ledgers, with
  // diagonal braces at every 3rd bay + extremities, gratings on each lift,
  // toeboards at platform level, and guardrails on top.
  const pathLayout = useMemo(() => {
    if (!scaffold_path || scaffold_path.length === 0) return null;
    // Use the actual scaffold width (bay_length_y) so the path matches the
    // linear scaffold's depth.
    return computePathLayout(scaffold_path, bay_length_y);
  }, [scaffold_path, bay_length_y]);

  const renderAngleScaffold = () => {
    if (!pathLayout) return null;
    const railR = tubeR * 0.8;
    const braceR = tubeR * 0.6;

    // Helper: for each segment, return the standards grid as
    // frontRow[0..numBays] and backRow[0..numBays] (each entry [x,y]).
    const getSegRows = (segIdx: number) => {
      const segInfo = pathLayout!.segmentStandards[segIdx];
      const numBays = segInfo.numBays;
      const front = segInfo.positions.slice(0, numBays + 1);
      const back = segInfo.positions.slice(numBays + 1);
      return { front, back, numBays };
    };

    return (
      <group>
        {/* ─── Standards (vertical tubes + rosettes + base) ─── */}
        {/* Deduplicate positions: at corners, the front row of segment N
            may overlap with the back row of segment N+1. Use a Set keyed
            by rounded x,y to avoid rendering identical meshes twice. */}
        {(() => {
          const seen = new Set<string>();
          const uniquePositions: [number, number][] = [];
          for (const [x, y] of pathLayout.standardPositions) {
            const key = `${Math.round(x)}_${Math.round(y)}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniquePositions.push([x, y]);
            }
          }
          return uniquePositions.map(([x, y], idx) => (
            <group key={`path-std-${idx}`} position={[x, y, 0]}>
              {/* Vertical standard tube */}
              <mesh
                rotation={verticalRotation}
                position={[0, 0, towerHeight / 2]}
                material={materials.standard}
                castShadow
                receiveShadow
              >
                <cylinderGeometry args={[tubeR, tubeR, towerHeight, 24]} />
              </mesh>
              {/* Inner bore */}
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
                  key={`path-ros-${idx}-${ri}`}
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
              {/* Base (jack or wheel or suspended) */}
              {base_type === "wheel" ? (
                <group position={[0, 0, -180]}>
                  <mesh material={materials.wheel} castShadow>
                    <cylinderGeometry args={[100, 100, 48, 32]} />
                  </mesh>
                </group>
              ) : base_type === "suspended" ? (
                <mesh rotation={verticalRotation} position={[0, 0, towerHeight + 40]} material={materials.spigot} castShadow>
                  <cylinderGeometry args={[20, 20, 80, 16]} />
                </mesh>
              ) : (
                <group position={[0, 0, 0]}>
                  <mesh rotation={verticalRotation} position={[0, 0, -base_jack_length / 2]} material={materials.baseJack} castShadow>
                    <cylinderGeometry args={[19, 19, base_jack_length, 20]} />
                  </mesh>
                  <mesh position={[0, 0, -base_jack_length + 3]} material={materials.baseJack} castShadow receiveShadow>
                    <boxGeometry args={[150, 150, 6]} />
                  </mesh>
                </group>
              )}
              {/* Guardrail post (top of standard → 1000mm above top platform) */}
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                position={[0, 0, towerHeight + 500]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[railR, railR, 1000, 16]} />
              </mesh>
            </group>
          ));
        })()}

        {/* ─── Ledgers (front face + back face + cross-ledgers) ─── */}
        {/* For each segment, for each lift level:
              - Front-face ledgers: connect front[i]→front[i+1] (length = bayLength)
              - Back-face ledgers: connect back[i]→back[i+1] (length = bayLength)
              - Cross-ledgers: connect front[i]→back[i] at each bay boundary (length = bay_length_y) */}
        {pathLayout.segments.map((seg, segIdx) => {
          const { front, back, numBays } = getSegRows(segIdx);
          const segAngle = Math.atan2(seg.dirY, seg.dirX);
          // Cross-ledger rotation: perpendicular to segment, so same as front-face ledger
          const crossAngle = segAngle + Math.PI / 2;
          const isReinforced = seg.label === "REINFORCED";
          return (
            <group key={`path-ledgers-${segIdx}`}>
              {/* Front-face ledgers (one per bay per lift) */}
              {rosetteZs.map((z, liftIdx) =>
                Array.from({ length: numBays }).map((_, bayIdx) => {
                  const [x1, y1] = front[bayIdx];
                  const [x2, y2] = front[bayIdx + 1];
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  return (
                    <mesh
                      key={`path-led-front-${segIdx}-${liftIdx}-${bayIdx}`}
                      rotation={[0, 0, segAngle + Math.PI / 2]}
                      position={[mx, my, z]}
                      material={isReinforced ? materials.reinforcedLedger : materials.ledger}
                      castShadow
                    >
                      <cylinderGeometry args={[ledgerR, ledgerR, seg.bayLength, 20]} />
                    </mesh>
                  );
                })
              )}
              {/* Back-face ledgers */}
              {rosetteZs.map((z, liftIdx) =>
                Array.from({ length: numBays }).map((_, bayIdx) => {
                  const [x1, y1] = back[bayIdx];
                  const [x2, y2] = back[bayIdx + 1];
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  return (
                    <mesh
                      key={`path-led-back-${segIdx}-${liftIdx}-${bayIdx}`}
                      rotation={[0, 0, segAngle + Math.PI / 2]}
                      position={[mx, my, z]}
                      material={isReinforced ? materials.reinforcedLedger : materials.ledger}
                      castShadow
                    >
                      <cylinderGeometry args={[ledgerR, ledgerR, seg.bayLength, 20]} />
                    </mesh>
                  );
                })
              )}
              {/* Cross-ledgers (front↔back, at each bay boundary, length = bay_length_y) */}
              {rosetteZs.map((z, liftIdx) =>
                Array.from({ length: numBays + 1 }).map((_, boundaryIdx) => {
                  const [fx, fy] = front[boundaryIdx];
                  const [bx, by] = back[boundaryIdx];
                  const mx = (fx + bx) / 2;
                  const my = (fy + by) / 2;
                  return (
                    <mesh
                      key={`path-led-cross-${segIdx}-${liftIdx}-${boundaryIdx}`}
                      rotation={[0, 0, segAngle]}
                      position={[mx, my, z]}
                      material={isReinforced ? materials.reinforcedLedger : materials.ledger}
                      castShadow
                    >
                      <cylinderGeometry args={[ledgerR, ledgerR, bay_length_y, 20]} />
                    </mesh>
                  );
                })
              )}
            </group>
          );
        })}

        {/* ─── Diagonal braces (perimeter of each segment) ─── */}
        {/* Rule: "Diagonals are needed at every 3rd bay and at two extremities."
            For each segment, brace bay 0, every 3rd bay, and the last bay.
            Braces on BOTH the front face and back face of the segment,
            with opposite directions (so adjacent segments don't form X-patterns).
            Braces also wrap the two segment ends (cross-face, length = bay_length_y). */}
        {include_braces && pathLayout.segments.map((seg, segIdx) => {
          const { front, back, numBays } = getSegRows(segIdx);
          const lastBayIdx = numBays - 1;
          const shouldBraceBay = (bi: number) =>
            bi === 0 || bi % 3 === 0 || bi === lastBayIdx;
          const items: { from: [number, number, number]; to: [number, number, number] }[] = [];
          for (let k = 0; k < num_lifts; k++) {
            const z1 = k * lift_height;
            const z2 = (k + 1) * lift_height;
            // Front face braces
            for (let bi = 0; bi < numBays; bi++) {
              if (!shouldBraceBay(bi)) continue;
              const [x1, y1] = front[bi];
              const [x2, y2] = front[bi + 1];
              const dir = bi % 2 === 0 ? 1 : -1;
              if (dir > 0) items.push({ from: [x1, y1, z1], to: [x2, y2, z2] });
              else items.push({ from: [x1, y1, z2], to: [x2, y2, z1] });
            }
            // Back face braces (opposite direction so they form parallel, not X)
            for (let bi = 0; bi < numBays; bi++) {
              if (!shouldBraceBay(bi)) continue;
              const [x1, y1] = back[bi];
              const [x2, y2] = back[bi + 1];
              const dir = bi % 2 === 0 ? -1 : 1;
              if (dir > 0) items.push({ from: [x1, y1, z1], to: [x2, y2, z2] });
              else items.push({ from: [x1, y1, z2], to: [x2, y2, z1] });
            }
            // Segment-end cross-face braces (at segment start AND end — the
            // "two extremities" of each segment). These are short braces that
            // cross the segment width (front↔back, length = bay_length_y).
            for (const endIdx of [0, numBays] as number[]) {
              const [fx, fy] = front[endIdx];
              const [bx, by] = back[endIdx];
              const dir = endIdx === 0 ? 1 : -1;
              if (dir > 0) items.push({ from: [fx, fy, z1], to: [bx, by, z2] });
              else items.push({ from: [fx, fy, z2], to: [bx, by, z1] });
            }
          }
          return items.map((b, idx) => {
            const [fx, fy, fz] = b.from;
            const [tx, ty, tz] = b.to;
            const dx = tx - fx, dy = ty - fy, dz = tz - fz;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const mx = (fx + tx) / 2, my = (fy + ty) / 2, mz = (fz + tz) / 2;
            // Build a quaternion that rotates the default Y-axis cylinder to (dx,dy,dz)
            const dir = new THREE.Vector3(dx, dy, dz).normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dir
            );
            return (
              <mesh
                key={`path-brace-${segIdx}-${idx}`}
                position={[mx, my, mz]}
                quaternion={quat}
                material={materials.brace}
                castShadow
              >
                <cylinderGeometry args={[braceR, braceR, len, 12]} />
              </mesh>
            );
          });
        })}

        {/* ─── Gratings (platforms) on each segment, each lift level ─── */}
        {include_gratings && pathLayout.segments.map((seg, segIdx) => {
          const segAngle = Math.atan2(seg.dirY, seg.dirX);
          return rosetteZs.map((z, liftIdx) => {
            if (disabled_platform_levels.includes(liftIdx + 1)) return null;
            return Array.from({ length: seg.numBays }).map((_, bayIdx) => {
              const t = (bayIdx + 0.5) / seg.numBays;
              const mx = seg.startX + (seg.endX - seg.startX) * t;
              const my = seg.startY + (seg.endY - seg.startY) * t;
              return (
                <mesh
                  key={`path-grating-${segIdx}-${liftIdx}-${bayIdx}`}
                  position={[mx, my, z - 6]}
                  rotation={[0, 0, segAngle]}
                  material={materials.grating}
                  receiveShadow
                  castShadow
                >
                  <boxGeometry args={[seg.bayLength * 0.94, bay_length_y * 0.94, 8]} />
                </mesh>
              );
            });
          });
        })}

        {/* ─── Toeboards around each platform level ─── */}
        {/* For each segment, for each platform level, render toeboards on the
            FRONT face (perpendicular = +perp side) and BACK face (-perp side).
            End-of-segment toeboards are skipped (gap for adjacent segment). */}
        {include_toeboards && pathLayout.segments.map((seg, segIdx) => {
          const segAngle = Math.atan2(seg.dirY, seg.dirX);
          const toeboardH = 100;
          const toeboardThk = 10;
          return rosetteZs.map((z, levelIdx) => {
            const gratingZ = z - 5 - 5;
            const tz = gratingZ + toeboardH / 2;
            const halfWidth = bay_length_y / 2;
            // For each bay: front toeboard (at +halfWidth perp) and back toeboard (at -halfWidth perp)
            const boards: React.ReactNode[] = [];
            for (let bi = 0; bi < seg.numBays; bi++) {
              const t = (bi + 0.5) / seg.numBays;
              const mx = seg.startX + (seg.endX - seg.startX) * t;
              const my = seg.startY + (seg.endY - seg.startY) * t;
              // Front toeboard: at +halfWidth perpendicular offset, rotated to match segment
              boards.push(
                <mesh
                  key={`path-tb-front-${segIdx}-${levelIdx}-${bi}`}
                  position={[
                    mx + seg.perpX * halfWidth,
                    my + seg.perpY * halfWidth,
                    tz,
                  ]}
                  rotation={[0, 0, segAngle]}
                  material={materials.toeboard}
                  castShadow
                >
                  <boxGeometry args={[seg.bayLength * 0.94, toeboardThk, toeboardH]} />
                </mesh>
              );
              // Back toeboard: at -halfWidth perpendicular offset
              boards.push(
                <mesh
                  key={`path-tb-back-${segIdx}-${levelIdx}-${bi}`}
                  position={[
                    mx - seg.perpX * halfWidth,
                    my - seg.perpY * halfWidth,
                    tz,
                  ]}
                  rotation={[0, 0, segAngle]}
                  material={materials.toeboard}
                  castShadow
                >
                  <boxGeometry args={[seg.bayLength * 0.94, toeboardThk, toeboardH]} />
                </mesh>
              );
            }
            return <group key={`path-tb-${segIdx}-${levelIdx}`}>{boards}</group>;
          });
        })}

        {/* ─── Filler planks (gap fillers between gratings and ledgers) ─── */}
        {/* Thin steel planks at the edges of each grating platform, on both
            the front and back faces of each segment. */}
        {include_fillers && pathLayout.segments.map((seg, segIdx) => {
          const segAngle = Math.atan2(seg.dirY, seg.dirX);
          const fillerThk = 8;
          const fillerWidth = 100;
          const halfWidth = bay_length_y / 2;
          return rosetteZs.map((z, liftIdx) => {
            if (disabled_platform_levels.includes(liftIdx + 1)) return null;
            const fillerZ = z - 6 + fillerThk / 2;
            const fillers: React.ReactNode[] = [];
            for (let bi = 0; bi < seg.numBays; bi++) {
              const t = (bi + 0.5) / seg.numBays;
              const mx = seg.startX + (seg.endX - seg.startX) * t;
              const my = seg.startY + (seg.endY - seg.startY) * t;
              // Front filler (at +halfWidth perp offset)
              fillers.push(
                <mesh
                  key={`path-filler-front-${segIdx}-${liftIdx}-${bi}`}
                  position={[
                    mx + seg.perpX * (halfWidth - 30),
                    my + seg.perpY * (halfWidth - 30),
                    fillerZ,
                  ]}
                  rotation={[0, 0, segAngle]}
                  material={materials.standard}
                  castShadow
                >
                  <boxGeometry args={[fillerWidth, seg.bayLength * 0.94, fillerThk]} />
                </mesh>
              );
              // Back filler (at -halfWidth perp offset)
              fillers.push(
                <mesh
                  key={`path-filler-back-${segIdx}-${liftIdx}-${bi}`}
                  position={[
                    mx - seg.perpX * (halfWidth - 30),
                    my - seg.perpY * (halfWidth - 30),
                    fillerZ,
                  ]}
                  rotation={[0, 0, segAngle]}
                  material={materials.standard}
                  castShadow
                >
                  <boxGeometry args={[fillerWidth, seg.bayLength * 0.94, fillerThk]} />
                </mesh>
              );
            }
            return <group key={`path-fillers-${segIdx}-${liftIdx}`}>{fillers}</group>;
          });
        })}

        {/* ─── Handrails (top level only) ─── */}
        {/* For each segment, render:
              - Top rail + middle rail on FRONT face (full segment length)
              - Top rail + middle rail on BACK face (full segment length)
              - Top rail + middle rail on each segment END (cross-face, length = bay_length_y)
            Rails run at z = topZ+500 (middle) and z = topZ+1000 (top). */}
        {(() => {
          const topZ = towerHeight;
          const railH1 = topZ + 500;
          const railH2 = topZ + 1000;
          const halfWidth = bay_length_y / 2;
          const rails: React.ReactNode[] = [];
          pathLayout.segments.forEach((seg, segIdx) => {
            const segAngle = Math.atan2(seg.dirY, seg.dirX);
            // Midpoint of segment (for full-length rail)
            const midX = (seg.startX + seg.endX) / 2;
            const midY = (seg.startY + seg.endY) / 2;
            // Front-face rails (at +halfWidth perp offset)
            [railH1, railH2].forEach((rz, ri) => {
              rails.push(
                <mesh
                  key={`path-rail-front-${segIdx}-${ri}`}
                  position={[
                    midX + seg.perpX * halfWidth,
                    midY + seg.perpY * halfWidth,
                    rz,
                  ]}
                  rotation={[0, 0, segAngle + Math.PI / 2]}
                  material={materials.standard}
                  castShadow
                >
                  <cylinderGeometry args={[railR, railR, seg.numBays * seg.bayLength, 16]} />
                </mesh>
              );
              // Back-face rails
              rails.push(
                <mesh
                  key={`path-rail-back-${segIdx}-${ri}`}
                  position={[
                    midX - seg.perpX * halfWidth,
                    midY - seg.perpY * halfWidth,
                    rz,
                  ]}
                  rotation={[0, 0, segAngle + Math.PI / 2]}
                  material={materials.standard}
                  castShadow
                >
                  <cylinderGeometry args={[railR, railR, seg.numBays * seg.bayLength, 16]} />
                </mesh>
              );
            });
            // Segment-end cross-face rails (at start AND end of each segment)
            for (const endT of [0, 1] as number[]) {
              const ex = seg.startX + (seg.endX - seg.startX) * endT;
              const ey = seg.startY + (seg.endY - seg.startY) * endT;
              [railH1, railH2].forEach((rz, ri) => {
                rails.push(
                  <mesh
                    key={`path-rail-end-${segIdx}-${endT}-${ri}`}
                    position={[ex, ey, rz]}
                    rotation={[0, 0, segAngle]}
                    material={materials.standard}
                    castShadow
                  >
                    <cylinderGeometry args={[railR, railR, bay_length_y, 16]} />
                  </mesh>
                );
              });
            }
          });
          return <group>{rails}</group>;
        })()}

        {/* ─── Ladder / staircase access on access segment ─── */}
        {/* When include_ladder is true, render an inclined ladder (15°) OR
            full stairs (35° from horizontal) in the first segment labeled
            ACCESS or STAIRCASE. If no segment is labeled, use segment 0.
            The access alternates perp face per lift (non-adjacent pattern).
            Each lift also gets a trapdoor at the top (the hatch workers
            climb through). */}
        {include_ladder && pathLayout.segments.length > 0 && (() => {
          // Find the first segment with ACCESS or STAIRCASE label, else use segment 0
          let accessSegIdx = pathLayout.segments.findIndex(s => s.label === "ACCESS" || s.label === "STAIRCASE");
          if (accessSegIdx < 0) accessSegIdx = 0;
          const accessSeg = pathLayout.segments[accessSegIdx];
          const accessSegStandards = pathLayout.segmentStandards[accessSegIdx];
          const segAngle = Math.atan2(accessSeg.dirY, accessSeg.dirX);
          const frontBayStart = accessSegStandards.positions[0];
          const frontBayEnd = accessSegStandards.positions[1];

          // Determine access type: 'stairs' if segment labeled STAIRCASE OR
          // staircase_type==='stairs', else 'ladder' (15° inclined).
          const accessSegLabel = accessSeg.label;
          const isStairs =
            accessSegLabel === "STAIRCASE" ||
            (accessSegLabel !== "ACCESS" && staircase_type === "stairs");

          // For ladder (15°): horizontal run = lift_height × tan(15°) ≈ 536mm
          // For stairs (35° from horizontal): full bay length, more comfortable
          const ladderRun = lift_height * Math.tan(15 * Math.PI / 180);
          const railOffset = 200;
          const guardRailOffset = 100;
          // yMargin = 120 so guard rail stays INSIDE the scaffold frame
          const yMargin = 120;
          const halfWidth = bay_length_y / 2;
          const yFaceOffset = halfWidth - railOffset - yMargin;

          const accessMeshes: React.ReactNode[] = [];
          const trapdoorMeshes: React.ReactNode[] = [];

          for (let liftIdx = 0; liftIdx < num_lifts; liftIdx++) {
            // Alternate perp face per lift (non-adjacent pattern)
            const onPlusPerp = liftIdx % 2 === 0;
            const signPerp = onPlusPerp ? 1 : -1;
            const sx = accessSeg.dirX;
            const sy = accessSeg.dirY;
            const bayStartX = frontBayStart[0];
            const bayStartY = frontBayStart[1];
            const bayEndX = frontBayEnd[0];
            const bayEndY = frontBayEnd[1];

            // For stairs: top at bayEnd, bottom at bayStart (full bay span)
            // For ladder: top at bayEnd, bottom at bayEnd - 536mm (compact)
            const openingAtPlus = onPlusPerp;
            const topX = openingAtPlus ? bayEndX : bayStartX;
            const topY = openingAtPlus ? bayEndY : bayStartY;
            const bottomX = isStairs
              ? (openingAtPlus ? bayStartX : bayEndX)
              : (openingAtPlus ? bayEndX - sx * ladderRun : bayStartX + sx * ladderRun);
            const bottomY = isStairs
              ? (openingAtPlus ? bayStartY : bayEndY)
              : (openingAtPlus ? bayEndY - sy * ladderRun : bayStartY + sy * ladderRun);
            const zBottom = liftIdx * lift_height;
            const zTop = (liftIdx + 1) * lift_height;

            const sdx = topX - bottomX;
            const sdy = topY - bottomY;
            const sdz = zTop - zBottom;
            const slen = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
            const sdir = new THREE.Vector3(sdx, sdy, sdz).normalize();
            const yAxis3 = new THREE.Vector3(0, 1, 0);
            const squat = new THREE.Quaternion().setFromUnitVectors(yAxis3, sdir);
            const seuler = new THREE.Euler().setFromQuaternion(squat);
            const midX = (bottomX + topX) / 2;
            const midY = (bottomY + topY) / 2;
            const midZ = (zBottom + zTop) / 2;
            const colorMat = onPlusPerp ? materials.ladder : materials.ladderSecondary;
            const accessKey = `path-access-L${liftIdx}`;

            // Stringer positions along perp direction (offset by yFaceOffset ± railOffset)
            const perpOff1 = signPerp * (yFaceOffset - railOffset);
            const perpOff2 = signPerp * (yFaceOffset + railOffset);
            const perpOffGuard = signPerp * (yFaceOffset + railOffset + guardRailOffset);

            if (isStairs) {
              // ─── STAIRS: 2 stringers + flat horizontal treads + handrails both sides + posts ───
              const treadWidth = railOffset * 2 + 40;
              const treadDepth = 200;
              const treadThk = 30;
              const stepCount = 7;
              accessMeshes.push(
                <group
                  key={accessKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Stairs (lift ${liftIdx + 1})`, [midX, midY, midZ], accessKey);
                  }}
                >
                  {/* Two inclined stringers */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOff1, midY + accessSeg.perpY * perpOff1, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOff2, midY + accessSeg.perpY * perpOff2, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Flat horizontal treads (rotated to align with perp axis) */}
                  {Array.from({ length: stepCount }).map((_, si) => {
                    const t = (si + 1) / (stepCount + 1);
                    const treadCenterX = bottomX + sdx * t;
                    const treadCenterY = bottomY + sdy * t;
                    const treadCenterZ = zBottom + sdz * t;
                    return (
                      <mesh
                        key={`${accessKey}-tread-${si}`}
                        position={[
                          treadCenterX + accessSeg.perpX * signPerp * yFaceOffset,
                          treadCenterY + accessSeg.perpY * signPerp * yFaceOffset,
                          treadCenterZ,
                        ]}
                        rotation={[0, 0, segAngle]}
                        material={colorMat}
                        castShadow
                      >
                        <boxGeometry args={[treadDepth, treadWidth, treadThk]} />
                      </mesh>
                    );
                  })}
                  {/* Outer handrail (along stringer direction) */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOffGuard, midY + accessSeg.perpY * perpOffGuard, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                  {/* Inner handrail (opposite side) */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX - accessSeg.perpX * signPerp * (yFaceOffset + railOffset + guardRailOffset), midY - accessSeg.perpY * signPerp * (yFaceOffset + railOffset + guardRailOffset), midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                </group>
              );
            } else {
              // ─── LADDER: 2 stringers + 5 horizontal steps + guard rail ───
              accessMeshes.push(
                <group
                  key={accessKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Ladder (lift ${liftIdx + 1})`, [midX, midY, midZ], accessKey);
                  }}
                >
                  {/* Stringer 1 */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOff1, midY + accessSeg.perpY * perpOff1, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Stringer 2 */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOff2, midY + accessSeg.perpY * perpOff2, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Guard rail (outer side) */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + accessSeg.perpX * perpOffGuard, midY + accessSeg.perpY * perpOffGuard, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                  {/* 5 horizontal steps */}
                  {Array.from({ length: 5 }).map((_, si) => {
                    const t = (si + 0.5) / 5;
                    const stepCenterX = bottomX + sdx * t;
                    const stepCenterY = bottomY + sdy * t;
                    const stepCenterZ = zBottom + sdz * t;
                    return (
                      <mesh
                        key={`${accessKey}-step-${si}`}
                        position={[
                          stepCenterX + accessSeg.perpX * signPerp * yFaceOffset,
                          stepCenterY + accessSeg.perpY * signPerp * yFaceOffset,
                          stepCenterZ,
                        ]}
                        rotation={[0, 0, segAngle]}
                        material={colorMat}
                        castShadow
                      >
                        <boxGeometry args={[20, railOffset * 2 + 40, 20]} />
                      </mesh>
                    );
                  })}
                </group>
              );
            }

            // Trapdoor at top of access (platform level) — same for both ladder and stairs
            const trapThk = 80;
            const trapLen = accessSeg.bayLength / 3;
            const trapWidthY = plank_width * 2 + 4;
            const trapZ = zTop - 2 + trapThk / 2;
            const trapCenterX = openingAtPlus ? topX - sx * trapLen / 2 : topX + sx * trapLen / 2;
            const trapCenterY = openingAtPlus ? topY - sy * trapLen / 2 : topY + sy * trapLen / 2;
            const trapOffPerp = signPerp * (halfWidth - 50 - trapWidthY / 2);
            const trapX = trapCenterX + accessSeg.perpX * trapOffPerp;
            const trapY = trapCenterY + accessSeg.perpY * trapOffPerp;
            trapdoorMeshes.push(
              <mesh
                key={`path-trapdoor-L${liftIdx}`}
                position={[trapX, trapY, trapZ]}
                rotation={[0, 0, segAngle]}
                castShadow
                receiveShadow
                material={materials.plank}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPartClick) onPartClick(`Trap door L${liftIdx + 1}`, [trapX, trapY, trapZ], `path-trapdoor-L${liftIdx}`);
                }}
              >
                <boxGeometry args={[trapLen, trapWidthY, trapThk]} />
              </mesh>
            );
          }
          return (
            <group>
              {accessMeshes}
              {trapdoorMeshes}
            </group>
          );
        })()}
      </group>
    );
  };

  // ─── Circular scaffold rendering ──────────────────────────────────────
  // When circular_layout is set, render standards + ledgers + braces on
  // two concentric rings (outer + inner) at regular angular intervals.
  const circularPathLayout = useMemo(() => {
    if (!circular_layout) return null;
    return computeCircularLayout(
      circular_layout.diameter_mm,
      circular_layout.num_segments,
      circular_layout.bay_width_mm
    );
  }, [circular_layout]);

  const renderCircularScaffold = () => {
    if (!circularPathLayout) return null;
    const layout = circularPathLayout;
    const railR = tubeR * 0.8;
    const braceR = tubeR * 0.6;

    return (
      <group>
        {/* ─── Standards (outer + inner rings) ─── */}
        {layout.allStandards.map(([x, y], idx) => (
          <group key={`circ-std-${idx}`} position={[x, y, 0]}>
            {/* Vertical standard tube */}
            <mesh
              rotation={verticalRotation}
              position={[0, 0, towerHeight / 2]}
              material={materials.standard}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[tubeR, tubeR, towerHeight, 24]} />
            </mesh>
            {/* Inner bore */}
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
                key={`circ-ros-${idx}-${ri}`}
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
            {/* Base (jack or wheel or suspended) */}
            {base_type === "wheel" ? (
              <group position={[0, 0, -180]}>
                <mesh material={materials.wheel} castShadow>
                  <cylinderGeometry args={[100, 100, 48, 32]} />
                </mesh>
              </group>
            ) : base_type === "suspended" ? (
              <mesh rotation={verticalRotation} position={[0, 0, towerHeight + 40]} material={materials.spigot} castShadow>
                <cylinderGeometry args={[20, 20, 80, 16]} />
              </mesh>
            ) : (
              <group position={[0, 0, 0]}>
                <mesh rotation={verticalRotation} position={[0, 0, -base_jack_length / 2]} material={materials.baseJack} castShadow>
                  <cylinderGeometry args={[19, 19, base_jack_length, 20]} />
                </mesh>
                <mesh position={[0, 0, -base_jack_length + 3]} material={materials.baseJack} castShadow receiveShadow>
                  <boxGeometry args={[150, 150, 6]} />
                </mesh>
              </group>
            )}
            {/* Guardrail post on top */}
            <mesh
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, 0, towerHeight + 500]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[railR, railR, 1000, 16]} />
            </mesh>
          </group>
        ))}

        {/* ─── Ledgers (outer ring + inner ring + radial) ─── */}
        {/* Outer ring ledgers: connect outer[i] → outer[i+1] (arc chord) */}
        {/* Inner ring ledgers: connect inner[i] → inner[i+1] (arc chord) */}
        {/* Radial ledgers: connect outer[i] → inner[i] (along radius) */}
        {rosetteZs.map((z, liftIdx) => (
          <group key={`circ-ledgers-L${liftIdx}`}>
            {/* Outer ring ledgers */}
            {layout.outerStandards.map((p1, i) => {
              const p2 = layout.outerStandards[(i + 1) % layout.num_segments];
              const dx = p2[0] - p1[0];
              const dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy);
              const midX = (p1[0] + p2[0]) / 2;
              const midY = (p1[1] + p2[1]) / 2;
              const angle = Math.atan2(dy, dx);
              return (
                <mesh
                  key={`circ-led-outer-L${liftIdx}-${i}`}
                  rotation={[0, 0, angle + Math.PI / 2]}
                  position={[midX, midY, z]}
                  material={circular_layout?.label === "REINFORCED" ? materials.reinforcedLedger : materials.ledger}
                  castShadow
                >
                  <cylinderGeometry args={[ledgerR, ledgerR, len, 20]} />
                </mesh>
              );
            })}
            {/* Inner ring ledgers */}
            {layout.innerStandards.map((p1, i) => {
              const p2 = layout.innerStandards[(i + 1) % layout.num_segments];
              const dx = p2[0] - p1[0];
              const dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy);
              const midX = (p1[0] + p2[0]) / 2;
              const midY = (p1[1] + p2[1]) / 2;
              const angle = Math.atan2(dy, dx);
              return (
                <mesh
                  key={`circ-led-inner-L${liftIdx}-${i}`}
                  rotation={[0, 0, angle + Math.PI / 2]}
                  position={[midX, midY, z]}
                  material={circular_layout?.label === "REINFORCED" ? materials.reinforcedLedger : materials.ledger}
                  castShadow
                >
                  <cylinderGeometry args={[ledgerR, ledgerR, len, 20]} />
                </mesh>
              );
            })}
            {/* Radial ledgers (outer → inner at each angular position) */}
            {layout.outerStandards.map((p1, i) => {
              const p2 = layout.innerStandards[i];
              const dx = p2[0] - p1[0];
              const dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy);
              const midX = (p1[0] + p2[0]) / 2;
              const midY = (p1[1] + p2[1]) / 2;
              const angle = Math.atan2(dy, dx);
              return (
                <mesh
                  key={`circ-led-radial-L${liftIdx}-${i}`}
                  rotation={[0, 0, angle + Math.PI / 2]}
                  position={[midX, midY, z]}
                  material={materials.ledger}
                  castShadow
                >
                  <cylinderGeometry args={[ledgerR, ledgerR, len, 20]} />
                </mesh>
              );
            })}
          </group>
        ))}

        {/* ─── Diagonal braces (outer face + inner face, every 3rd bay + extremities) ─── */}
        {include_braces && Array.from({ length: num_lifts }).map((_, k) => {
          const z1 = k * lift_height;
          const z2 = (k + 1) * lift_height;
          const lastBayIdx = layout.num_segments - 1;
          const shouldBrace = (i: number) => i === 0 || i % 3 === 0 || i === lastBayIdx;
          const items: { from: [number, number, number]; to: [number, number, number] }[] = [];
          // Outer ring braces
          for (let i = 0; i < layout.num_segments; i++) {
            if (!shouldBrace(i)) continue;
            const p1 = layout.outerStandards[i];
            const p2 = layout.outerStandards[(i + 1) % layout.num_segments];
            const dir = i % 2 === 0 ? 1 : -1;
            if (dir > 0) items.push({ from: [p1[0], p1[1], z1], to: [p2[0], p2[1], z2] });
            else items.push({ from: [p1[0], p1[1], z2], to: [p2[0], p2[1], z1] });
          }
          // Inner ring braces (opposite direction)
          for (let i = 0; i < layout.num_segments; i++) {
            if (!shouldBrace(i)) continue;
            const p1 = layout.innerStandards[i];
            const p2 = layout.innerStandards[(i + 1) % layout.num_segments];
            const dir = i % 2 === 0 ? -1 : 1;
            if (dir > 0) items.push({ from: [p1[0], p1[1], z1], to: [p2[0], p2[1], z2] });
            else items.push({ from: [p1[0], p1[1], z2], to: [p2[0], p2[1], z1] });
          }
          return items.map((b, idx) => {
            const [fx, fy, fz] = b.from;
            const [tx, ty, tz] = b.to;
            const dx = tx - fx, dy = ty - fy, dz = tz - fz;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const mx = (fx + tx) / 2, my = (fy + ty) / 2, mz = (fz + tz) / 2;
            const dirVec = new THREE.Vector3(dx, dy, dz).normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dirVec
            );
            return (
              <mesh
                key={`circ-brace-L${k}-${idx}`}
                position={[mx, my, mz]}
                quaternion={quat}
                material={materials.brace}
                castShadow
              >
                <cylinderGeometry args={[braceR, braceR, len, 12]} />
              </mesh>
            );
          });
        })}

        {/* ─── Gratings (platforms) — trapezoidal segments per bay per lift ─── */}
        {/* For each angular segment, render a grating that spans from inner to
            outer ring. We approximate the trapezoid with a rectangle of the
            outer arc length × bay_width, rotated to align with the radial direction. */}
        {include_gratings && rosetteZs.map((z, liftIdx) => {
          if (disabled_platform_levels.includes(liftIdx + 1)) return null;
          return layout.outerStandards.map((p1, i) => {
            const p2 = layout.outerStandards[(i + 1) % layout.num_segments];
            const innerP1 = layout.innerStandards[i];
            const innerP2 = layout.innerStandards[(i + 1) % layout.num_segments];
            // Center of the bay (average of 4 corners)
            const cx = (p1[0] + p2[0] + innerP1[0] + innerP2[0]) / 4;
            const cy = (p1[1] + p2[1] + innerP1[1] + innerP2[1]) / 4;
            // Angle of the radial direction (from origin to center)
            const radialAngle = Math.atan2(cy, cx);
            // Length along arc (use outer arc length as approximation)
            const arcLen = layout.bay_arc_length_mm;
            // Width along radius = bay_width
            const radialWidth = layout.bay_width_mm;
            return (
              <mesh
                key={`circ-grating-L${liftIdx}-${i}`}
                position={[cx, cy, z - 6]}
                rotation={[0, 0, radialAngle]}
                material={materials.grating}
                receiveShadow
                castShadow
              >
                <boxGeometry args={[radialWidth * 0.94, arcLen * 0.94, 8]} />
              </mesh>
            );
          });
        })}

        {/* ─── Handrails (top level) — outer ring + inner ring ─── */}
        {(() => {
          const topZ = towerHeight;
          const railH1 = topZ + 500;
          const railH2 = topZ + 1000;
          const rails: React.ReactNode[] = [];
          [railH1, railH2].forEach((rz, ri) => {
            // Outer ring rail (segments between adjacent outer standards)
            layout.outerStandards.forEach((p1, i) => {
              const p2 = layout.outerStandards[(i + 1) % layout.num_segments];
              const dx = p2[0] - p1[0];
              const dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy);
              const midX = (p1[0] + p2[0]) / 2;
              const midY = (p1[1] + p2[1]) / 2;
              const angle = Math.atan2(dy, dx);
              rails.push(
                <mesh
                  key={`circ-rail-outer-${ri}-${i}`}
                  rotation={[0, 0, angle + Math.PI / 2]}
                  position={[midX, midY, rz]}
                  material={materials.standard}
                  castShadow
                >
                  <cylinderGeometry args={[railR, railR, len, 16]} />
                </mesh>
              );
            });
            // Inner ring rail
            layout.innerStandards.forEach((p1, i) => {
              const p2 = layout.innerStandards[(i + 1) % layout.num_segments];
              const dx = p2[0] - p1[0];
              const dy = p2[1] - p1[1];
              const len = Math.sqrt(dx * dx + dy * dy);
              const midX = (p1[0] + p2[0]) / 2;
              const midY = (p1[1] + p2[1]) / 2;
              const angle = Math.atan2(dy, dx);
              rails.push(
                <mesh
                  key={`circ-rail-inner-${ri}-${i}`}
                  rotation={[0, 0, angle + Math.PI / 2]}
                  position={[midX, midY, rz]}
                  material={materials.standard}
                  castShadow
                >
                  <cylinderGeometry args={[railR, railR, len, 16]} />
                </mesh>
              );
            });
          });
          return <group>{rails}</group>;
        })()}

        {/* ─── Filler planks (gap fillers between gratings and ledgers) ─── */}
        {/* Thin steel planks at the edges of each grating platform, on both
            the outer and inner rings. They bridge the gap between the grating
            edge and the ledger. */}
        {include_fillers && rosetteZs.map((z, liftIdx) => {
          if (disabled_platform_levels.includes(liftIdx + 1)) return null;
          const fillerThk = 8;
          const fillerWidth = 100; // 100mm wide strip
          const fillerZ = z - 6 + fillerThk / 2; // aligned with grating top
          const fillers: React.ReactNode[] = [];
          // Outer ring fillers (one per bay, along the arc)
          layout.outerStandards.forEach((p1, i) => {
            const p2 = layout.outerStandards[(i + 1) % layout.num_segments];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;
            const angle = Math.atan2(dy, dx);
            // Position at outer ring edge (slightly inside the outer standard)
            const outerEdgeOffset = layout.radius_mm - 30;
            const fx = Math.cos(angle) * outerEdgeOffset;
            const fy = Math.sin(angle) * outerEdgeOffset;
            // Recompute midpoint at the outer edge
            const midAngle = (i + 0.5) * layout.angle_per_segment_rad;
            const finalX = Math.cos(midAngle) * outerEdgeOffset;
            const finalY = Math.sin(midAngle) * outerEdgeOffset;
            fillers.push(
              <mesh
                key={`circ-filler-outer-L${liftIdx}-${i}`}
                position={[finalX, finalY, fillerZ]}
                rotation={[0, 0, midAngle]}
                material={materials.standard}
                castShadow
              >
                <boxGeometry args={[fillerWidth, len * 0.94, fillerThk]} />
              </mesh>
            );
          });
          // Inner ring fillers
          layout.innerStandards.forEach((p1, i) => {
            const p2 = layout.innerStandards[(i + 1) % layout.num_segments];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const midAngle = (i + 0.5) * layout.angle_per_segment_rad;
            const innerEdgeOffset = layout.innerRadius_mm + 30;
            const finalX = Math.cos(midAngle) * innerEdgeOffset;
            const finalY = Math.sin(midAngle) * innerEdgeOffset;
            fillers.push(
              <mesh
                key={`circ-filler-inner-L${liftIdx}-${i}`}
                position={[finalX, finalY, fillerZ]}
                rotation={[0, 0, midAngle]}
                material={materials.standard}
                castShadow
              >
                <boxGeometry args={[fillerWidth, len * 0.94, fillerThk]} />
              </mesh>
            );
          });
          return <group key={`circ-fillers-L${liftIdx}`}>{fillers}</group>;
        })}

        {/* ─── Ladder / staircase access on circular scaffold ─── */}
        {/* When include_ladder is true, render an inclined ladder (15°) OR
            full stairs (35° from horizontal) in the FIRST segment (between
            angle 0 and angle_per_segment). The access runs along the arc
            (tangent to the outer ring). Stringers are offset along the
            RADIAL direction (from outer ring toward center). Alternates
            radial side per lift (non-adjacent pattern). Each lift also
            gets a trapdoor at the top. */}
        {include_ladder && (() => {
          const layout = circularPathLayout!;
          // Segment 0: from angle 0 to angle_per_segment
          const angle0 = 0;
          // Outer standards at angle 0 and angle 1
          const outerP0 = layout.outerStandards[0];
          const outerP1 = layout.outerStandards[1];
          // Tangent direction at angle 0 (perpendicular to radius, in +angular direction)
          // For a point at angle θ on the circle, tangent = (-sin θ, cos θ)
          const tangentX = -Math.sin(angle0);
          const tangentY = Math.cos(angle0);
          // Radial direction at angle 0 (pointing outward)
          const radialX = Math.cos(angle0);
          const radialY = Math.sin(angle0);

          // Determine access type: 'stairs' if label is STAIRCASE OR staircase_type==='stairs'
          const circLabel = circular_layout?.label;
          const isStairs =
            circLabel === "STAIRCASE" ||
            (circLabel !== "ACCESS" && staircase_type === "stairs");

          // For ladder (15°): horizontal run = lift_height × tan(15°) ≈ 536mm
          // For stairs (35° from horizontal): full bay arc length
          const ladderRun = lift_height * Math.tan(15 * Math.PI / 180);
          const railOffset = 200;
          const guardRailOffset = 100;
          const yMargin = 120;
          const halfWidth = layout.bay_width_mm / 2;
          const yFaceOffset = halfWidth - railOffset - yMargin;

          const accessMeshes: React.ReactNode[] = [];
          const trapdoorMeshes: React.ReactNode[] = [];

          for (let liftIdx = 0; liftIdx < num_lifts; liftIdx++) {
            // Alternate radial side per lift (non-adjacent pattern)
            const onPlusRadial = liftIdx % 2 === 0;
            const signRadial = onPlusRadial ? 1 : -1;
            const openingAtPlus = onPlusRadial;
            const topX = openingAtPlus ? outerP1[0] : outerP0[0];
            const topY = openingAtPlus ? outerP1[1] : outerP0[1];
            // For stairs: bottom at opposite outer standard (full arc span)
            // For ladder: bottom at top - 536mm along tangent (compact)
            const bottomX = isStairs
              ? (openingAtPlus ? outerP0[0] : outerP1[0])
              : (openingAtPlus ? outerP1[0] - tangentX * ladderRun : outerP0[0] + tangentX * ladderRun);
            const bottomY = isStairs
              ? (openingAtPlus ? outerP0[1] : outerP1[1])
              : (openingAtPlus ? outerP1[1] - tangentY * ladderRun : outerP0[1] + tangentY * ladderRun);
            const zBottom = liftIdx * lift_height;
            const zTop = (liftIdx + 1) * lift_height;
            const sdx = topX - bottomX;
            const sdy = topY - bottomY;
            const sdz = zTop - zBottom;
            const slen = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
            const sdir = new THREE.Vector3(sdx, sdy, sdz).normalize();
            const yAxis3 = new THREE.Vector3(0, 1, 0);
            const squat = new THREE.Quaternion().setFromUnitVectors(yAxis3, sdir);
            const seuler = new THREE.Euler().setFromQuaternion(squat);
            const midX = (bottomX + topX) / 2;
            const midY = (bottomY + topY) / 2;
            const midZ = (zBottom + zTop) / 2;
            const colorMat = onPlusRadial ? materials.ladder : materials.ladderSecondary;
            const accessKey = `circ-access-L${liftIdx}`;

            // Stringer positions along radial direction
            const radOff1 = signRadial * (yFaceOffset - railOffset);
            const radOff2 = signRadial * (yFaceOffset + railOffset);
            const radOffGuard = signRadial * (yFaceOffset + railOffset + guardRailOffset);
            const tangentAngle = Math.atan2(tangentY, tangentX);

            if (isStairs) {
              // ─── STAIRS: 2 stringers + flat horizontal treads + handrails both sides ───
              const treadWidth = railOffset * 2 + 40;
              const treadDepth = 200;
              const treadThk = 30;
              const stepCount = 7;
              accessMeshes.push(
                <group
                  key={accessKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Stairs (lift ${liftIdx + 1})`, [midX, midY, midZ], accessKey);
                  }}
                >
                  {/* Two inclined stringers */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOff1, midY + radialY * radOff1, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOff2, midY + radialY * radOff2, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Flat horizontal treads (rotated to align with tangent direction) */}
                  {Array.from({ length: stepCount }).map((_, si) => {
                    const t = (si + 1) / (stepCount + 1);
                    const treadCenterX = bottomX + sdx * t;
                    const treadCenterY = bottomY + sdy * t;
                    const treadCenterZ = zBottom + sdz * t;
                    return (
                      <mesh
                        key={`${accessKey}-tread-${si}`}
                        position={[
                          treadCenterX + radialX * signRadial * yFaceOffset,
                          treadCenterY + radialY * signRadial * yFaceOffset,
                          treadCenterZ,
                        ]}
                        rotation={[0, 0, tangentAngle]}
                        material={colorMat}
                        castShadow
                      >
                        <boxGeometry args={[treadDepth, treadWidth, treadThk]} />
                      </mesh>
                    );
                  })}
                  {/* Outer handrail */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOffGuard, midY + radialY * radOffGuard, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                  {/* Inner handrail (opposite side) */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX - radialX * signRadial * (yFaceOffset + railOffset + guardRailOffset), midY - radialY * signRadial * (yFaceOffset + railOffset + guardRailOffset), midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                </group>
              );
            } else {
              // ─── LADDER: 2 stringers + 5 horizontal steps + guard rail ───
              accessMeshes.push(
                <group
                  key={accessKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Ladder (lift ${liftIdx + 1})`, [midX, midY, midZ], accessKey);
                  }}
                >
                  {/* Stringer 1 */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOff1, midY + radialY * radOff1, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Stringer 2 */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOff2, midY + radialY * radOff2, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[15, 15, slen, 16]} />
                  </mesh>
                  {/* Guard rail (outer side) */}
                  <mesh
                    rotation={[seuler.x, seuler.y, seuler.z]}
                    position={[midX + radialX * radOffGuard, midY + radialY * radOffGuard, midZ]}
                    material={colorMat} castShadow
                  >
                    <cylinderGeometry args={[12, 12, slen, 16]} />
                  </mesh>
                  {/* 5 horizontal steps spanning between stringers */}
                  {Array.from({ length: 5 }).map((_, si) => {
                    const t = (si + 0.5) / 5;
                    const stepCenterX = bottomX + sdx * t;
                    const stepCenterY = bottomY + sdy * t;
                    const stepCenterZ = zBottom + sdz * t;
                    return (
                      <mesh
                        key={`${accessKey}-step-${si}`}
                        position={[
                          stepCenterX + radialX * signRadial * yFaceOffset,
                          stepCenterY + radialY * signRadial * yFaceOffset,
                          stepCenterZ,
                        ]}
                        rotation={[0, 0, tangentAngle + Math.PI / 2]}
                        material={colorMat}
                        castShadow
                      >
                        <boxGeometry args={[railOffset * 2 + 40, 20, 20]} />
                      </mesh>
                    );
                  })}
                </group>
              );
            }

            // Trapdoor at top of access (platform level) — same for both ladder and stairs
            const trapThk = 80;
            const trapLen = layout.bay_arc_length_mm / 3;
            const trapWidthY = plank_width * 2 + 4;
            const trapZ = zTop - 2 + trapThk / 2;
            const trapCenterX = openingAtPlus ? topX - tangentX * trapLen / 2 : topX + tangentX * trapLen / 2;
            const trapCenterY = openingAtPlus ? topY - tangentY * trapLen / 2 : topY + tangentY * trapLen / 2;
            const trapOffRadial = signRadial * (halfWidth - 50 - trapWidthY / 2);
            const trapX = trapCenterX + radialX * trapOffRadial;
            const trapY = trapCenterY + radialY * trapOffRadial;
            trapdoorMeshes.push(
              <mesh
                key={`circ-trapdoor-L${liftIdx}`}
                position={[trapX, trapY, trapZ]}
                rotation={[0, 0, tangentAngle]}
                castShadow
                receiveShadow
                material={materials.plank}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPartClick) onPartClick(`Trap door L${liftIdx + 1}`, [trapX, trapY, trapZ], `circ-trapdoor-L${liftIdx}`);
                }}
              >
                <boxGeometry args={[trapLen, trapWidthY, trapThk]} />
              </mesh>
            );
          }
          return (
            <group>
              {accessMeshes}
              {trapdoorMeshes}
            </group>
          );
        })()}
      </group>
    );
  };

  return (
    <group>
      {/* ---- Circular scaffold — when circular_layout is set ---- */}
      {circular_layout && renderCircularScaffold()}

      {/* ---- Angle scaffold (L-shape, U-shape) — when scaffold_path is set ---- */}
      {scaffold_path && scaffold_path.length > 0 && !circular_layout && renderAngleScaffold()}

      {/* ---- Linear scaffold (standard layout) — when no scaffold_path and no circular_layout ---- */}
      {!scaffold_path && !circular_layout && (
      <>
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
          ) : base_type === "suspended" ? (
            /* Suspended frame: ladder beam above the standard + suspension bracket.
               The ladder beam runs along Y (perpendicular to X), one per row of standards.
               A short suspension bracket connects the top of the standard to the beam. */
            <group
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick("Suspension bracket", [x, y, 0], `suspension-${idx}`);
              }}
            >
              {/* Suspension bracket: short vertical tube from standard top to beam */}
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                position={[0, 0, towerHeight + 40]}
                material={materials.spigot}
                castShadow
              >
                <cylinderGeometry args={[20, 20, 80, 16]} />
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

      {/* ---- Ladder beams (suspended frame support) ---- */}
      {/* When base_type='suspended', ladder beams run along Y above each row
          of standards. Each beam spans the scaffold width. */}
      {base_type === "suspended" && bayLayout.standardXs.map((stdX, rowIdx) => (
        <mesh
          key={`ladder-beam-${rowIdx}`}
          position={[stdX, 0, towerHeight + 80]}
          rotation={[0, 0, 0]}
          material={materials.spigot}
          castShadow
          onClick={(e) => {
            e.stopPropagation();
            if (onPartClick) onPartClick(`Ladder beam ${suspended_beam_length}mm (row ${rowIdx})`, [stdX, 0, towerHeight + 80], `ladder-beam-${rowIdx}`);
          }}
        >
          <cylinderGeometry args={[25, 25, suspended_beam_length, 16]} />
        </mesh>
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
      {/* Door opening: skip Y-ledgers at -Y face within the door bay and below door height */}
      {ledgers.map((l, idx) => {
        const partId = `ledger-${idx}`;
        if (isRemoved(partId)) return null;
        // Check if this ledger is inside the door opening
        if (door_opening) {
          const doorBayCenter = bayLayout.bayCenters[door_opening.bay_index];
          const doorBayStart = bayLayout.standardXs[door_opening.bay_index];
          const doorBayEnd = doorBayStart + bayLayout.bayLengths[door_opening.bay_index];
          const isXInDoorBay = l.x >= doorBayStart && l.x <= doorBayEnd;
          const isYAtDoorFace = l.y < 0 && Math.abs(l.y + towerY / 2) < 100; // -Y face
          const isZBelowDoor = l.z <= door_opening.height;
          if (isXInDoorBay && isYAtDoorFace && isZBelowDoor) return null; // skip — door opening
        }
        const rot: [number, number, number] =
          l.axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
        // Check if this bay is a reinforced section
        let isReinforced = false;
        if (sections) {
          let prevBays = 0;
          for (const sec of sections) {
            if (l.bayIdx >= prevBays && l.bayIdx < prevBays + sec.bays) {
              isReinforced = sec.label === "REINFORCED";
              break;
            }
            prevBays += sec.bays;
          }
        }
        return (
          <mesh
            key={partId}
            rotation={rot}
            position={[l.x, l.y, l.z]}
            material={isReinforced ? materials.reinforcedLedger : materials.ledger}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              const ledgerName = isReinforced ? `Reinforced ledger ${l.axis.toUpperCase()} L${Math.ceil(l.z / lift_height)}` : `Ledger ${l.axis.toUpperCase()} L${Math.ceil(l.z / lift_height)}`;
              if (onPartClick) onPartClick(ledgerName, [l.x, l.y, l.z], partId);
            }}
          >
            <cylinderGeometry args={[ledgerR, ledgerR, l.len, 20]} />
          </mesh>
        );
      })}

      {/* ---- Diagonal braces (clickable) ---- */}
      {/* Door opening: skip braces at -Y face within the door bay and below door height */}
      {braces.map((b, idx) => {
        const partId = `brace-${idx}`;
        if (isRemoved(partId)) return null;
        const [x1, y1, z1] = b.from;
        const [x2, y2, z2] = b.to;
        // Check if this brace is inside the door opening
        if (door_opening) {
          const doorBayStart = bayLayout.standardXs[door_opening.bay_index];
          const doorBayEnd = doorBayStart + bayLayout.bayLengths[door_opening.bay_index];
          const isXInDoorBay = (x1 >= doorBayStart && x1 <= doorBayEnd) || (x2 >= doorBayStart && x2 <= doorBayEnd);
          const isYAtDoorFace = y1 < 0 && Math.abs(y1 + towerY / 2) < 100;
          const isZBelowDoor = z1 < door_opening.height && z2 < door_opening.height;
          if (isXInDoorBay && isYAtDoorFace && isZBelowDoor) return null; // skip — door opening
        }
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
            // Staircase tower: only the bay WITH the staircase for this lift gets an opening
            // Lift 0 → bay 0, Lift 1 → bay 1, Lift 2 → bay 0, Lift 3 → bay 1
            const staircaseTowerBayIdx = staircase_tower
              ? (levelIdx % 2 === 0 ? 0 : Math.min(1, bayLayout.bayCenters.length - 1))
              : -1;
            const thisBayHasStaircase = staircase_tower
              ? (i === staircaseTowerBayIdx)
              : (primaryHasStaircase || secondaryHasStaircase);

            if (thisBayHasStaircase) {
              // Staircase present: skip 2 planks at the staircase's Y face.
              // In staircase_tower mode: alternate Y face per lift
              // In normal mode: primary on +Y, secondary on -Y
              const startOnPlusY = staircase_tower
                ? (levelIdx % 2 === 0)
                : primaryHasStaircase;
              const opening = staircaseOpenings.computeForBayAndLift(i, levelIdx, startOnPlusY);
              if (opening) {
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

      {/* ---- Filler planks (gap fillers between gratings and ledgers) ---- */}
      {/* Thin steel planks at the edges of each grating platform, on both
          the +Y and -Y faces. They bridge the gap between the grating edge
          and the ledger. */}
      {include_fillers && rosetteZs.map((z, levelIdx) => {
        if (disabled_platform_levels.includes(levelIdx + 1)) return null;
        const fillerThk = 8;
        const fillerWidth = 100;
        const fillerZ = z - 6 + fillerThk / 2;
        return (
          <group key={`fillers-${levelIdx}`}>
            {/* South side (Y-) — back */}
            <mesh
              position={[0, -towerY / 2 + 30, fillerZ]}
              material={materials.standard}
              castShadow
            >
              <boxGeometry args={[towerX, fillerWidth, fillerThk]} />
            </mesh>
            {/* North side (Y+) — front (no toeboard here, but filler yes) */}
            <mesh
              position={[0, towerY / 2 - 30, fillerZ]}
              material={materials.standard}
              castShadow
            >
              <boxGeometry args={[towerX, fillerWidth, fillerThk]} />
            </mesh>
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

      {/* ---- Trapdoors (ladder traps) — ONLY for access towers, NOT staircase towers ---- */}
      {/* Access towers use ladders + trapdoors (hatch you open to pass through).
          Staircase towers use stairs + gratings as stepping plates — no trapdoors.
          Rendered for BOTH primary (bay 0) and secondary (last bay) staircases. */}

      {/* Primary trapdoors (access #1) — skipped when staircase_tower */}
      {!staircase_tower && hasPrimaryStaircase && rosetteZs.map((z, levelIdx) => {
        const opening = staircaseOpenings.computeForBayAndLift(0, levelIdx, true);
        if (!opening) return null;
        const bayLen = bayLayout.bayLengths[0];
        return renderTrapdoor(opening, bayLen, levelIdx, z, "primary");
      })}

      {/* Secondary trapdoors (access #2) — skipped when staircase_tower */}
      {!staircase_tower && secondary_access && rosetteZs.map((z, levelIdx) => {
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        if (lastBayIdx === 0) return null; // same as primary, skip
        const opening = staircaseOpenings.computeForBayAndLift(lastBayIdx, levelIdx, false);
        if (!opening) return null;
        const bayLen = bayLayout.bayLengths[lastBayIdx];
        return renderTrapdoor(opening, bayLen, levelIdx, z, "secondary");
      })}

      {/* ---- Handrails + middle rails on staircase bays ---- */}
      {/* SAFETY: handrails only on the STAIRCASE SIDE (the Y face where the
          staircase is for that lift), NOT both faces. The staircase alternates
          Y face per lift, so each lift's handrail is on the staircase's side
          for that lift. The opposite side has the normal guardrail (handled
          by the top-level guardrail code). */}
      {hasPrimaryStaircase && (() => {
        const railR = tubeR * 0.7;
        const railLenX = bayLayout.bayLengths[0];
        const bayStartX = bayLayout.standardXs[0];
        const railCenterX = bayStartX + railLenX / 2;
        const rails: React.ReactNode[] = [];
        for (let liftIdx = 0; liftIdx < num_lifts; liftIdx++) {
          const platformZ = (liftIdx + 1) * lift_height;
          const middleRailZ = platformZ + 500;
          const topRailZ = platformZ + 1000;
          // Only render handrail on the staircase's Y face for this lift
          const opening = staircaseOpenings.computeForBayAndLift(0, liftIdx, true);
          if (!opening) continue;
          const yFace = opening.yFace;
          // Middle rail
          rails.push(
            <mesh
              key={`handrail-primary-L${liftIdx}-mid`}
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
              key={`handrail-primary-L${liftIdx}-top`}
              position={[railCenterX, yFace, topRailZ]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[railR, railR, railLenX, 16]} />
            </mesh>
          );
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
          // Only render handrail on the staircase's Y face for this lift
          const opening = staircaseOpenings.computeForBayAndLift(lastBayIdx, liftIdx, false);
          if (!opening) continue;
          const yFace = opening.yFace;
          rails.push(
            <mesh
              key={`handrail-secondary-L${liftIdx}-mid`}
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
              key={`handrail-secondary-L${liftIdx}-top`}
              position={[railCenterX, yFace, topRailZ]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[railR, railR, railLenX, 16]} />
            </mesh>
          );
        }
        return <group>{rails}</group>;
      })()}

      {/* ---- Landing pads (3 planks) — ONLY for access towers (ladders), NOT staircase towers ---- */}
      {/* Access towers with ladders need 3-plank landing pads for safe standing.
          Staircase towers use gratings as stepping plates — no separate landing pads. */}
      {!staircase_tower && hasPrimaryStaircase && Array.from({ length: num_lifts }).map((_, liftIdx) => {
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

      {/* ---- Landing pads (3 planks) at the bottom of each secondary staircase — access towers only ---- */}
      {!staircase_tower && secondary_access && Array.from({ length: num_lifts }).map((_, liftIdx) => {
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

      {/* ---- Staircase tower: ONE staircase per lift, alternating BAY ---- */}
      {/* Each lift has exactly ONE staircase, placed in a DIFFERENT bay from
          the lifts above and below. This ensures stairs are NEVER directly
          above another staircase (non-adjacent):
            Lift 0 → bay 0    Lift 1 → bay 1    Lift 2 → bay 0    Lift 3 → bay 1
          Workers go up in bay 0, walk across the platform to bay 1, go up,
          walk back to bay 0, etc. — a zigzag path. */}
      {staircase_tower && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const totalBays = bayLayout.bayCenters.length;
        // Alternate bay per lift: even lifts → bay 0, odd lifts → bay 1
        const bayIdx = liftIdx % 2 === 0 ? 0 : Math.min(1, totalBays - 1);
        const renderFn = staircase_type === "stairs" ? renderStairs : renderStaircaseSection;
        // Alternate Y face per lift (non-adjacent)
        const startOnPlusY = liftIdx % 2 === 0;
        const color = liftIdx % 2 === 0 ? materials.ladder : materials.ladderSecondary;
        const name = `Staircase (lift ${liftIdx + 1})`;
        const prefix = `staircase-tower-L${liftIdx}`;
        return renderFn(bayIdx, liftIdx, color, name, prefix, startOnPlusY);
      })}

      {/* ---- Door opening (walk-through passage in scaffold frame) ---- */}
      {/* Creates a gap in the scaffold frame for entry/exit.
          Renders a door frame with:
          - 2 vertical side posts (thicker tubes on both sides of the opening)
          - 1 horizontal header beam above the door
          - The opening is clear (no ledgers/braces at that position) */}
      {door_opening && (() => {
        const { bay_index: doorBay, width: doorWidth, height: doorHeight } = door_opening;
        if (doorBay >= bayLayout.bayCenters.length) return null;
        const bayCenterX = bayLayout.bayCenters[doorBay];
        const doorR = tubeR * 1.2; // thicker than regular standards
        return (
          <group key="door-opening">
            {/* Left side post */}
            <mesh
              rotation={verticalRotation}
              position={[bayCenterX - doorWidth / 2, -towerY / 2, doorHeight / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[doorR, doorR, doorHeight, 16]} />
            </mesh>
            {/* Right side post */}
            <mesh
              rotation={verticalRotation}
              position={[bayCenterX + doorWidth / 2, -towerY / 2, doorHeight / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[doorR, doorR, doorHeight, 16]} />
            </mesh>
            {/* Header beam (horizontal, above the door) */}
            <mesh
              position={[bayCenterX, -towerY / 2, doorHeight]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[doorR, doorR, doorWidth + doorR * 2, 16]} />
            </mesh>
            {/* Visual door panel (semi-transparent, shows the opening) */}
            <mesh position={[bayCenterX, -towerY / 2, doorHeight / 2]}>
              <boxGeometry args={[doorWidth, 10, doorHeight]} />
              <meshStandardMaterial color="#8b6f47" roughness={0.85} metalness={0.1} />
            </mesh>
          </group>
        );
      })()}

      {/* ---- Primary staircase (access bay 0 only, when NOT staircase_tower) ---- */}
      {!staircase_tower && hasPrimaryStaircase && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const renderFn = staircase_type === "stairs" ? renderStairs : renderStaircaseSection;
        return renderFn(0, liftIdx, materials.ladder, "Primary staircase", "staircase-primary", true);
      })}

      {/* ---- Secondary staircase (escape, last bay only, when NOT staircase_tower) ---- */}
      {/* Uses secondary_staircase_type so Access 2 can be Stairs while Access 1 is Ladder (or vice versa) */}
      {!staircase_tower && secondary_access && Array.from({ length: num_lifts }).map((_, liftIdx) => {
        const lastBayIdx = bayLayout.bayCenters.length - 1;
        const renderFn = secondary_staircase_type === "stairs" ? renderStairs : renderStaircaseSection;
        return renderFn(lastBayIdx, liftIdx, materials.ladderSecondary, "Secondary staircase (escape)", "staircase-secondary", false);
      })}
      </>
      )}
    </group>
  );
}
