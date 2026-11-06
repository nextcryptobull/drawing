"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  ArrowRight,
  Boxes,
  Download,
  Layers,
  Loader2,
  Ruler,
  Settings2,
  Zap,
} from "lucide-react";

import {
  parseDimensions,
  assembleTower,
  assemblyToTowerConfig,
  formatDimensions,
  TOWER_PRESETS,
} from "@/lib/tower-assembler";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

// Three.js must mount client-side only — SSR would break the WebGL context.
const TowerViewer = dynamic(
  () =>
    import("@/components/assembler/tower-viewer").then((m) => m.TowerViewer),
  { ssr: false, loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0f12]">
      <p className="text-sm text-white/50">Loading 3D viewer...</p>
    </div>
  ) },
);

export function TowerAssembler() {
  const [input, setInput] = useState("2x2x6m");
  const [downloading, setDownloading] = useState(false);

  // Parse and assemble as user types
  const result = useMemo(() => {
    const dims = parseDimensions(input);
    if (!dims) return null;
    return assembleTower(dims);
  }, [input]);

  // Generate the TowerConfig for the 3D viewer (null if input invalid)
  const towerConfig = useMemo(() => {
    if (!result) return null;
    return assemblyToTowerConfig(result);
  }, [result]);

  async function handleDownloadStep() {
    if (!result) {
      toast.error("Invalid dimensions", {
        description: "Enter dimensions like '2x2x6m' or '2570x2000x6000mm'",
      });
      return;
    }

    setDownloading(true);
    try {
      const config = assemblyToTowerConfig(result);
      const res = await fetch("/api/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const heightM = Math.round(result.actualDimensions.height / 1000);
      const fileName = `tower_${result.config.bays_x}x${result.config.bays_y}_${heightM}m_${Date.now()}.step`;
      triggerDownload(blob, fileName);

      toast.success("STEP file generated", {
        description: `${(blob.size / 1024).toFixed(0)} KB · ${formatDimensions(result.actualDimensions)}`,
      });
    } catch (err) {
      toast.error("STEP generation failed", {
        description: (err as Error).message,
      });
    } finally {
      setDownloading(false);
    }
  }

  const inputValid = result !== null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="size-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            Scaffold Tower Assembler
          </h1>
          <span className="ml-auto text-xs text-muted-foreground">
            Enter dimensions → preview 3D → export STEP
          </span>
        </div>
      </div>

      {/* Main content: 3D viewer (left) + form (right) */}
      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* LEFT — 3D viewer */}
          <ResizablePanel
            defaultSize={55}
            minSize={35}
            className="bg-[#0e0f12]"
          >
            <div className="relative h-full w-full">
              <TowerViewer config={towerConfig} />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT — form + BOM */}
          <ResizablePanel
            defaultSize={45}
            minSize={30}
            maxSize={70}
            className="bg-card"
          >
            <div className="h-full overflow-hidden border-l">
              <ScrollArea className="min-h-0 h-full">
                <div className="space-y-4 p-5">
                  {/* Input section */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Ruler className="size-4" />
                        Tower Dimensions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="dimensions" className="text-xs text-muted-foreground">
                          Length × Width × Height
                        </Label>
                        <Input
                          id="dimensions"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="e.g. 2x2x6m  or  2570x2000x6000mm"
                          className="font-mono text-base"
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: <code className="rounded bg-muted px-1">LxWxH</code> + unit
                          (m, mm, cm, ft). Example: <code className="rounded bg-muted px-1">2.5x2x6m</code>
                        </p>
                      </div>

                      {/* Quick presets */}
                      <div>
                        <Label className="mb-1.5 block text-xs text-muted-foreground">
                          Quick presets
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {TOWER_PRESETS.map((preset) => (
                            <TooltipProvider key={preset.input} delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setInput(preset.input)}
                                    className={cn(
                                      "h-auto py-1 text-xs",
                                      input === preset.input && "border-primary bg-accent",
                                    )}
                                  >
                                    <Zap className="mr-1 size-3" />
                                    {preset.label}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <div className="text-xs">
                                    <div className="font-mono font-semibold">{preset.input}</div>
                                    <div className="text-muted-foreground">{preset.description}</div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Results section */}
                  {result ? (
                    <>
                      {/* Assembly summary */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Layers className="size-4" />
                            Assembly Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <StatBox
                              label="Actual size"
                              value={formatDimensions(result.actualDimensions)}
                              hint={`Requested: ${formatDimensions({
                                length: result.input.requestedLength,
                                width: result.input.requestedWidth,
                                height: result.input.requestedHeight,
                              })}`}
                            />
                            <StatBox
                              label="Bay config"
                              value={`${result.config.bays_x}×${result.config.bays_y} bays`}
                              hint={`${result.config.bay_length_x}×${result.config.bay_length_y}mm`}
                            />
                            <StatBox
                              label="Lifts"
                              value={`${result.config.num_lifts} × ${result.config.lift_height}mm`}
                              hint={`${result.actualDimensions.height}mm total`}
                            />
                            <StatBox
                              label="Est. weight"
                              value={`${result.bom.estimated_weight_kg} kg`}
                              hint={`${result.bom.total_parts} parts total`}
                            />
                          </div>

                          {result.warnings.length > 0 && (
                            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5">
                              <div className="text-xs font-medium text-yellow-600 dark:text-yellow-500">
                                Adjustments made:
                              </div>
                              <ul className="mt-1 space-y-0.5">
                                {result.warnings.map((w, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">
                                    • {w}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* BOM */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Settings2 className="size-4" />
                            Bill of Materials
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-1 gap-1.5">
                            <BomItem label="Standards (vertical tubes)" count={result.bom.standards} unit="pcs" />
                            <BomItem label="Ledgers (horizontal)" count={result.bom.ledgers} unit="pcs" />
                            <BomItem label="Diagonal braces" count={result.bom.braces} unit="pcs" />
                            <BomItem label="Base jacks" count={result.bom.base_jacks} unit="pcs" />
                            <BomItem label="Rosettes" count={result.bom.rosettes} unit="pcs" />
                            <BomItem label="Steel planks (top)" count={result.bom.planks} unit="pcs" />
                          </div>
                          <div className="flex items-center justify-between border-t pt-2">
                            <span className="text-sm font-medium">Total parts</span>
                            <Badge variant="secondary" className="font-mono">
                              {result.bom.total_parts} pcs
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {/* CTA */}
                      <Card className="border-primary/30 bg-primary/5">
                        <CardContent className="py-3">
                          <div className="mb-2">
                            <div className="text-sm font-semibold">
                              Ready to export
                            </div>
                            <div className="text-xs text-muted-foreground">
                              STEP file with all {result.bom.total_parts} parts · opens in SolidWorks, Inventor, Fusion 360
                            </div>
                          </div>
                          <Button
                            onClick={handleDownloadStep}
                            disabled={downloading}
                            className="w-full"
                            size="lg"
                          >
                            {downloading ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Generating STEP...
                              </>
                            ) : (
                              <>
                                <Download className="mr-2 size-4" />
                                Export STEP File
                                <ArrowRight className="ml-2 size-4" />
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center">
                        <Ruler className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          Enter dimensions above to assemble a tower
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          Format: <code className="rounded bg-muted px-1">2x2x6m</code> or
                          {" "}<code className="rounded bg-muted px-1">2570x2000x6000mm</code>
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatBox({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</div>
      )}
    </div>
  );
}

function BomItem({
  label,
  count,
  unit,
}: {
  label: string;
  count: number;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold">
        {count} <span className="text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
