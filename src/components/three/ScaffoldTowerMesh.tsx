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
export function ScaffoldTowerMesh({ config }: { config: TowerConfig }) {
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
  } = config;

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
      for (const i of [0, bays_x] as number[]) {
        const x = i * bay_length_x - towerX / 2;
        for (let j = 0; j < bays_y; j++) {
          const y1 = j * bay_length_y - towerY / 2;
          const y2 = (j + 1) * bay_length_y - towerY / 2;
          items.push({ from: [x, y1, z1], to: [x, y2, z2] });
        }
      }
      // Y-axis perimeter faces (j=0 front and j=bays_y back)
      for (const j of [0, bays_y] as number[]) {
        const y = j * bay_length_y - towerY / 2;
        for (let i = 0; i < bays_x; i++) {
          const x1 = i * bay_length_x - towerX / 2;
          const x2 = (i + 1) * bay_length_x - towerX / 2;
          items.push({ from: [x1, y, z1], to: [x2, y, z2] });
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

          {/* Base jack (below ground line) */}
          {include_base_jacks ? (
            <mesh
              rotation={verticalRotation}
              position={[0, 0, -base_jack_length / 2]}
              material={materials.baseJack}
              castShadow
            >
              <cylinderGeometry args={[baseJackR, baseJackR, base_jack_length, 20]} />
            </mesh>
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
            <cylinderGeometry args={[0.002, 0.002, len, 8]} />
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
    </group>
  );
}
