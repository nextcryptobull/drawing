"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { RosetteConfig } from "@/lib/part-types";

/**
 * Procedural ringlock rosette geometry built from THREE primitives.
 *
 * The disc is built centred at the origin with its axis along +Z (so its flat
 * faces point up/down). This matches the cadquery script `ringlock_rosette.py`
 * which extrudes along Z.
 *
 * For the standalone viewer the parent places this group so the bottom face
 * rests on the floor (z = -thickness/2). For the StandardMesh the group sits
 * directly on the tube axis (centred on its z position).
 */
export function RosetteMesh({ config }: { config: RosetteConfig }) {
  const {
    disc_od,
    thickness,
    center_bore,
    small_hole_dia,
    large_hole_dia,
    hole_pcd_r,
    n_small_holes,
    n_large_holes,
  } = config;

  const discR = disc_od / 2;

  const materials = useMemo(
    () => ({
      disc: new THREE.MeshStandardMaterial({
        color: "#d9822e",
        roughness: 0.45,
        metalness: 0.55,
      }),
      hole: new THREE.MeshStandardMaterial({
        color: "#1a1a1f",
        roughness: 0.9,
        metalness: 0.0,
      }),
    }),
    [],
  );

  // Hole positions — small holes evenly spaced, large holes offset by half-step.
  const smallAngles = useMemo(
    () =>
      Array.from(
        { length: n_small_holes },
        (_, i) => (2 * Math.PI * i) / Math.max(n_small_holes, 1),
      ),
    [n_small_holes],
  );

  const largeAngles = useMemo(() => {
    const step = (2 * Math.PI) / Math.max(n_small_holes + n_large_holes, 1);
    const offset = step / 2;
    return Array.from(
      { length: n_large_holes },
      (_, i) => offset + (2 * Math.PI * i) / Math.max(n_large_holes, 1),
    );
  }, [n_small_holes, n_large_holes]);

  // Rotate the cylinders so their axis aligns with +Z (default is +Y).
  const zAxisRotation: [number, number, number] = [Math.PI / 2, 0, 0];

  return (
    <group>
      {/* Disc body */}
      <mesh rotation={zAxisRotation} material={materials.disc} castShadow receiveShadow>
        <cylinderGeometry args={[discR, discR, thickness, 96]} />
      </mesh>

      {/* Center bore — visualised as a slightly taller, darker cylinder */}
      <mesh rotation={zAxisRotation} position={[0, 0, 0]} material={materials.hole}>
        <cylinderGeometry
          args={[center_bore / 2, center_bore / 2, thickness + 0.5, 48]}
        />
      </mesh>

      {/* Small holes */}
      {smallAngles.map((a, i) => (
        <mesh
          key={`small-${i}`}
          rotation={zAxisRotation}
          material={materials.hole}
          position={[hole_pcd_r * Math.cos(a), hole_pcd_r * Math.sin(a), 0]}
        >
          <cylinderGeometry
            args={[small_hole_dia / 2, small_hole_dia / 2, thickness + 0.5, 24]}
          />
        </mesh>
      ))}

      {/* Large holes */}
      {largeAngles.map((a, i) => (
        <mesh
          key={`large-${i}`}
          rotation={zAxisRotation}
          material={materials.hole}
          position={[hole_pcd_r * Math.cos(a), hole_pcd_r * Math.sin(a), 0]}
        >
          <cylinderGeometry
            args={[large_hole_dia / 2, large_hole_dia / 2, thickness + 0.5, 24]}
          />
        </mesh>
      ))}
    </group>
  );
}
