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
  // X-axis perimeter faces: at first and last standard X positions.
  // Y-axis perimeter faces: per bay using bayLayout.standardXs[bi] and [bi+1].
  const braces = useMemo(() => {
    if (!include_braces) return [];
    const items: {
      from: [number, number, number];
      to: [number, number, number];
    }[] = [];
    for (let k = 0; k < num_lifts; k++) {
      const z1 = k * lift_height;
      const z2 = (k + 1) * lift_height;
      // X-axis perimeter faces (left/right ends of tower — first/last standard)
      for (const sideIdx of [0, 1] as number[]) {
        const i = sideIdx === 0 ? 0 : bayLayout.standardXs.length - 1;
        const x = bayLayout.standardXs[i];
        // Direction: side 0 → bottom-left to top-right, side 1 → top-left to bottom-right
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
      // Y-axis perimeter faces (front/back of tower) — per bay
      for (const sideIdx of [0, 1] as number[]) {
        const j = sideIdx === 0 ? 0 : bays_y;
        const y = j * bay_length_y - towerY / 2;
        const dir = sideIdx === 0 ? 1 : -1;
        for (let bi = 0; bi < bayLayout.bayCenters.length; bi++) {
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

  // ─── LADDER OPENING POSITIONS ─────────────────────────────────────────
  // For each bay that has a ladder, compute which plank indices to skip and
  // where the ladder's vertical centerline should be. Two planks are removed
  // per level to give the ladder (400mm wide = ±200mm rails) enough clearance.
  //
  // When a ladder is present, the opening is FIXED at the +X end of the bay
  // on every level (the ladder is vertical and passes through the same hole).
  // When NO ladder is present, a single plank alternates between +X and -X
  // ends per level (fall-through protection for trapdoor-only access).
  //
  // `opening.count` = number of planks to remove (2 for ladder, 1 for trapdoor)
  // `opening.startIdx` = index of the first removed plank
  // `opening.ladderX` = X position for the ladder centerline (center of opening)
  const ladderOpenings = useMemo(() => {
    const gap = 4;
    const pw = plank_width;
    const computeForBay = (bayIdx: number): {
      count: number;
      startIdx: number;
      ladderX: number;
      planksPerBay: number;
      stepX: number;
      bayStartX: number;
    } | null => {
      if (bayIdx >= bayLayout.bayCenters.length) return null;
      const bayLenX = bayLayout.bayLengths[bayIdx];
      const planksPerBay = Math.max(2, Math.floor((bayLenX + gap) / (pw + gap)));
      const stepX = bayLenX / planksPerBay;
      const bayStartX = bayLayout.standardXs[bayIdx];
      // Opening at +X end: last 2 planks (for ladder) or last 1 (trapdoor only)
      const count = 2;
      const startIdx = planksPerBay - count;
      // Ladder center = midpoint between the 2 removed planks
      // Plank p is at bayStartX + (p + 0.5) * stepX
      // Planks startIdx and startIdx+1 are removed; center between them:
      const ladderX = bayStartX + (startIdx + 1) * stepX;
      return { count, startIdx, ladderX, planksPerBay, stepX, bayStartX };
    };

    const lastBayIdx = bayLayout.bayCenters.length - 1;
    return {
      primary: include_ladder ? computeForBay(0) : null,
      secondary: secondary_access ? computeForBay(lastBayIdx) : null,
      // For trapdoor-only access (no ladder), still remove 1 plank, alternating
      trapdoorOnly: !include_ladder,
      computeForBay,
    };
  }, [bayLayout, plank_width, include_ladder, secondary_access]);

  // ─── Ladder geometry helper ─────────────────────────────────────────────
  // Renders a vertical ladder (2 rails + rungs) inside a bay. `ladderCenterX`
  // is the bay's center X; `ladderY` is the Y offset (typically ±towerY/2 - 80).
  const renderLadder = (
    ladderCenterX: number,
    ladderY: number,
    material: THREE.Material,
    partName: string,
    partId: string,
  ) => {
    const ladderRailR = 15; // Ø30mm
    const railOffset = 200; // 400mm apart → ±200mm from center
    const rungR = 10; // Ø20mm
    const rungSpacing = 300;
    const rungCount = Math.floor(towerHeight / rungSpacing);

    return (
      <group
        key={partId}
        onClick={(e) => {
          e.stopPropagation();
          if (onPartClick) onPartClick(partName, [ladderCenterX, ladderY, towerHeight / 2], partId);
        }}
      >
        {/* Left rail */}
        <mesh
          rotation={verticalRotation}
          position={[ladderCenterX - railOffset, ladderY, towerHeight / 2]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[ladderRailR, ladderRailR, towerHeight, 16]} />
        </mesh>
        {/* Right rail */}
        <mesh
          rotation={verticalRotation}
          position={[ladderCenterX + railOffset, ladderY, towerHeight / 2]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[ladderRailR, ladderRailR, towerHeight, 16]} />
        </mesh>
        {/* Rungs (cylinders along X — rotation [0, 0, Math.PI/2] turns default Y axis into X) */}
        {Array.from({ length: rungCount }).map((_, ri) => (
          <mesh
            key={`rung-${partId}-${ri}`}
            position={[ladderCenterX, ladderY, (ri + 1) * rungSpacing]}
            rotation={[0, 0, Math.PI / 2]}
            material={material}
            castShadow
          >
            <cylinderGeometry args={[rungR, rungR, railOffset * 2, 8]} />
          </mesh>
        ))}
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
      {/* MULTI-BAY + LADDER OPENING RULE:
          - Planks per bay = floor((bay_length + gap) / (plank_width + gap))
          - Access bay (i=0):
            * If include_ladder: remove 2 planks at +X end (FIXED on every level)
              → ladder passes through this 2-plank-wide opening on every level
            * If no ladder: remove 1 plank, alternating +X/-X per level
              (fall-through protection for trapdoor-only access)
          - Secondary access bay (last bay, if secondary_access):
            * Remove 2 planks at +X end (FIXED) for escape ladder
          - All other bays: FULLY filled with planks
          - Levels in disabled_platform_levels are skipped (no gratings) */}
      {include_gratings && rosetteZs.map((z, levelIdx) => {
        const levelNum = levelIdx + 1;
        if (disabled_platform_levels.includes(levelNum)) return null;
        return (
        <group key={`grating-${levelIdx}`}>
          {bayLayout.bayCenters.map((bayCx, i) =>
            Array.from({ length: bays_y }).map((_, j) => {
              const bayCenterY = (j + 0.5) * bay_length_y - towerY / 2;
              const pw = plank_width;
              const gap = 4;
              const gratingThk = 8;
              const plankLen = bay_length_y * 0.96;
              const bayLenX = bayLayout.bayLengths[i];
              const planksPerBay = Math.max(2, Math.floor((bayLenX + gap) / (pw + gap)));
              const stepX = bayLenX / planksPerBay;
              const bayStartX = bayLayout.standardXs[i];

              // Determine which plank indices to skip for this bay+level.
              // Ladder bays: skip 2 planks at +X end (fixed).
              // Trapdoor-only bay 0 (no ladder): skip 1 plank, alternating.
              const skipIndices = new Set<number>();
              const isPrimaryBay = i === 0;
              const isSecondaryBay = i === bayLayout.bayCenters.length - 1;
              if (isPrimaryBay && ladderOpenings.primary) {
                // Ladder present: skip 2 fixed planks
                const { startIdx, count } = ladderOpenings.primary;
                for (let k = 0; k < count; k++) skipIndices.add(startIdx + k);
              } else if (isPrimaryBay && ladderOpenings.trapdoorOnly) {
                // No ladder, trapdoor only: skip 1 alternating
                const accessOpenIdx = levelIdx % 2 === 0 ? planksPerBay - 1 : 0;
                skipIndices.add(accessOpenIdx);
              } else if (isSecondaryBay && ladderOpenings.secondary) {
                // Secondary escape ladder: skip 2 fixed planks
                const { startIdx, count } = ladderOpenings.secondary;
                for (let k = 0; k < count; k++) skipIndices.add(startIdx + k);
              }

              const planks: React.ReactNode[] = [];
              for (let p = 0; p < planksPerBay; p++) {
                if (skipIndices.has(p)) continue; // open row(s) for ladder/trapdoor
                const partId = `grating-L${levelIdx}-${i}-${j}-${p}`;
                if (isRemoved(partId)) continue;
                const plankX = bayStartX + (p + 0.5) * stepX;
                const gratingZ = z - gratingThk / 2 - 2;
                planks.push(
                  <mesh
                    key={partId}
                    position={[plankX, bayCenterY, gratingZ]}
                    material={materials.grating}
                    receiveShadow
                    castShadow
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPartClick) onPartClick(`Grating L${levelIdx + 1} Bay ${i}`, [plankX, bayCenterY, gratingZ], partId);
                    }}
                  >
                    <boxGeometry args={[pw, plankLen, gratingThk]} />
                  </mesh>
                );
              }
              return planks;
            })
          )}
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

            {/* Trap door — flush with grating, exactly at the ladder opening */}
            {/* The trapdoor covers the same opening as the ladder (2 planks wide
                when ladder is present, 1 plank wide for trapdoor-only access).
                Positioned at the +X end of bay 0. */}
            {(() => {
              const bayLen0 = bayLayout.bayLengths[0];
              const pw = plank_width;
              const gap = 4;
              const planksPerBay0 = Math.max(2, Math.floor((bayLen0 + gap) / (pw + gap)));
              const stepX = bayLen0 / planksPerBay0;
              const bayStartX = bayLayout.standardXs[0];

              // Trapdoor covers the same opening as the ladder
              let trapX: number;
              let trapWidth: number;
              if (ladderOpenings.primary) {
                // Ladder present: trapdoor spans the 2 removed planks
                const { startIdx, count } = ladderOpenings.primary;
                trapX = bayStartX + (startIdx + count / 2) * stepX;
                trapWidth = count * stepX * 0.92;
              } else {
                // No ladder: trapdoor at alternating position (top level)
                const topLevelIdx = rosetteZs.length - 1;
                const accessOpenIdx = topLevelIdx % 2 === 0 ? planksPerBay0 - 1 : 0;
                trapX = bayStartX + (accessOpenIdx + 0.5) * stepX;
                trapWidth = pw;
              }

              const bayCy = bay_length_y / 2 - towerY / 2;
              const gratingThk = 8;
              const trapZ = topZ - gratingThk / 2 - 2;

              return (
                <mesh
                  key="trapdoor"
                  position={[trapX, bayCy, trapZ]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick("Trap door", [trapX, bayCy, trapZ], "trapdoor");
                  }}
                >
                  <boxGeometry args={[trapWidth, bay_length_y * 0.94, gratingThk]} />
                  <meshStandardMaterial color="#e8a020" roughness={0.5} metalness={0.4} />
                </mesh>
              );
            })()}
          </group>
        );
      })()}

      {/* ---- Primary ladder (yellow, inside access bay 0) ---- */}
      {/* Ladder runs vertically inside the first bay (access bay), passing
          through the 2-plank opening at the +X end of the bay. The opening
          is computed in `ladderOpenings.primary` and is fixed on every level
          (no alternating) so the ladder has a clear vertical path.
          Two vertical rails (Ø30mm) + horizontal rungs every 300mm. */}
      {include_ladder && ladderOpenings.primary && (() => {
        const ladderCenterX = ladderOpenings.primary.ladderX;
        const ladderY = towerY / 2 - 80; // front face (+Y), 80mm inset
        return renderLadder(
          ladderCenterX,
          ladderY,
          materials.ladder,
          "Primary ladder",
          "ladder-primary",
        );
      })()}

      {/* ---- Secondary ladder (orange, escape, opposite end + opposite face) ---- */}
      {/* Secondary escape ladder at the +X end of the LAST bay, on the -Y face
          (opposite of primary). Passes through its own 2-plank opening. */}
      {secondary_access && ladderOpenings.secondary && (() => {
        const ladderCenterX = ladderOpenings.secondary.ladderX;
        const ladderY = -(towerY / 2 - 80); // back face (-Y), opposite of primary
        return renderLadder(
          ladderCenterX,
          ladderY,
          materials.ladderSecondary,
          "Secondary ladder (escape)",
          "ladder-secondary",
        );
      })()}
    </group>
  );
}
