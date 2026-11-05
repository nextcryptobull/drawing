"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, OrbitControls } from "@react-three/drei";

import { useConfigurator, asCaster, asRosette, asStandard } from "@/lib/store";
import type { PartConfig } from "@/lib/part-types";
import { CasterMesh } from "@/components/three/CasterMesh";
import { RosetteMesh } from "@/components/three/RosetteMesh";
import { StandardMesh } from "@/components/three/StandardMesh";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Debounce a value by `delay` ms, comparing by JSON so that deeply-equal
 * objects don't trigger an update.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  const signature = useMemo(() => JSON.stringify(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [signature, delay, value]);
  return debounced;
}

/** Picks the right procedural mesh for the config. */
function PartFromConfig({ config }: { config: PartConfig }) {
  switch (config.type) {
    case "caster":
      return <CasterMesh config={asCaster(config)} />;
    case "rosette":
      // RosetteMesh is built centered on origin with axis +Z. Lift it by
      // thickness/2 so its bottom face rests on the floor (z = 0).
      return (
        <group position={[0, 0, asRosette(config).thickness / 2]}>
          <RosetteMesh config={asRosette(config)} />
        </group>
      );
    case "standard":
      // StandardMesh already sits on the floor.
      return <StandardMesh config={asStandard(config)} />;
  }
}

export function Viewer3D() {
  const current = useConfigurator((s) => s.current);
  const debounced = useDebouncedValue(current, 100);

  // Compute the bounding-sphere-ish target so the camera auto-frames the part.
  const frame = useMemo(() => {
    // Approximate "interesting" size based on part type.
    if (debounced.type === "caster") {
      const c = asCaster(debounced);
      const h = c.wheel_od / 2 + c.fork_leg_length + 25 + c.top_plate_thickness + 40;
      const r = Math.max(c.wheel_od, c.top_plate_length) / 2;
      return { radius: Math.max(r, h / 2), height: h };
    }
    if (debounced.type === "rosette") {
      const r = asRosette(debounced);
      return { radius: r.disc_od / 2, height: r.thickness };
    }
    const s = asStandard(debounced);
    return { radius: s.rosette_disc_od / 2, height: s.tube_length + s.spigot_length };
  }, [debounced]);

  // Scale: 1 unit = 1 mm would put cameras kilometres away. Convert to
  // "viewing units" where the largest dim ≈ 6 units.
  const maxDim = Math.max(frame.radius * 2, frame.height);
  const scale = 6 / Math.max(maxDim, 1);
  const camDist = (frame.radius + frame.height) * 1.6 * scale + 4;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{ position: [camDist * 0.9, -camDist * 0.7, camDist * 0.7], fov: 38, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#0e0f12"]} />
        <fog attach="fog" args={["#0e0f12", camDist * 1.5, camDist * 4]} />

        <ambientLight intensity={0.35} />
        <directionalLight
          position={[camDist, camDist * 1.2, camDist]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={camDist * 5}
          shadow-camera-left={-camDist * 1.5}
          shadow-camera-right={camDist * 1.5}
          shadow-camera-top={camDist * 1.5}
          shadow-camera-bottom={-camDist * 1.5}
        />
        <directionalLight position={[-camDist, -camDist * 0.4, camDist * 0.6]} intensity={0.4} />

        <Suspense fallback={null}>
          <Environment preset="warehouse" />
        </Suspense>

        {/* Floor grid */}
        <Grid
          args={[40, 40]}
          position={[0, 0, 0]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#3a3a42"
          sectionSize={2.5}
          sectionThickness={1.1}
          sectionColor="#6a6a78"
          fadeDistance={camDist * 2.4}
          fadeStrength={1}
          infiniteGrid={false}
        />

        {/* The part itself, scaled to "viewing units" */}
        <group scale={scale}>
          <group position={[0, 0, 0]}>
            <Suspense fallback={<FallbackCube />}>
              <PartFromConfig config={debounced} />
            </Suspense>
          </group>
        </group>

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={Math.max(camDist * 4, 30)}
          maxPolarAngle={Math.PI * 0.49}
          target={[0, 0, (frame.height / 2) * scale]}
        />
      </Canvas>

      {/* Overlay: part label + dimensions */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        <div className="font-semibold">{debounced.label ?? debounced.type}</div>
        <div className="mt-0.5 text-white/60">
          scale: 1u = {Math.round(1 / scale)} mm · orbit / scroll to inspect
        </div>
      </div>
    </div>
  );
}

/** Tiny placeholder shown while meshes hydrate. */
function FallbackCube() {
  return (
    <mesh position={[0, 0, 1]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#444" wireframe />
    </mesh>
  );
}

/** Loading placeholder used by the page-level Suspense boundary. */
export function Viewer3DSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
      <Skeleton className="h-2/3 w-2/3" />
    </div>
  );
}
