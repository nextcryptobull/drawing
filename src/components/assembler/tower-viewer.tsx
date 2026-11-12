"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Grid, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Eye, EyeOff, Focus, Maximize2 } from "lucide-react";
import { toast } from "sonner";

import type { TowerConfig } from "@/lib/part-types";
import { ScaffoldTowerMesh } from "@/components/three/ScaffoldTowerMesh";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * Debounce a value by `delay` ms, comparing by JSON.
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

interface FocusTarget {
  name: string;
  pos: [number, number, number]; // tower coords (Z-up, mm)
  id?: string; // unique part ID for removal
  distance?: number; // custom focus distance (in world units). If omitted, uses camDist * 0.15
}

/**
 * CameraController — lives inside the Canvas, moves the camera when a part
 * is clicked. Transforms Z-up tower coords to Y-up world coords.
 */
function CameraController({
  focusTarget,
  resetCounter,
  scale,
  defaultCamPos,
  defaultTarget,
  camDist,
}: {
  focusTarget: FocusTarget | null;
  resetCounter: number;
  scale: number;
  defaultCamPos: [number, number, number];
  defaultTarget: [number, number, number];
  camDist: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Reset to default when resetCounter changes
  useEffect(() => {
    camera.position.set(defaultCamPos[0], defaultCamPos[1], defaultCamPos[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(defaultTarget[0], defaultTarget[1], defaultTarget[2]);
      controlsRef.current.update();
    }
  }, [resetCounter]);

  // Focus on a part when focusTarget changes
  useEffect(() => {
    if (!focusTarget || !controlsRef.current) return;

    // Transform tower coords (Z-up) to world coords (Y-up) after -90° X rotation
    // Rotation -π/2 around X: (x, y, z) → (x, z, -y)
    // Then apply scale
    const [tx, ty, tz] = focusTarget.pos;
    const worldX = tx * scale;
    const worldY = tz * scale; // old Z → new Y (up)
    const worldZ = -ty * scale; // old Y → new Z (depth, negated)

    // Move camera to be close to the target, slightly offset
    // Use custom distance if provided (for small parts like trapdoors),
    // otherwise scale with tower size.
    const focusDist = focusTarget.distance ?? Math.max(camDist * 0.15, 1.5);
    camera.position.set(
      worldX + focusDist * 0.5,
      worldY + focusDist * 0.3,
      worldZ + focusDist * 0.7,
    );
    controlsRef.current.target.set(worldX, worldY, worldZ);
    controlsRef.current.update();
  }, [focusTarget, scale, camera, camDist]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      enableDamping
      dampingFactor={0.08}
      minDistance={Math.max(camDist * 0.05, 0.5)}
      maxDistance={camDist * 6}
      maxPolarAngle={Math.PI * 0.49}
    />
  );
}

export function TowerViewer({ config, onRemovePart, removedParts }: { config: TowerConfig | null; onRemovePart?: (id: string) => void; removedParts?: Set<string> }) {
  const debounced = useDebouncedValue(config, 150);
  const [showGrid, setShowGrid] = useState(true);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const lastCamSig = useRef<string | null>(null);

  // Frame: tower bounding box in TOWER coords (mm). Returns absolute Z extents
  // (bottomZ, topZ) plus centerZ so the camera can frame the WHOLE tower
  // including base jacks/wheels and the handrails above the top platform.
  const frame = useMemo(() => {
    if (!debounced) {
      return { radius: 200, height: 200, centerZ: 100, bottomZ: 0, topZ: 200, towerX: 0, towerY: 0 };
    }
    const t = debounced;
    const sections = (t as { sections?: Array<{ bays: number; bay_length: number }> }).sections;
    const towerX = sections && sections.length > 0
      ? sections.reduce((s, sec) => s + sec.bays * sec.bay_length, 0)
      : t.bays_x * t.bay_length_x;
    const towerY = t.bays_y * t.bay_length_y;

    // bottomZ: -320 if wheel base, else -base_jack_length if jack, else 0
    const baseType = (t as { base_type?: string }).base_type;
    const isWheel = baseType === "wheel";
    const isJack = t.include_base_jacks || baseType === "jack" || baseType === undefined;
    const bottomZ = isWheel ? -320 : (isJack ? -t.base_jack_length : 0);

    // topZ: lift_height × num_lifts + spigot + plank (if any) + 1000 (handrails)
    const topZ = t.num_lifts * t.lift_height + t.spigot_length + (t.include_planks ? t.plank_thickness : 0) + 1000;

    const height = topZ - bottomZ;
    const r = Math.sqrt(towerX * towerX + towerY * towerY) / 2;
    return {
      radius: Math.max(r, 200),
      height,
      centerZ: (topZ + bottomZ) / 2,
      bottomZ,
      topZ,
      towerX,
      towerY,
    };
  }, [debounced]);

  const maxDim = Math.max(frame.radius * 2, frame.height);
  const scale = 6 / Math.max(maxDim, 1);

  // ─── Camera positioning (always computed so hooks are called
  // unconditionally — even when debounced is null. This prevents the
  // "Rendered fewer hooks than expected" React #300 error when the user
  // clears the dimension input.) ─────────────────────────────────────────
  // World axes: tower X → world X, tower Z → world Y (up), tower Y → world -Z.
  // So world-X bounds = towerX, world-Y bounds = height, world-Z bounds = towerY.
  const boundsX = frame.towerX * scale;
  const boundsZ = frame.towerY * scale;
  const boundsY = frame.height * scale;
  const diag = Math.sqrt(boundsX ** 2 + boundsY ** 2 + boundsZ ** 2);
  const halfDiag = diag / 2;
  // sin(22.5°) ≈ 0.383, 30% padding so tower never touches edges
  const camDist = Math.max((halfDiag / 0.383) * 1.3, 4);
  const centerWorldY = frame.centerZ * scale;
  const baseWorldY = frame.bottomZ * scale;
  const elevation = 8 * (Math.PI / 180); // ~8° for proper vertical centering
  const azimuth = 40 * (Math.PI / 180);
  const horiz = camDist * Math.cos(elevation);
  const defaultCamPos: [number, number, number] = [
    horiz * Math.cos(azimuth),
    centerWorldY + camDist * Math.sin(elevation),
    horiz * Math.sin(azimuth),
  ];
  const defaultTarget: [number, number, number] = [0, centerWorldY, 0];

  // Auto-reframe when scaffold dimensions change. Serialize the cam pos/target
  // to 3 decimal places so trivial floating-point drift doesn't trigger a
  // reframe. Only re-apply when the signature actually changes.
  const camSig = useMemo(() => {
    return JSON.stringify([
      defaultCamPos.map((v) => Math.round(v * 1000) / 1000),
      defaultTarget.map((v) => Math.round(v * 1000) / 1000),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  useEffect(() => {
    if (!debounced) return; // no-op when there's no tower to frame
    if (lastCamSig.current === camSig) return;
    lastCamSig.current = camSig;
    setResetCounter((c) => c + 1);
  }, [camSig, debounced]);

  if (!debounced) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
        <p className="text-sm text-white/50">Enter dimensions to see the tower</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Top-right buttons */}
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setResetCounter((c) => c + 1)}
          className="bg-black/60 text-white/90 hover:bg-black/80"
          title="Fit camera to the whole scaffold"
        >
          <Maximize2 className="mr-1.5 size-3.5" />
          Fit View
        </Button>
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

      {/* Quick-zoom buttons — bottom-left */}
      {debounced && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFocusTarget({ name: "Base / Wheels", pos: [0, 0, -300] })}
            className="bg-black/60 text-white/90 hover:bg-black/80"
          >
            <Focus className="mr-1 size-3" />
            Base
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFocusTarget({ name: "Rosette", pos: [0, 0, debounced.lift_height] })}
            className="bg-black/60 text-white/90 hover:bg-black/80"
          >
            <Focus className="mr-1 size-3" />
            Rosette
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // Focus on the trapdoor at bay 0 (first bay), top lift level.
              // Trapdoor is at bay 0's center X, at the staircase's Y face,
              // at the top platform level.
              const tX = debounced.bays_x * debounced.bay_length_x;
              const tY = debounced.bays_y * debounced.bay_length_y;
              const tH = debounced.num_lifts * debounced.lift_height;
              // Bay 0 center X = -towerX/2 + bay_length_x/2
              const trapX = -tX / 2 + debounced.bay_length_x / 2;
              // Trapdoor is at the staircase Y face (towerY/2 - 280 for primary)
              const trapY = tY / 2 - 280;
              // Top platform level
              const trapZ = tH;
              // Use a small custom distance so the camera zooms in close enough
              // to see the trapdoor (which is only ~2.5m × 0.6m)
              setFocusTarget({ name: "Trap door (bay 0, top level)", pos: [trapX, trapY, trapZ], distance: 0.5 });
            }}
            className="bg-black/60 text-white/90 hover:bg-black/80"
          >
            <Focus className="mr-1 size-3" />
            Trap Door
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFocusTarget({ name: "Handrails", pos: [0, 0, debounced.num_lifts * debounced.lift_height + 750] })}
            className="bg-black/60 text-white/90 hover:bg-black/80"
          >
            <Focus className="mr-1 size-3" />
            Handrails
          </Button>

          {/* Staircase 1 focus button — shown when primary staircase is present.
              Primary staircase is present when include_ladder is true OR when
              secondary_access auto-triggers (the primary is the main access,
              secondary is the escape — both render together). */}
          {((debounced as { include_ladder?: boolean }).include_ladder ||
            (debounced as { secondary_access?: boolean }).secondary_access) && (() => {
            const tY = debounced.bays_y * debounced.bay_length_y;
            const tH = debounced.num_lifts * debounced.lift_height;
            // Staircase midpoint = bay 0 center in X, middle of tower height in Z
            const tX = debounced.bays_x * debounced.bay_length_x;
            const ladderX = -tX / 2 + debounced.bay_length_x / 2;
            // yFace = towerY/2 - railOffset(200) - margin(80) = towerY/2 - 280
            // (keeps both stringers inside the scaffold frame)
            const ladderY = tY / 2 - 280;
            return (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFocusTarget({ name: "Primary staircase", pos: [ladderX, ladderY, tH / 2] })}
                className="bg-yellow-600/70 text-white hover:bg-yellow-600"
              >
                <Focus className="mr-1 size-3" />
                Staircase 1
              </Button>
            );
          })()}

          {/* Ladder 2 focus button — shown only when secondary access is enabled */}
          {(debounced as { secondary_access?: boolean }).secondary_access && (() => {
            const tY = debounced.bays_y * debounced.bay_length_y;
            const tH = debounced.num_lifts * debounced.lift_height;
            const tX = debounced.bays_x * debounced.bay_length_x;
            // Last bay center
            const ladderX = tX / 2 - debounced.bay_length_x / 2;
            // Secondary starts on -Y, same offset: -(towerY/2 - 280)
            const ladderY = -(tY / 2 - 280);
            return (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFocusTarget({ name: "Secondary staircase (escape)", pos: [ladderX, ladderY, tH / 2] })}
                className="bg-orange-600/70 text-white hover:bg-orange-600"
              >
                <Focus className="mr-1 size-3" />
                Staircase 2
              </Button>
            );
          })()}
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: defaultCamPos, fov: 45, near: 0.1, far: 5000 }}
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
        <directionalLight position={[-camDist, -camDist * 0.4, camDist * 0.6]} intensity={0.4} />

        <Suspense fallback={null}>
          <Environment preset="warehouse" />
        </Suspense>

        {/* Grid — positioned at scaffold base so the tower sits ON the grid */}
        {showGrid && (
          <Grid
            args={[Math.max(boundsX * 4, 40), Math.max(boundsZ * 4, 40)]}
            position={[0, baseWorldY, 0]}
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

        {/* Tower: rotated -90° around X so Z-up becomes Y-up */}
        <group scale={scale} rotation={[-Math.PI / 2, 0, 0]}>
          <group position={[0, 0, 0]}>
            <Suspense fallback={<FallbackCube />}>
              <ScaffoldTowerMesh
                config={debounced}
                removedParts={removedParts}
                onPartClick={(name, pos, id) => {
                  setFocusTarget({ name, pos, id });
                }}
                onRemovePart={onRemovePart}
              />
            </Suspense>
          </group>
        </group>

        {/* Camera controller — handles focus + reset, with camDist-aware min/max zoom */}
        <CameraController
          focusTarget={focusTarget}
          resetCounter={resetCounter}
          scale={scale}
          defaultCamPos={defaultCamPos}
          defaultTarget={defaultTarget}
          camDist={camDist}
        />

        {/* Axis gizmo — bottom-right corner */}
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={["#ff6b6b", "#3ddc97", "#5d9ce8"]} labelColor="white" />
        </GizmoHelper>
      </Canvas>

      {/* Overlay: dimensions + focused part */}
      <div className="absolute left-4 top-4 rounded-md bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur">
        <div className="font-semibold">
          {debounced.bays_x}×{debounced.bays_y} bays · {debounced.num_lifts} lifts
        </div>
        <div className="mt-0.5 text-white/60">
          {(debounced.bays_x * debounced.bay_length_x / 1000).toFixed(2)}m ×{" "}
          {(debounced.bays_y * debounced.bay_length_y / 1000).toFixed(2)}m ×{" "}
          {((debounced.num_lifts * debounced.lift_height) / 1000).toFixed(2)}m
        </div>
        <div className="mt-0.5 text-white/40">
          scale: 1u = {Math.round(1 / scale)} mm · click parts to focus · orbit / scroll to inspect
        </div>
        {focusTarget && (
          <div className="mt-1.5 flex items-center gap-2 rounded bg-primary/20 px-2 py-1">
            <Focus className="size-3 text-primary" />
            <span className="font-medium text-primary">{focusTarget.name}</span>
            {onRemovePart && focusTarget.id && (
              <button
                type="button"
                onClick={() => {
                  onRemovePart(focusTarget.id!);
                  toast.success("Part removed", { description: focusTarget.name });
                  setFocusTarget(null);
                }}
                className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FallbackCube() {
  return (
    <mesh position={[0, 0, 1]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#444" wireframe />
    </mesh>
  );
}

export function TowerViewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
      <Skeleton className="h-2/3 w-2/3" />
    </div>
  );
}
