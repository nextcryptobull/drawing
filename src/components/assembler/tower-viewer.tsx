"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, OrbitControls } from "@react-three/drei";
import { Grid3x3, Eye, EyeOff } from "lucide-react";

import type { TowerConfig } from "@/lib/part-types";
import { ScaffoldTowerMesh } from "@/components/three/ScaffoldTowerMesh";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

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

export function TowerViewer({ config }: { config: TowerConfig | null }) {
  const debounced = useDebouncedValue(config, 150);
  const [showGrid, setShowGrid] = useState(true);

  // Compute the framing for the tower
  const frame = useMemo(() => {
    if (!debounced) return { radius: 200, height: 200, centerZ: 100 };
    const t = debounced;
    const tw = t.bays_x * t.bay_length_x;
    const td = t.bays_y * t.bay_length_y;
    const bottomZ = t.include_base_jacks ? -t.base_jack_length : 0;
    const topZ =
      t.num_lifts * t.lift_height +
      t.spigot_length +
      (t.include_planks ? t.plank_thickness : 0);
    const th = topZ - bottomZ;
    const r = Math.sqrt(tw * tw + td * td) / 2;
    return {
      radius: Math.max(r, 200),
      height: Math.max(th, 200),
      centerZ: (topZ + bottomZ) / 2,
    };
  }, [debounced]);

  const maxDim = Math.max(frame.radius * 2, frame.height);
  const scale = 6 / Math.max(maxDim, 1);

  if (!debounced) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
        <p className="text-sm text-white/50">Enter dimensions to see the tower</p>
      </div>
    );
  }

  // Position camera so the tower appears STANDING UP (vertical, not laying down)
  // Three.js default is Y-up. After rotating the tower group -90° around X,
  // the tower's Z (height) becomes Y. So we frame using Y as the vertical.
  const towerHeightScaled = frame.height * scale;
  const towerRadiusScaled = frame.radius * scale;

  // Camera distance: enough to see the full tower height
  const camDist = Math.max(towerHeightScaled * 1.2, towerRadiusScaled * 3, 12);

  // Camera position: front-right-above (in Y-up space)
  const camX = camDist * 0.7;        // right
  const camY = towerHeightScaled * 0.6 + camDist * 0.3;  // up (above midpoint)
  const camZ = camDist * 0.7;        // front

  // OrbitControls target: tower's vertical midpoint (Y is up after rotation)
  const targetY = towerHeightScaled * 0.5;

  return (
    <div className="relative h-full w-full">
      {/* Grid toggle button — top-right corner */}
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowGrid(!showGrid)}
          className="bg-black/60 text-white/90 hover:bg-black/80"
        >
          {showGrid ? (
            <>
              <EyeOff className="mr-1.5 size-3.5" />
              Hide Grid
            </>
          ) : (
            <>
              <Eye className="mr-1.5 size-3.5" />
              Show Grid
            </>
          )}
        </Button>
      </div>

      <Canvas
        shadows
        camera={{
          position: [camX, camY, camZ],
          fov: 45,
          near: 0.1,
          far: 5000,
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#0e0f12"]} />
        <fog attach="fog" args={["#0e0f12", camDist * 1.5, camDist * 4]} />

        <ambientLight intensity={0.4} />
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
        <directionalLight
          position={[-camDist, -camDist * 0.4, camDist * 0.6]}
          intensity={0.4}
        />

        <Suspense fallback={null}>
          <Environment preset="warehouse" />
        </Suspense>

        {/* Floor grid — toggleable */}
        {showGrid && (
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
        )}

        {/* The tower, scaled to "viewing units" */}
        {/* Rotate -90° around X so Z-up geometry appears Y-up (three.js default) */}
        <group scale={scale} rotation={[-Math.PI / 2, 0, 0]}>
          <group position={[0, 0, 0]}>
            <Suspense fallback={<FallbackCube />}>
              <ScaffoldTowerMesh config={debounced} />
            </Suspense>
          </group>
        </group>

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={Math.max(camDist * 4, 30)}
          maxPolarAngle={Math.PI * 0.49}
          target={[0, targetY, 0]}
        />
      </Canvas>

      {/* Overlay: dimensions + scale */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        <div className="font-semibold">
          {debounced.bays_x}×{debounced.bays_y} bays · {debounced.num_lifts} lifts
        </div>
        <div className="mt-0.5 text-white/60">
          {(debounced.bays_x * debounced.bay_length_x / 1000).toFixed(2)}m ×{" "}
          {(debounced.bays_y * debounced.bay_length_y / 1000).toFixed(2)}m ×{" "}
          {((debounced.num_lifts * debounced.lift_height) / 1000).toFixed(2)}m
        </div>
        <div className="mt-0.5 text-white/40">
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
export function TowerViewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
      <Skeleton className="h-2/3 w-2/3" />
    </div>
  );
}
