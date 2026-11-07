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
export function ScaffoldTowerMesh({ config, onPartClick }: { config: TowerConfig; onPartClick?: (name: string, position: [number, number, number]) => void }) {
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
  } = config as TowerConfig & {
    base_type?: "jack" | "wheel";
    include_gratings?: boolean;
    include_toeboards?: boolean;
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

          {/* Base: jack or wheel (below ground line) — compliant to ringlock standard */}
          {base_type === "wheel" ? (
            /* Standard ringlock caster wheel (8" / 200mm):
               - Wheel: Ø200mm × 50mm wide, PU/rubber on cast iron
               - Brake: Total lock (wheel + swivel)
               - Stem: Ø35mm (1-3/8") round, with pin hole
               - Fork: steel, 75mm wide
               - Overall height: ~240mm
               - Weight: ~5.7 kg (12.5 lbs)
               - Load capacity: 500 lbs / 227 kg per wheel */
            <group
              position={[0, 0, -120]}
              onClick={(e) => {
                e.stopPropagation();
                if (onPartClick) onPartClick("Caster wheel (8\" total-lock)", [x, y, -120]);
              }}
            >
              {/* Wheel: Ø200mm × 50mm wide (axis along Y) */}
              <mesh material={materials.wheel} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[100, 100, 50, 32]} />
              </mesh>
              {/* Hub (cast iron center) */}
              <mesh material={materials.wheelFork} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[40, 40, 52, 24]} />
              </mesh>
              {/* Brake pedal (red, on side of wheel) */}
              <mesh position={[0, 30, 0]} material={materials.toeboard} castShadow>
                <boxGeometry args={[15, 20, 8]} />
              </mesh>
              {/* Fork plate (steel, 75mm wide) */}
              <mesh position={[0, 0, 55]} material={materials.wheelFork} castShadow>
                <boxGeometry args={[75, 55, 6]} />
              </mesh>
              {/* Stem: Ø35mm, 60mm long */}
              <mesh position={[0, 0, 85]} material={materials.wheelFork} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[17.5, 17.5, 60, 16]} />
              </mesh>
              {/* Pin hole (cross pin Ø8mm) */}
              <mesh position={[0, 0, 100]} rotation={[0, 0, Math.PI / 2]} material={materials.innerBore}>
                <cylinderGeometry args={[4, 4, 40, 8]} />
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
                if (onPartClick) onPartClick("Base jack 38×600mm", [x, y, -base_jack_length / 2]);
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

      {/* ---- Ledgers (horizontal tubes) ---- */}
      {ledgers.map((l, idx) => {
        // Cylinder default axis is +Y. For axis "y", no rotation needed.
        // For axis "x", rotate by Z by 90°.
        const rot: [number, number, number] =
          l.axis === "x" ? [0, 0, Math.PI / 2] : [0, 0, 0];
        return (
          <mesh
            key={`ledger-${idx}`}
            rotation={rot}
            position={[l.x, l.y, l.z]}
            material={materials.ledger}
            castShadow
          >
            <cylinderGeometry args={[ledgerR, ledgerR, l.len, 20]} />
          </mesh>
        );
      })}

      {/* ---- Diagonal braces ---- */}
      {braces.map((b, idx) => {
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
        // We want it to point from `from` to `to`.
        // Direction vector
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        // Default cylinder axis is +Y, so we need rotation from Y to dir
        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
        const euler = new THREE.Euler().setFromQuaternion(quat);

        return (
          <mesh
            key={`brace-${idx}`}
            rotation={[euler.x, euler.y, euler.z]}
            position={[mx, my, mz]}
            material={materials.brace}
            castShadow
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

      {/* ---- Grating platforms per level (2 pieces + 1 open for access) ---- */}
      {/* Working platform = 2/3 of bay (LARGER than access).
          Access opening = 1/3 of bay (SMALLER than working platform).
          
          Gratings follow the WIDTH (Y direction, shorter span).
          Bay is divided into 3 sections along X (length).
          
          Opening position STAGGERS between levels:
          - Odd levels (1,3,5...): opening on the +X (right/front) side
          - Even levels (2,4,6...): opening on the -X (left/back) side
          
          This prevents fall-through: the top level's opening is closed
          by the level below it (staggered pattern). */}
      {include_gratings && rosetteZs.map((z, levelIdx) => (
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

              // Determine which sections get gratings (2 pieces)
              // Odd levels (0-indexed even): cover sections 0 and 1 (back 2/3), open section 2 (front +X)
              // Even levels (0-indexed odd): cover sections 1 and 2 (front 2/3), open section 0 (back -X)
              const levelNum = levelIdx + 1; // 1-indexed
              const isOpenAtFront = levelNum % 2 === 1; // odd levels open at front
              
              // Section X positions (0=back, 1=middle, 2=front)
              const sectionX0 = bayCenterX - bay_length_x / 2 + sectionWidth / 2;
              const sectionX1 = bayCenterX - bay_length_x / 2 + sectionWidth + sectionWidth / 2;
              const sectionX2 = bayCenterX - bay_length_x / 2 + 2 * sectionWidth + sectionWidth / 2;

              // Determine which 2 sections get boards
              const boardSections = isOpenAtFront ? [sectionX0, sectionX1] : [sectionX1, sectionX2];

              return boardSections.map((boardX, bi) => (
                <mesh
                  key={`grating-L${levelIdx}-${i}-${j}-${bi}`}
                  position={[boardX, bayCenterY, gratingZ]}
                  material={materials.grating}
                  receiveShadow
                  castShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartClick) onPartClick(`Grating L${levelIdx + 1}`, [boardX, bayCenterY, gratingZ]);
                  }}
                >
                  <boxGeometry args={[sectionWidth * 0.9, boardLen, gratingThk]} />
                </mesh>
              ));
            })
          )}
        </group>
      ))}

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
                    if (onPartClick) onPartClick("Trap door", [openSectionX, bayCy, trapZ]);
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
    </group>
  );
}
