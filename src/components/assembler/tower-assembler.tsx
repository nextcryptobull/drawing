"use client";

import { useState, useMemo } from "react";
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
import { cn } from "@/lib/utils";

export function TowerAssembler() {
  const [input, setInput] = useState("2x2x6m");
  const [downloading, setDownloading] = useState(false);

  // Parse and assemble as user types
  const result = useMemo(() => {
    const dims = parseDimensions(input);
    if (!dims) return null;
    return assembleTower(dims);
  }, [input]);

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Boxes className="size-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            Scaffold Tower Assembler
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter dimensions — the app assembles the tower and exports STEP for
          SolidWorks, Inventor, or Fusion 360.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          {/* Input section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Ruler className="size-4" />
                Tower Dimensions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dimensions" className="text-xs text-muted-foreground">
                  Length × Width × Height
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="dimensions"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. 2x2x6m  or  2570x2000x6000mm"
                    className="font-mono text-base"
                    autoComplete="off"
                  />
                  <Button
                    onClick={handleDownloadStep}
                    disabled={!inputValid || downloading}
                    className="min-w-[160px]"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 size-4" />
                        Export STEP
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: <code className="rounded bg-muted px-1">LxWxH</code> + unit
                  (m, mm, cm, ft). Example: <code className="rounded bg-muted px-1">2.5x2x6m</code>
                </p>
              </div>

              {/* Quick presets */}
              <div>
                <Label className="mb-2 block text-xs text-muted-foreground">
                  Quick presets
                </Label>
                <div className="flex flex-wrap gap-2">
                  {TOWER_PRESETS.map((preset) => (
                    <TooltipProvider key={preset.input} delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInput(preset.input)}
                            className={cn(
                              "h-auto py-1.5 text-xs",
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers className="size-4" />
                    Assembly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                      hint={`${result.actualDimensions.height}mm total height`}
                    />
                    <StatBox
                      label="Est. weight"
                      value={`${result.bom.estimated_weight_kg} kg`}
                      hint={`${result.bom.total_parts} parts total`}
                    />
                  </div>

                  {result.warnings.length > 0 && (
                    <div className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4" />
                    Bill of Materials
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <BomItem label="Standards (vertical tubes)" count={result.bom.standards} unit="pcs" />
                    <BomItem label="Ledgers (horizontal)" count={result.bom.ledgers} unit="pcs" />
                    <BomItem label="Diagonal braces" count={result.bom.braces} unit="pcs" />
                    <BomItem label="Base jacks" count={result.bom.base_jacks} unit="pcs" />
                    <BomItem label="Rosettes" count={result.bom.rosettes} unit="pcs" />
                    <BomItem label="Steel planks (top)" count={result.bom.planks} unit="pcs" />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium">Total parts</span>
                    <Badge variant="secondary" className="font-mono">
                      {result.bom.total_parts} pcs
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* CTA */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <div className="text-sm font-semibold">
                      Ready to export
                    </div>
                    <div className="text-xs text-muted-foreground">
                      STEP file with all {result.bom.total_parts} parts assembled · opens in SolidWorks, Inventor, Fusion 360
                    </div>
                  </div>
                  <Button
                    onClick={handleDownloadStep}
                    disabled={downloading}
                    size="lg"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Generating STEP...
                      </>
                    ) : (
                      <>
                        Export STEP
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Ruler className="mx-auto mb-3 size-8 text-muted-foreground/50" />
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
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
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
    <div className="flex items-center justify-between rounded-md border bg-card p-3">
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
