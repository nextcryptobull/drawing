"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  ArrowRight,
  Boxes,
  Download,
  FileText,
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Settings2,
  Sliders,
  Undo2,
  Zap,
} from "lucide-react";

import {
  parseDimensions,
  assembleTower,
  assemblyToTowerConfig,
  formatDimensions,
  TOWER_PRESETS,
  CATALOG_LEDGER_LENGTHS,
  parseScaffoldRequest,
  type BayConfig,
} from "@/lib/tower-assembler";
import { generateBomPdf } from "@/lib/generate-bom-pdf";

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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [overrides, setOverrides] = useState<Partial<BayConfig>>({});
  const [removedParts, setRemovedParts] = useState<Set<string>>(new Set());
  const [requestText, setRequestText] = useState("");

  /** Parse the natural-language scaffold request and apply it */
  function handleParseRequest() {
    const parsed = parseScaffoldRequest(requestText);
    if (!parsed) {
      toast.error("Could not parse request", {
        description: "Format: '17 baies de 2.5x2x8m, 2 accès 2.5x2x8m, ...'",
      });
      return;
    }
    // Set the dimension input from the parsed height + width
    // Use a simple "1xWxH" format — the actual bays come from sections override
    const h = (parsed.height / 1000).toString();
    const w = (parsed.width / 1000).toString();
    setInput(`1x${w}x${h}m`);
    // Merge sections into overrides (sections is a separate field in the parsed result)
    setOverrides({
      ...parsed.overrides,
      sections: parsed.sections,
      staircase_tower: parsed.overrides.staircase_tower ?? false,
      staircase_type: parsed.overrides.staircase_type ?? "ladder",
    });
    if (parsed.parseWarnings.length > 0) {
      toast.success("Request parsed with warnings", {
        description: parsed.parseWarnings.join("; "),
      });
    } else {
      const totalBays = parsed.sections.reduce((s, sec) => s + sec.bays, 0);
      const totalLen = parsed.sections.reduce((s, sec) => s + sec.bays * sec.bay_length, 0);
      toast.success("Request parsed", {
        description: `${parsed.sections.length} sections, ${totalBays} bays, ${(totalLen / 1000).toFixed(2)}m total`,
      });
    }
  }

  // Parse and assemble as user types — applies overrides on top of parsed dims
  const result = useMemo(() => {
    const dims = parseDimensions(input);
    if (!dims) return null;
    return assembleTower(dims, overrides);
  }, [input, overrides]);

  // Generate the TowerConfig for the 3D viewer (null if input invalid)
  const towerConfig = useMemo(() => {
    if (!result) return null;
    return assemblyToTowerConfig(result);
  }, [result]);

  /**
   * Generate a comprehensive BOM PDF (with Madacan logo, full BOM table,
   * totals, page numbers). Runs entirely client-side via jsPDF.
   */
  async function handleDownloadPdf() {
    if (!result) {
      toast.error("Invalid dimensions", {
        description: "Enter dimensions like '2x2x6m' or '2570x2000x6000mm'",
      });
      return;
    }

    setDownloadingPdf(true);
    try {
      await generateBomPdf(result);
      toast.success("BOM PDF generated", {
        description: `${result.bom.total_parts} parts · ${result.bom.estimated_weight_kg.toLocaleString()} kg · ${formatDimensions(result.actualDimensions)}`,
      });
    } catch (err) {
      toast.error("PDF generation failed", {
        description: (err as Error).message,
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

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

  /**
   * Update the tower config via overrides — this lets the stepper controls
   * (bays_x, bays_y, num_lifts, etc.) directly modify the tower without
   * rewriting the dimension string.
   */
  function updateFromConfig(patch: Partial<BayConfig>) {
    setOverrides((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="border-b px-4 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2">
          {/* Madacan logo — links to home */}
          <img
            src="/madacan-logo.png"
            alt="Madacan"
            width={32}
            height={36}
            className="h-8 w-auto shrink-0 sm:h-9"
          />
          <Boxes className="size-5 text-primary" />
          <h1 className="text-base font-semibold tracking-tight sm:text-lg">
            Scaffold Tower BOM Estimator
          </h1>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Quick field BOM &amp; tonnage — not for drawing details
        </p>
        {removedParts.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setRemovedParts(new Set());
              toast.success("All parts restored");
            }}
            className="mt-1 flex items-center gap-1 rounded bg-orange-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-orange-700"
          >
            <Undo2 className="size-3" />
            Restore {removedParts.size} removed {removedParts.size === 1 ? "part" : "parts"}
          </button>
        )}
      </div>

      {/* Main content: 3D viewer + form */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* 3D viewer — full width on mobile, left half on desktop */}
        <div className="h-[40vh] min-h-[250px] bg-[#0e0f12] sm:h-auto sm:flex-1">
          <div className="relative h-full w-full">
            <TowerViewer
              config={towerConfig}
              removedParts={removedParts}
              onRemovePart={(id) => {
                setRemovedParts((prev) => new Set(prev).add(id));
              }}
            />
          </div>
        </div>

        {/* Form + BOM — below viewer on mobile, right half on desktop */}
        <div className="min-h-0 flex-1 border-t bg-card sm:border-l sm:border-t-0">
          <ScrollArea className="h-full max-h-[60vh] sm:max-h-none">
            <div className="space-y-4 p-4 sm:p-5">
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

                  {/* Multi-section text request */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Multi-section request (text)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={requestText}
                        onChange={(e) => setRequestText(e.target.value)}
                        placeholder="17 baies de 2.5x2x8m, 2 accès 2.5x2x8m, 1 accès staircase 2.13x2x8m"
                        className="font-mono text-xs"
                        autoComplete="off"
                      />
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleParseRequest}
                        disabled={!requestText.trim()}
                        className="shrink-0"
                      >
                        <Zap className="mr-1 size-3" />
                        Parse
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Keywords: <code className="rounded bg-muted px-1">baies</code> (bays),
                      <code className="rounded bg-muted px-1">accès</code> (access),
                      <code className="rounded bg-muted px-1">staircase</code>,
                      <code className="rounded bg-muted px-1">renforcée</code>,
                      <code className="rounded bg-muted px-1">porte</code> (door)
                    </p>
                  </div>

                      {/* Quick presets */}
                      <div>
                        <Label className="mb-1.5 block text-xs text-muted-foreground">
                          Quick presets
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {TOWER_PRESETS.map((preset) => (
                            <TooltipProvider key={preset.label} delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setInput(preset.input);
                                      const p = preset as {
                                        sections?: Array<{ bays: number; bay_length: number }>;
                                        staircase_type?: "ladder" | "stairs";
                                        include_ladder?: boolean;
                                        staircase_tower?: boolean;
                                      };
                                      setOverrides((prev) => {
                                        const { sections: _omit, ...rest } = prev;
                                        void _omit;
                                        return {
                                          ...rest,
                                          // Clear sections unless the preset provides them
                                          ...(p.sections && p.sections.length > 0 ? { sections: p.sections } : {}),
                                          // Reset staircase_tower: true only if preset sets it, otherwise false
                                          staircase_tower: p.staircase_tower ?? false,
                                          // Reset staircase_type: stairs only if preset sets it, otherwise ladder
                                          staircase_type: p.staircase_type ?? "ladder",
                                          // include_ladder: only override if preset specifies it
                                          ...(p.include_ladder != null ? { include_ladder: p.include_ladder } : {}),
                                        };
                                      });
                                    }}
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
                              value={`${(result.bom.estimated_weight_kg / 1000).toFixed(2)} t`}
                              hint={`${result.bom.estimated_weight_kg.toLocaleString()} kg · ${result.bom.total_parts} parts`}
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

                      {/* Advanced controls — adjust bays, lifts, options */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Sliders className="size-4" />
                            Adjust Design
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Bays X / Bay length X — OR sections editor */}
                          {overrides.sections && overrides.sections.length > 0 ? (
                            <div className="space-y-2">
                              {overrides.sections.map((sec, idx) => (
                                <div key={idx} className={cn("flex items-center gap-2 rounded border p-2",
                                  idx === 0 ? "border-yellow-500/40 bg-yellow-500/5" : "border-border")}>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      {idx === 0 ? (
                                        <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">ACCESS</span>
                                      ) : (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">FILLER {idx}</span>
                                      )}
                                      <span className="text-[10px] text-muted-foreground">{sec.bays}×{(sec.bay_length / 1000).toFixed(2)}m</span>
                                    </div>
                                    <StepperRow label="Bays" value={sec.bays} min={1} max={50}
                                      onChange={(v) => { const secs = [...overrides.sections!]; secs[idx] = { ...secs[idx], bays: v }; updateFromConfig({ sections: secs }); }} />
                                    <StepperRow label="Bay length (mm)" value={sec.bay_length} min={1000} max={3000} step={500}
                                      onChange={(v) => { const secs = [...overrides.sections!]; secs[idx] = { ...secs[idx], bay_length: v }; updateFromConfig({ sections: secs }); }} />
                                  </div>
                                  <Button variant="ghost" size="sm" className="size-7 shrink-0 p-0 text-red-500 hover:bg-red-500/10"
                                    onClick={() => { const secs = overrides.sections!.filter((_, i) => i !== idx); updateFromConfig({ sections: secs.length > 0 ? secs : undefined }); }}
                                    disabled={overrides.sections!.length <= 1}>
                                    <Minus className="size-3" />
                                  </Button>
                                </div>
                              ))}

                              {/* Quick-add filler buttons — one per catalog ledger length */}
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <span className="self-center text-[10px] text-muted-foreground">Add filler:</span>
                                {CATALOG_LEDGER_LENGTHS.map((cat) => (
                                  <Button
                                    key={cat.code}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs font-mono"
                                    title={`${cat.code}  →  adds 1 bay × ${(cat.length / 1000).toFixed(2)}m`}
                                    onClick={() => {
                                      const secs = [...overrides.sections!, { bays: 1, bay_length: cat.length }];
                                      updateFromConfig({ sections: secs });
                                    }}
                                  >
                                    {(cat.length / 1000).toFixed(2)}m
                                  </Button>
                                ))}
                              </div>

                              <div className="flex items-center justify-between border-t pt-2">
                                <span className="text-xs text-muted-foreground">
                                  Total: {overrides.sections.reduce((s, sec) => s + sec.bays, 0)} bays ·{" "}
                                  {(overrides.sections.reduce((s, sec) => s + sec.bays * sec.bay_length, 0) / 1000).toFixed(2)}m
                                </span>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                                  onClick={() => { setOverrides((prev) => { const { sections: _s, ...rest } = prev; void _s; return rest; }); }}>
                                  Reset to single
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Bays X */}
                              <StepperRow
                                label="Bays in X (length)"
                                value={result.config.bays_x}
                                min={1}
                                max={50}
                                onChange={(v) => updateFromConfig({ bays_x: v })}
                              />
                              {/* Bay length X */}
                              <StepperRow
                                label="Bay length X (mm)"
                                value={result.config.bay_length_x}
                                min={1000}
                                max={3000}
                                step={500}
                                onChange={(v) => updateFromConfig({ bay_length_x: v })}
                              />
                            </>
                          )}

                          {/* Button to switch to sections mode */}
                          {(!overrides.sections || overrides.sections.length === 0) && (
                            <Button variant="outline" size="sm" className="h-7 w-full text-xs"
                              onClick={() => updateFromConfig({ sections: [{ bays: result.config.bays_x, bay_length: result.config.bay_length_x }] })}>
                              Use mixed sections
                            </Button>
                          )}

                          {/* Bays Y */}
                          <StepperRow
                            label="Bays in Y (width)"
                            value={result.config.bays_y}
                            min={1}
                            max={20}
                            onChange={(v) => updateFromConfig({ bays_y: v })}
                          />
                          {/* Lifts */}
                          <StepperRow
                            label="Lifts (levels)"
                            value={result.config.num_lifts}
                            min={1}
                            max={30}
                            onChange={(v) => updateFromConfig({ num_lifts: v })}
                          />
                          {/* Bay length Y */}
                          <StepperRow
                            label="Bay length Y (mm)"
                            value={result.config.bay_length_y}
                            min={1000}
                            max={3000}
                            step={500}
                            onChange={(v) => updateFromConfig({ bay_length_y: v })}
                          />
                          {/* Lift height */}
                          <StepperRow
                            label="Lift height (mm)"
                            value={result.config.lift_height}
                            min={1000}
                            max={2500}
                            step={500}
                            onChange={(v) => updateFromConfig({ lift_height: v })}
                          />

                          {/* Divider */}
                          <div className="border-t pt-2" />

                          {/* Base type: jack or wheel */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Base type</span>
                            <div className="flex gap-1">
                              <Button
                                variant={result.config.base_type === "jack" ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ base_type: "jack" })}
                              >
                                Jack
                              </Button>
                              <Button
                                variant={result.config.base_type === "wheel" ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ base_type: "wheel" })}
                              >
                                Wheel
                              </Button>
                            </div>
                          </div>

                          {/* Plank width toggle: 320 (heavy-duty) / 230 (light) */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Plank width</span>
                            <div className="flex gap-1">
                              <Button
                                variant={result.config.plank_width === 320 ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ plank_width: 320 })}
                              >
                                320 mm
                              </Button>
                              <Button
                                variant={result.config.plank_width === 230 ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ plank_width: 230 })}
                              >
                                230 mm
                              </Button>
                            </div>
                          </div>

                          {/* Toggles: gratings, toeboards, braces */}
                          <ToggleRow
                            label="Grating platforms"
                            checked={result.config.include_gratings}
                            onChange={(v) => updateFromConfig({ include_gratings: v })}
                          />
                          <ToggleRow
                            label="Toeboards"
                            checked={result.config.include_toeboards}
                            onChange={(v) => updateFromConfig({ include_toeboards: v })}
                          />
                          <ToggleRow
                            label="Diagonal braces"
                            checked={result.config.include_braces}
                            onChange={(v) => updateFromConfig({ include_braces: v })}
                          />

                          {/* Divider */}
                          <div className="border-t pt-2" />

                          {/* Per-level platform toggles */}
                          <div className="text-xs font-medium text-muted-foreground">Platform levels</div>
                          {Array.from({ length: result.config.num_lifts }).map((_, idx) => {
                            const levelNum = idx + 1;
                            const isDisabled = result.config.disabled_platform_levels.includes(levelNum);
                            return (
                              <ToggleRow
                                key={`platform-L${levelNum}`}
                                label={`Platform at L${levelNum} (${(levelNum * result.config.lift_height / 1000).toFixed(1)}m)`}
                                checked={!isDisabled}
                                onChange={(v) => {
                                  const current = result.config.disabled_platform_levels;
                                  const newDisabled = v
                                    ? current.filter(l => l !== levelNum)
                                    : [...current, levelNum];
                                  updateFromConfig({ disabled_platform_levels: newDisabled });
                                }}
                              />
                            );
                          })}

                          {/* Ladder toggle (primary, yellow, inside access bay) */}
                          <ToggleRow
                            label="Ladder (access side)"
                            checked={result.config.include_ladder}
                            onChange={(v) => updateFromConfig({ include_ladder: v })}
                          />

                          {/* Staircase type toggle: Stairs (flat treads) / Ladder (15° inclined) */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Staircase type</span>
                            <div className="flex gap-1">
                              <Button
                                variant={result.config.staircase_type === "stairs" ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ staircase_type: "stairs" })}
                              >
                                Stairs
                              </Button>
                              <Button
                                variant={result.config.staircase_type === "ladder" ? "default" : "outline"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateFromConfig({ staircase_type: "ladder" })}
                              >
                                Ladder
                              </Button>
                            </div>
                          </div>

                          {/* Secondary access toggle (auto at ≥20m height/length) */}
                          <ToggleRow
                            label={(() => {
                              const h = result.config.num_lifts * result.config.lift_height;
                              const len = result.config.bays_x * result.config.bay_length_x;
                              if (h >= 20000 && len >= 20000) return "Secondary access (auto: height+length ≥20m)";
                              if (h >= 20000) return "Secondary access (auto: height ≥20m)";
                              if (len >= 20000) return "Secondary access (auto: length ≥20m)";
                              return "Secondary access (escape ladder)";
                            })()}
                            checked={result.config.secondary_access}
                            onChange={(v) => updateFromConfig({ secondary_access: v })}
                          />

                          {/* Divider */}
                          <div className="border-t pt-2" />

                          {/* Door opening (walk-through passage in scaffold frame) */}
                          <ToggleRow
                            label="Door opening (entry/exit passage)"
                            checked={!!overrides.door_opening}
                            onChange={(v) => {
                              if (v) {
                                updateFromConfig({
                                  door_opening: { bay_index: Math.floor(result.config.bays_x / 2), width: 900, height: 2000 },
                                });
                              } else {
                                setOverrides((prev) => {
                                  const { door_opening: _d, ...rest } = prev;
                                  void _d;
                                  return rest;
                                });
                              }
                            }}
                          />
                          {overrides.door_opening && (
                            <>
                              <StepperRow
                                label="Door bay (0=first)"
                                value={overrides.door_opening.bay_index}
                                min={0}
                                max={Math.max(0, result.config.bays_x - 1)}
                                onChange={(v) => updateFromConfig({ door_opening: { ...overrides.door_opening!, bay_index: v } })}
                              />
                              <StepperRow
                                label="Door width (mm)"
                                value={overrides.door_opening.width}
                                min={600}
                                max={2000}
                                step={100}
                                onChange={(v) => updateFromConfig({ door_opening: { ...overrides.door_opening!, width: v } })}
                              />
                              <StepperRow
                                label="Door height (mm)"
                                value={overrides.door_opening.height}
                                min={1500}
                                max={result.config.lift_height}
                                step={100}
                                onChange={(v) => updateFromConfig({ door_opening: { ...overrides.door_opening!, height: v } })}
                              />
                            </>
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
                          {/* Detailed BOM with standard sizes and weights */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="py-1 text-left font-medium">Part</th>
                                  <th className="py-1 text-right font-medium">Qty</th>
                                  <th className="py-1 text-right font-medium">Unit kg</th>
                                  <th className="py-1 text-right font-medium">Total kg</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.bom.details.map((item, idx) => (
                                  <tr key={idx} className="border-b border-border/50">
                                    <td className="py-1.5">
                                      <div className="font-medium">{item.part_type}</div>
                                      <div className="text-muted-foreground">{item.description}</div>
                                    </td>
                                    <td className="py-1.5 text-right font-mono">{item.quantity}</td>
                                    <td className="py-1.5 text-right font-mono">{item.unit_weight_kg}</td>
                                    <td className="py-1.5 text-right font-mono font-semibold">{item.total_weight_kg}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 font-semibold">
                                  <td className="py-2" colSpan={3}>Total weight</td>
                                  <td className="py-2 text-right font-mono">
                                    {result.bom.estimated_weight_kg.toLocaleString()} kg
                                  </td>
                                </tr>
                                <tr>
                                  <td className="pb-2" colSpan={3}>Tonnage</td>
                                  <td className="pb-2 text-right font-mono text-primary">
                                    {(result.bom.estimated_weight_kg / 1000).toFixed(2)} t
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
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
                          {/* BOM PDF — client-side, instant */}
                          <Button
                            onClick={handleDownloadPdf}
                            disabled={downloadingPdf || downloading}
                            variant="outline"
                            className="mb-2 w-full"
                            size="lg"
                          >
                            {downloadingPdf ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Generating PDF...
                              </>
                            ) : (
                              <>
                                <FileText className="mr-2 size-4" />
                                Download BOM PDF
                                <ArrowRight className="ml-2 size-4" />
                              </>
                            )}
                          </Button>
                          {/* STEP file — server-side, slower */}
                          <Button
                            onClick={handleDownloadStep}
                            disabled={downloading || downloadingPdf}
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

/* -------------------------------------------------------------------------- */
/* Stepper row — +/- buttons to adjust a numeric value                       */
/* The value is also an editable numeric input: focus to type a value, Enter  */
/* or blur to commit, Escape to revert.                                       */
/* -------------------------------------------------------------------------- */

function StepperRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const clamp = (v: number) => Math.min(Math.max(v, min), max);

  // Sync draft when value changes externally (e.g. +/- buttons or preset).
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    } else {
      // Revert if invalid
      setDraft(String(value));
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(String(value));
      setEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="size-7 p-0"
          onClick={dec}
          disabled={value <= min}
        >
          <Minus className="size-3" />
        </Button>
        <input
          type="number"
          value={editing ? draft : value}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            setEditing(true);
            setDraft(String(value));
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="min-w-[3rem] w-14 rounded border border-transparent bg-transparent text-center font-mono text-sm font-semibold outline-none hover:border-border focus:border-primary focus:bg-background"
        />
        <Button
          variant="outline"
          size="sm"
          className="size-7 p-0"
          onClick={inc}
          disabled={value >= max}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle row — on/off switch for boolean options                             */
/* -------------------------------------------------------------------------- */

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
