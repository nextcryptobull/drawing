"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { CasterConfig } from "@/lib/part-types";

/**
 * Procedural caster geometry built from THREE primitives.
 *
 * Coordinate system (mm):
 *   - Ground is the XY plane, +Z is up.
 *   - Wheel axle is along +Y (so the wheel rolls along +X / -X).
 *   - Wheel disc lies in the XZ plane (its circular face perpendicular to Y).
 *   - Fork legs sit at y = ±forkGap/2 (sandwiching the wheel along the axle).
 *   - Fork legs extend upward (+Z) to hold the top plate.
 *   - Top plate sits above the fork.
 *
 * The group is positioned so the contact point (bottom of wheel) sits at z = 0.
 */
export function CasterMesh({ config }: { config: CasterConfig }) {
  const {
    wheel_od,
    wheel_width,
    tread_thickness,
    tread_color,
    hub_bore,
    bearing_id,
    bearing_od,
    bearing_width,
    axle_dia,
    fork_thickness,
    fork_leg_width,
    fork_leg_length,
    swivel_boss_od,
    top_plate_length,
    top_plate_width,
    top_plate_thickness,
    swivel,
    brake_type,
    pedal_length,
    mount_type,
  } = config;

  const materials = useMemo(() => {
    const treadColors: Record<string, string> = {
      blue: "#1a4dd8",
      red: "#c43030",
      grey: "#7a7a7a",
    };
    return {
      tread: new THREE.MeshStandardMaterial({
        color: treadColors[tread_color] ?? "#1a4dd8",
        roughness: 0.55,
        metalness: 0.0,
      }),
      hub: new THREE.MeshStandardMaterial({
        color: "#33333a",
        roughness: 0.35,
        metalness: 0.85,
      }),
      bearing: new THREE.MeshStandardMaterial({
        color: "#cfd0d4",
        roughness: 0.25,
        metalness: 0.95,
      }),
      axle: new THREE.MeshStandardMaterial({
        color: "#4a4a52",
        roughness: 0.3,
        metalness: 0.9,
      }),
      fork: new THREE.MeshStandardMaterial({
        color: "#82848a",
        roughness: 0.4,
        metalness: 0.8,
      }),
      plate: new THREE.MeshStandardMaterial({
        color: "#6a6c72",
        roughness: 0.4,
        metalness: 0.85,
      }),
      brake: new THREE.MeshStandardMaterial({
        color: "#e8730c",
        roughness: 0.45,
        metalness: 0.4,
      }),
      stem: new THREE.MeshStandardMaterial({
        color: "#5a5a60",
        roughness: 0.35,
        metalness: 0.9,
      }),
    };
  }, [tread_color]);

  // Derived geometry (mm)
  const wheelR = wheel_od / 2;
  const hubR = (wheel_od - 2 * tread_thickness) / 2;
  const forkGap = wheel_width + 6;
  const swivelOffset = 30;
  const wheelCenterZ = wheelR; // wheel sits on floor
  const plateZ = wheelCenterZ + fork_leg_length;

  // Rotation to make a cylinder's axis point along +Z (for vertical cylinders
  // like the swivel boss and stem). Default cylinder axis is +Y.
  const verticalAxisRotation: [number, number, number] = [Math.PI / 2, 0, 0];

  return (
    <group>
      {/* ---- Wheel: tread + hub + bore ----
          Default cylinder axis is +Y, which is the axle direction. No rotation. */}
      <mesh
        position={[0, 0, wheelCenterZ]}
        material={materials.tread}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[wheelR, wheelR, wheel_width, 64]} />
      </mesh>
      <mesh
        position={[0, 0, wheelCenterZ]}
        material={materials.hub}
        castShadow
      >
        <cylinderGeometry args={[hubR, hubR, wheel_width + 0.5, 48]} />
      </mesh>
      <mesh position={[0, 0, wheelCenterZ]} material={materials.axle}>
        <cylinderGeometry
          args={[hub_bore / 2, hub_bore / 2, wheel_width + 1.2, 24]}
        />
      </mesh>

      {/* Bearings (2) — flanking the hub along the axle (Y) */}
      <mesh
        position={[0, -wheel_width / 2 - bearing_width / 2, wheelCenterZ]}
        material={materials.bearing}
      >
        <cylinderGeometry
          args={[bearing_od / 2, bearing_id / 2 + 1, bearing_width, 32]}
        />
      </mesh>
      <mesh
        position={[0, wheel_width / 2 + bearing_width / 2, wheelCenterZ]}
        material={materials.bearing}
      >
        <cylinderGeometry
          args={[bearing_od / 2, bearing_id / 2 + 1, bearing_width, 32]}
        />
      </mesh>

      {/* Axle (runs through wheel along Y, longer than wheel width) */}
      <mesh position={[0, 0, wheelCenterZ]} material={materials.axle}>
        <cylinderGeometry args={[axle_dia / 2, axle_dia / 2, wheel_width + 40, 16]} />
      </mesh>

      {/* ---- Fork legs (two boxes flanking the wheel along Y) ---- */}
      {[+1, -1].map((sign) => (
        <mesh
          key={`fork-${sign}`}
          position={[0, sign * forkGap / 2, wheelCenterZ + fork_leg_length / 2]}
          material={materials.fork}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[fork_leg_width, fork_thickness, fork_leg_length]} />
        </mesh>
      ))}

      {/* ---- Swivel boss (vertical cylinder above fork, only if swivel) ---- */}
      {swivel === "swivel" ? (
        <mesh
          rotation={verticalAxisRotation}
          position={[swivelOffset, 0, plateZ - 12.5]}
          material={materials.plate}
          castShadow
        >
          <cylinderGeometry args={[swivel_boss_od / 2, swivel_boss_od / 2, 25, 32]} />
        </mesh>
      ) : null}

      {/* ---- Top plate ---- */}
      <mesh
        position={[
          swivel === "swivel" ? swivelOffset : 0,
          0,
          plateZ + top_plate_thickness / 2,
        ]}
        material={materials.plate}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[top_plate_length, top_plate_width, top_plate_thickness]} />
      </mesh>

      {/* ---- Mounting stem (if stem mount) ---- */}
      {mount_type !== "top_plate" ? (
        <mesh
          rotation={verticalAxisRotation}
          position={[
            swivel === "swivel" ? swivelOffset : 0,
            0,
            plateZ + top_plate_thickness + 20,
          ]}
          material={materials.stem}
          castShadow
        >
          <cylinderGeometry args={[12, 12, 40, 24]} />
        </mesh>
      ) : null}

      {/* ---- Brake system (orange pedal + curved shoe + linkage) ---- */}
      {brake_type !== "none" ? (
        <BrakeParts
          wheelR={wheelR}
          wheelCenterZ={wheelCenterZ}
          forkGap={forkGap}
          forkLegWidth={fork_leg_width}
          pedalLength={pedal_length}
          material={materials.brake}
        />
      ) : null}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
function BrakeParts({
  wheelR,
  wheelCenterZ,
  forkGap,
  forkLegWidth,
  pedalLength,
  material,
}: {
  wheelR: number;
  wheelCenterZ: number;
  forkGap: number;
  forkLegWidth: number;
  pedalLength: number;
  material: THREE.Material;
}) {
  const pivotOffsetX = forkLegWidth / 2 + 12;
  const pivotOffsetZ = 70;
  const pivotY = forkGap / 2;

  const shoeY = forkGap / 2 - 25;

  return (
    <group>
      {/* Foot pedal — orange box, angled downward at rest.
          Pedal extends along +X from the pivot; rotation around Y tilts it
          up/down in the XZ plane. */}
      <group
        position={[pivotOffsetX, pivotY, wheelCenterZ + pivotOffsetZ]}
        rotation={[0, (-25 * Math.PI) / 180, 0]}
      >
        <mesh material={material} castShadow>
          <boxGeometry args={[pedalLength, 3, 25]} />
        </mesh>
      </group>

      {/* Curved brake shoe — torus segment hugging the wheel OD.
          Default torus is in XY plane (axis Z); rotate by [π/2,0,0] to make
          axis Y, so the torus wraps around the wheel axle.
          Arc starts at +X (0°) and sweeps 40° CCW; shift the start to
          roughly center it on top of the wheel. */}
      <mesh
        position={[0, shoeY, wheelCenterZ]}
        rotation={[Math.PI / 2, 0, 0]}
        material={material}
        castShadow
      >
        <torusGeometry
          args={[
            wheelR + 3,
            4,
            12,
            24,
            (40 * Math.PI) / 180,
          ]}
        />
      </mesh>

      {/* Linkage arm — thin orange bar connecting pedal pivot to shoe pivot */}
      <LinkageArm
        material={material}
        from={[pivotOffsetX, pivotY, wheelCenterZ + pivotOffsetZ]}
        to={[pivotOffsetX, pivotY, wheelCenterZ + 25]}
      />
    </group>
  );
}

function LinkageArm({
  from,
  to,
  material,
}: {
  from: [number, number, number];
  to: [number, number, number];
  material: THREE.Material;
}) {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  const mid: [number, number, number] = [
    (x1 + x2) / 2,
    (y1 + y2) / 2,
    (z1 + z2) / 2,
  ];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const len = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.001);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    dir,
  );
  const euler = new THREE.Euler().setFromQuaternion(quat);

  return (
    <mesh
      position={mid}
      rotation={[euler.x, euler.y, euler.z]}
      material={material}
      castShadow
    >
      <boxGeometry args={[12, 3, len]} />
    </mesh>
  );
}
