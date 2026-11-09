"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { TowerConfig } from "@/lib/part-types";

/**
 * Procedural scaffold tower assembly built from THREE primitives.
 *
 * Coordinate system (mm):
 *   - Ground is the XY plane, +Z is up.
 *   - Standards placed on a grid at (i*bay_length_x, j*bay_length_y, 0).
 *   - Each standard spans z = 0 .. num_lifts*lift_height.
 *   - Rosettes welded onto standards at z = lift_height, 2*lift_height, ...
 *   - Ledgers connect adjacent standards at each rosette level (horizontal
 *     tubes along X and Y).
 *   - Diagonal braces cross each bay face on the perimeter.
 *   - Base jacks (short cylinders) sit below each standard when enabled.
 *   - Planks (thin boxes) cover the top of each bay when enabled.
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
  } = config as TowerConfig & {
    base_type?: "jack" | "wheel";
    include_gratings?: boolean;
    include_toeboards?: boolean;
    disabled_platform_levels?: number[];
    include_ladder?: boolean;
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
    }),
    [],
  );

  // Check if a part ID has been removed by the user
  const isRemoved = (id: string) => removedParts?.has(id) ?? false;

  const towerX = bays_x * bay_length_x;
  const towerY = bays_y * bay_length_y;
  const towerHeight = num_lifts * lift_height;

  // Standard positions (grid corners)
  const standardPositions = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= bays_x; i++) {
      for (let j = 0; j <= bays_y; j++) {
        const x = i * bay_length_x - towerX / 2;
        const y = j * bay_length_y - towerY / 2;
        pts.push([x, y]);
      }
    }
    return pts;
  }, [bays_x, bays_y, bay_length_x, bay_length_y, towerX, towerY]);

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

  // Ledgers
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
      // Ledgers along X
      for (let i = 0; i < bays_x; i++) {
        for (let j = 0; j <= bays_y; j++) {
          const x1 = i * bay_length_x - towerX / 2;
          const x2 = (i + 1) * bay_length_x - towerX / 2;
          const y = j * bay_length_y - towerY / 2;
          items.push({ x: (x1 + x2) / 2, y, z, len: bay_length_x, axis: "x" });
        }
      }
      // Ledgers along Y
      for (let i = 0; i <= bays_x; i++) {
        for (let j = 0; j < bays_y; j++) {
          const x = i * bay_length_x - towerX / 2;
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          items.push({ x, y: (y1 + y2) / 2, z, len: bay_length_y, axis: "y" });
        }
      }
    }
    return items;
  }, [
    bays_x,
    bays_y,
    bay_length_x,
    bay_length_y,
    lift_height,
    num_lifts,
    towerX,
    towerY,
  ]);

  // Diagonal braces (perimeter only)
  // Real scaffold practice: ONE diagonal per side, with opposite direction
  // across (adjacent sides have opposite diagonal directions). NOT an X-pattern
  // (you can't physically install two crossing diagonals on the same face).
  const braces = useMemo(() => {
    if (!include_braces) return [];
    const items: {
      from: [number, number, number];
      to: [number, number, number];
    }[] = [];
    for (let k = 0; k < num_lifts; k++) {
      const z1 = k * lift_height;
      const z2 = (k + 1) * lift_height;
      // X-axis perimeter faces (i=0 left and i=bays_x right)
      // Opposite sides get opposite diagonal directions
      for (const sideIdx of [0, 1] as number[]) {
        const i = sideIdx === 0 ? 0 : bays_x;
        const x = i * bay_length_x - towerX / 2;
        // Direction: side 0 → bottom-left to top-right, side 1 → top-left to bottom-right
        const dir = sideIdx === 0 ? 1 : -1;
        for (let j = 0; j < bays_y; j++) {
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          if (dir > 0) {
            // bottom-left → top-right
            items.push({ from: [x, y1, z1], to: [x, y2, z2] });
          } else {
            // top-left → bottom-right (opposite direction)
            items.push({ from: [x, y1, z2], to: [x, y2, z1] });
          }
        }
      }
      // Y-axis perimeter faces (j=0 front and j=bays_y back)
      // Opposite sides get opposite diagonal directions
      for (const sideIdx of [0, 1] as number[]) {
        const j = sideIdx === 0 ? 0 : bays_y;
        const y = j * bay_length_y - towerY / 2;
        const dir = sideIdx === 0 ? 1 : -1;
        for (let i = 0; i < bays_x; i++) {
          const x1 = i * bay_length_x - towerX / 2;
          const x2 = (i + 1) * bay_length_x - towerX / 2;
          if (dir > 0) {
            // bottom-left → top-right
            items.push({ from: [x1, y, z1], to: [x2, y, z2] });
          } else {
            // top-left → bottom-right (opposite direction)
            items.push({ from: [x1, y, z2], to: [x2, y, z1] });
          }
        }
      }
    }
    return items;
  }, [
    include_braces,
    bays_x,
    bays_y,
    bay_length_x,
    bay_length_y,
    lift_height,
    num_lifts,
    towerX,
    towerY,
  ]);

  // Planks
  const planks = useMemo(() => {
    if (!include_planks) return [];
    const items: { x: number; y: number; w: number; h: number; z: number }[] = [];
    const topZ = towerHeight + plank_thickness / 2;
    for (let i = 0; i < bays_x; i++) {
      for (let j = 0; j < bays_y; j++) {
        const x = (i + 0.5) * bay_length_x - towerX / 2;
        const y = (j + 0.5) * bay_length_y - towerY / 2;
        items.push({
          x,
          y,
          w: bay_length_x * 0.92,
          h: bay_length_y * 0.92,
          z: topZ,
        });
      }
    }
    return items;
  }, [
    include_planks,
    bays_x,
    bays_y,
    bay_length_x,
    bay_length_y,
    towerHeight,
    plank_thickness,
    towerX,
    towerY,
  ]);

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
      {Array.from({ length: bays_x }).map((_, i) =>
        Array.from({ length: bays_y + 1 }).map((_, j) => {
          const partId = `reinforce-x-${i}-${j}`;
          if (isRemoved(partId)) return null;
          const x1 = i * bay_length_x - towerX / 2;
          const x2 = (i + 1) * bay_length_x - towerX / 2;
          const y = j * bay_length_y - towerY / 2;
          const midX = (x1 + x2) / 2;
          return (
            <mesh
              key={partId}
              position={[midX, y, 100]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials.spigot}
              castShadow
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick(`Reinforcing ledger X (basement)`, [midX, y, 100], partId);
              }}
            >
              <cylinderGeometry args={[ledgerR, ledgerR, bay_length_x, 16]} />
            </mesh>
          );
        })
      )}
      {Array.from({ length: bays_x + 1 }).map((_, i) =>
        Array.from({ length: bays_y }).map((_, j) => {
          const partId = `reinforce-y-${i}-${j}`;
          if (isRemoved(partId)) return null;
          const x = i * bay_length_x - towerX / 2;
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
      {/* MULTI-BAY RULE:
          - Only ONE bay (bay i=0, the access bay) has the staggered opening (2/3 filled + 1/3 open)
          - ALL other bays (i=1,2,...) are FULLY filled with gratings (3/3 coverage)
          - The access bay opening staggers between levels (prevents fall-through)
          - Levels in disabled_platform_levels are skipped (no gratings) */}
      {include_gratings && rosetteZs.map((z, levelIdx) => {
        const levelNum = levelIdx + 1;
        if (disabled_platform_levels.includes(levelNum)) return null;
        return (
        <group key={`grating-${levelIdx}`}>
          {Array.from({ length: bays_x }).map((_, i) =>
            Array.from({ length: bays_y }).map((_, j) => {
              const bayCenterX = (i + 0.5) * bay_length_x - towerX / 2;
              const bayCenterY = (j + 0.5) * bay_length_y - towerY / 2;
              const gratingThk = 8;
              const gratingZ = z - gratingThk / 2 - 2;

              // Board follows WIDTH (Y direction, shorter)
              const boardLen = bay_length_y * 0.94;
              // Divide bay into 3 sections along X (length direction)
              const sectionWidth = bay_length_x / 3;

              // Section X positions (0=back, 1=middle, 2=front)
              const sectionX0 = bayCenterX - bay_length_x / 2 + sectionWidth / 2;
              const sectionX1 = bayCenterX - bay_length_x / 2 + sectionWidth + sectionWidth / 2;
              const sectionX2 = bayCenterX - bay_length_x / 2 + 2 * sectionWidth + sectionWidth / 2;

              // MULTI-BAY RULE: Only bay i=0 (access bay) has the staggered opening.
              // All other bays (i>0) are fully filled with 3 grating sections.
              let boardSections: number[];
              if (i === 0) {
                // Access bay: 2 sections filled + 1 open (staggered)
                const levelNum = levelIdx + 1;
                const isOpenAtFront = levelNum % 2 === 1;
                boardSections = isOpenAtFront ? [sectionX0, sectionX1] : [sectionX1, sectionX2];
              } else {
                // Non-access bays: fully filled (all 3 sections)
                boardSections = [sectionX0, sectionX1, sectionX2];
              }

              return boardSections.map((boardX, bi) => {
                const partId = `grating-L${levelIdx}-${i}-${j}-${bi}`;
                if (isRemoved(partId)) return null;
                return (
                <mesh
                  key={partId}
                  position={[boardX, bayCenterY, gratingZ]}
                  material={materials.grating}
                  receiveShadow
                  castShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Grating L${levelIdx + 1} Bay ${i}`, [boardX, bayCenterY, gratingZ], partId);
                  }}
                >
                  <boxGeometry args={[sectionWidth * 0.9, boardLen, gratingThk]} />
                </mesh>
                );
              });
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

        // Guardrail post positions = same as standard positions (on the frame)
        // Rails connect BETWEEN posts, same X/Y as the standards
        // Back rail: along X at Y=-towerY/2 (back row of standards)
        // Right rail: along Y at X=towerX/2 (right column of standards)
        // Left rail: along Y at X=-towerX/2 (left column of standards)
        // No front rail (open for access at +Y)

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

            {/* Trap door — flush with grating, exactly at the open section */}
            {/* The open section is where no grating boards are placed (1/3 of bay) */}
            {(() => {
              const topLevelIdx = rosetteZs.length - 1;
              const levelNum = topLevelIdx + 1;
              const isOpenAtFront = levelNum % 2 === 1; // odd levels open at +X
              const sectionWidth = bay_length_x / 3;

              // Bay center for bay (0,0)
              const bayCx = bay_length_x / 2 - towerX / 2;
              const bayCy = bay_length_y / 2 - towerY / 2;

              // The 3 section centers along X:
              // section 0 (back, -X): bayCx - bay_length_x/2 + sectionWidth/2
              // section 1 (middle):   bayCx
              // section 2 (front, +X): bayCx + bay_length_x/2 - sectionWidth/2

              // Open section: odd levels → section 2 (front); even → section 0 (back)
              const openSectionX = isOpenAtFront
                ? bayCx + bay_length_x / 2 - sectionWidth / 2  // front
                : bayCx - bay_length_x / 2 + sectionWidth / 2; // back

              // Trap door sits flush with grating level (same Z as grating boards)
              const gratingThk = 8;
              const trapZ = topZ - gratingThk / 2 - 2;

              return (
                <mesh
                  key="trapdoor"
                  position={[openSectionX, bayCy, trapZ]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick("Trap door", [openSectionX, bayCy, trapZ], "trapdoor");
                  }}
                >
                  <boxGeometry args={[sectionWidth * 0.9, bay_length_y * 0.94, gratingThk]} />
                  <meshStandardMaterial color="#e8a020" roughness={0.5} metalness={0.4} />
                </mesh>
              );
            })()}
          </group>
        );
      })()}

      {/* ---- Ladder (if enabled) ---- */}
      {/* Ladder runs vertically on the access bay side (+X front of bay 0).
          Two vertical rails (Ø30mm) + horizontal rungs every 300mm.
          Goes from ground (z=0) to top platform. */}
      {include_ladder && (() => {
        const ladderX = bay_length_x / 2 - towerX / 2 + bay_length_x / 3 * 1.5; // center of access opening
        const ladderRailR = 15; // Ø30mm
        const rungSpacing = 300;
        const rungCount = Math.floor(towerHeight / rungSpacing);
        const verticalRotation: [number, number, number] = [Math.PI / 2, 0, 0];

        return (
          <group>
            {/* Left rail */}
            <mesh
              rotation={verticalRotation}
              position={[ladderX - 150, 0, towerHeight / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[ladderRailR, ladderRailR, towerHeight, 16]} />
            </mesh>
            {/* Right rail */}
            <mesh
              rotation={verticalRotation}
              position={[ladderX + 150, 0, towerHeight / 2]}
              material={materials.standard}
              castShadow
            >
              <cylinderGeometry args={[ladderRailR, ladderRailR, towerHeight, 16]} />
            </mesh>
            {/* Rungs */}
            {Array.from({ length: rungCount }).map((_, ri) => (
              <mesh
                key={`rung-${ri}`}
                position={[ladderX, 0, (ri + 1) * rungSpacing]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.standard}
                castShadow
              >
                <cylinderGeometry args={[8, 8, 300, 8]} />
              </mesh>
            ))}
          </group>
        );
      })()}
    </group>
  );
}
