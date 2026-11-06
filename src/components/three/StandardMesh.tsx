"use client";

import { useMemo } from "react";

import type { StandardConfig } from "@/lib/part-types";
import { RosetteMesh } from "./RosetteMesh";

/**
 * Procedural ringlock standard (vertical upright) assembly.
 *
 * Coordinate system (mm):
 *   - Ground is the XY plane, +Z is up.
 *   - Tube axis along +Z, origin at the bottom of the tube.
 *   - Rosettes welded at z = (i+1) * pitch, centered on the tube axis.
 *   - Rosettes' flat faces are perpendicular to the tube (i.e. axis = +Z).
 *   - Spigot sits on top of the tube, half inside the topmost rosette.
 */
export function StandardMesh({ config }: { config: StandardConfig }) {
  const {
    tube_od,
    tube_wall,
    tube_length,
    rosette_pitch,
    rosette_count,
    rosette_disc_od,
    rosette_thickness,
    rosette_center_bore,
    spigot_od,
    spigot_length,
  } = config;

  const tubeID = tube_od - 2 * tube_wall;
  const tubeR = tube_od / 2;
  const spigotR = spigot_od / 2;

  const materials = useMemo(
    () => ({
      tube: {
        color: "#8e9098",
        roughness: 0.45,
        metalness: 0.75,
      },
      spigot: {
        color: "#56585e",
        roughness: 0.4,
        metalness: 0.85,
      },
      innerBore: {
        color: "#2a2a30",
        roughness: 0.85,
        metalness: 0.1,
      },
    }),
    [],
  );

  // Rosette z positions — distribute evenly along the tube at the pitch.
  const rosetteZs = useMemo(() => {
    const zs: number[] = [];
    for (let i = 0; i < rosette_count; i++) {
      const z = (i + 1) * rosette_pitch;
      zs.push(Math.min(z, tube_length - rosette_thickness / 2));
    }
    return zs;
  }, [rosette_count, rosette_pitch, tube_length, rosette_thickness]);

  // Rotate cylinders so their axis aligns with +Z (vertical). Default axis is Y.
  const verticalRotation: [number, number, number] = [Math.PI / 2, 0, 0];

  return (
    <group>
      {/* ---- Tube (hollow cylinder along Z) ---- */}
      <mesh
        rotation={verticalRotation}
        position={[0, 0, tube_length / 2]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[tubeR, tubeR, tube_length, 48]} />
        <meshStandardMaterial {...materials.tube} />
      </mesh>
      {/* Bore — darker cylinder inside (slightly taller to stay visible) */}
      <mesh
        rotation={verticalRotation}
        position={[0, 0, tube_length / 2]}
      >
        <cylinderGeometry args={[tubeID / 2, tubeID / 2, tube_length + 1, 32]} />
        <meshStandardMaterial {...materials.innerBore} />
      </mesh>

      {/* ---- Rosettes welded onto the tube ---- */}
      {rosetteZs.map((z, i) => (
        <group key={`ros-${i}`} position={[0, 0, z]}>
          <RosetteMesh
            config={{
              type: "rosette",
              disc_od: rosette_disc_od,
              thickness: rosette_thickness,
              center_bore: rosette_center_bore,
              small_hole_dia: 14,
              large_hole_dia: 20,
              hole_pcd_r: 35,
              n_small_holes: 4,
              n_large_holes: 4,
            }}
          />
        </group>
      ))}

      {/* ---- Spigot (top, male) ---- */}
      <mesh
        rotation={verticalRotation}
        position={[0, 0, tube_length + spigot_length / 2]}
        castShadow
      >
        <cylinderGeometry args={[spigotR, spigotR, spigot_length, 32]} />
        <meshStandardMaterial {...materials.spigot} />
      </mesh>
      <mesh
        rotation={verticalRotation}
        position={[0, 0, tube_length + spigot_length / 2]}
      >
        <cylinderGeometry args={[13, 13, spigot_length + 1, 24]} />
        <meshStandardMaterial {...materials.innerBore} />
      </mesh>
    </group>
  );
}
