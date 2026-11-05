"use client";

import dynamic from "next/dynamic";
import { Boxes } from "lucide-react";

import { Header } from "@/components/configurator/header";
import { PartsCatalog } from "@/components/configurator/parts-catalog";
import { ConfigPanel } from "@/components/configurator/config-panel";
import { BomCart } from "@/components/configurator/bom-cart";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { Viewer3DSkeleton } from "@/components/configurator/viewer-3d";

// Three.js must mount client-side only — SSR would break the WebGL context.
const Viewer3D = dynamic(
  () =>
    import("@/components/configurator/viewer-3d").then((m) => m.Viewer3D),
  { ssr: false, loading: () => <Viewer3DSkeleton /> },
);

export default function HomePage() {
  const isMobile = useIsMobile();
  const direction = isMobile ? "vertical" : "horizontal";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />

      <main className="flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          key={direction}
          direction={direction}
          className="min-h-0 flex-1"
        >
          {/* LEFT — parts catalog */}
          <ResizablePanel
            defaultSize={isMobile ? 35 : 18}
            minSize={isMobile ? 20 : 12}
            maxSize={isMobile ? 60 : 32}
            className="bg-card"
          >
            <div className="h-full overflow-hidden rounded-r-md border-r">
              <PartsCatalog />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* CENTER — 3D viewer */}
          <ResizablePanel
            defaultSize={isMobile ? 45 : 55}
            minSize={isMobile ? 30 : 30}
            className="bg-[#0e0f12]"
          >
            <div className="relative h-full w-full">
              <Viewer3D />
              <ViewerOverlay />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT — configuration */}
          <ResizablePanel
            defaultSize={isMobile ? 30 : 27}
            minSize={isMobile ? 20 : 15}
            maxSize={isMobile ? 60 : 42}
            className="bg-card"
          >
            <div className="h-full overflow-hidden rounded-l-md border-l">
              <ConfigPanel />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* BOTTOM — BOM cart, sticky */}
      <div className="mt-auto">
        <BomCart />
      </div>
    </div>
  );
}

/** Small floating overlay with quick stats / branding in the viewer corner. */
function ViewerOverlay() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/40 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur">
      <Boxes className="size-3" />
      <span>Three.js · @react-three/fiber</span>
    </div>
  );
}
