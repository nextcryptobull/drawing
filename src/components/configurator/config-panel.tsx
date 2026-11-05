"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingCart,
} from "lucide-react";

import { useConfigurator } from "@/lib/store";
import { presetsForType } from "@/lib/presets";
import {
  isCaster,
  isRosette,
  isStandard,
  partLabel,
  type BrakeType,
  type CasterConfig,
  type MountType,
  type PartConfig,
  type PartType,
  type RosetteConfig,
  type StandardConfig,
} from "@/lib/part-types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* -------------------------------------------------------------------------- */
/* Field schema                                                              */
/* -------------------------------------------------------------------------- */
interface NumberField {
  key: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  help: string;
}
interface SelectField {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  help: string;
}

const CASTER_FIELDS: NumberField[] = [
  { key: "wheel_od", label: "Wheel OD", unit: "mm", min: 80, max: 400, step: 1, help: "Outer diameter of the wheel tread." },
  { key: "wheel_width", label: "Wheel width", unit: "mm", min: 25, max: 120, step: 0.5, help: "Width of the tread along the axle." },
  { key: "tread_thickness", label: "Tread thickness", unit: "mm", min: 6, max: 25, step: 0.5, help: "Thickness of the PU tread bonded to the hub." },
  { key: "fork_leg_width", label: "Fork leg width", unit: "mm", min: 40, max: 140, step: 1, help: "Width of each fork leg (in the rolling direction)." },
  { key: "fork_leg_length", label: "Fork leg length", unit: "mm", min: 60, max: 220, step: 1, help: "Length of the fork leg, drives overall caster height." },
  { key: "top_plate_length", label: "Top plate length", unit: "mm", min: 70, max: 200, step: 1, help: "Top plate long-side dimension." },
  { key: "top_plate_width", label: "Top plate width", unit: "mm", min: 60, max: 200, step: 1, help: "Top plate short-side dimension." },
  { key: "top_plate_thickness", label: "Top plate thickness", unit: "mm", min: 4, max: 16, step: 0.5, help: "Top plate steel thickness." },
  { key: "axle_dia", label: "Axle diameter", unit: "mm", min: 8, max: 30, step: 0.5, help: "Axle diameter (e.g. M16 = 16 mm)." },
  { key: "pedal_length", label: "Brake pedal length", unit: "mm", min: 60, max: 160, step: 1, help: "Length of the brake foot pedal." },
];

const CASTER_SELECTS: SelectField[] = [
  {
    key: "tread_color",
    label: "Tread color",
    help: "Visual color of the PU tread (blue / red / grey).",
    options: [
      { value: "blue", label: "Blue PU" },
      { value: "red", label: "Red PU" },
      { value: "grey", label: "Grey PU" },
    ],
  },
  {
    key: "hub_material",
    label: "Hub material",
    help: "Hub material — affects STEP metadata only.",
    options: [
      { value: "cast_iron", label: "Cast iron" },
      { value: "cast_aluminum", label: "Cast aluminum" },
    ],
  },
  {
    key: "swivel",
    label: "Swivel / rigid",
    help: "Swivel allows the caster to rotate around a vertical kingpin.",
    options: [
      { value: "swivel", label: "Swivel" },
      { value: "rigid", label: "Rigid" },
    ],
  },
  {
    key: "brake_type",
    label: "Brake type",
    help: "Total-lock brakes both wheel and swivel. Face-brake locks the wheel only.",
    options: [
      { value: "none", label: "None" },
      { value: "face_brake", label: "Face brake" },
      { value: "total_lock", label: "Total lock" },
    ],
  },
  {
    key: "mount_type",
    label: "Mount type",
    help: "How the caster attaches to equipment.",
    options: [
      { value: "top_plate", label: "Top plate" },
      { value: "stem", label: "Stem" },
      { value: "threaded_stem", label: "Threaded stem" },
    ],
  },
];

const ROSETTE_FIELDS: NumberField[] = [
  { key: "disc_od", label: "Disc OD", unit: "mm", min: 80, max: 160, step: 0.5, help: "Outer diameter of the rosette disc." },
  { key: "thickness", label: "Disc thickness", unit: "mm", min: 6, max: 16, step: 0.5, help: "Thickness of the disc along the tube axis." },
  { key: "center_bore", label: "Center bore", unit: "mm", min: 30, max: 60, step: 0.5, help: "Bore through the disc center (slips over the tube)." },
  { key: "small_hole_dia", label: "Small hole Ø", unit: "mm", min: 10, max: 20, step: 0.5, help: "Ledger-bolt hole diameter (4 holes)." },
  { key: "large_hole_dia", label: "Large hole Ø", unit: "mm", min: 14, max: 28, step: 0.5, help: "Brace-bolt hole diameter (4 holes)." },
  { key: "hole_pcd_r", label: "Hole PCD radius", unit: "mm", min: 18, max: 50, step: 0.5, help: "Radial distance from disc center to hole centers." },
  { key: "n_small_holes", label: "# small holes", unit: "", min: 0, max: 8, step: 1, help: "Number of small (ledger) holes." },
  { key: "n_large_holes", label: "# large holes", unit: "", min: 0, max: 8, step: 1, help: "Number of large (brace) holes." },
];

const STANDARD_FIELDS: NumberField[] = [
  { key: "tube_od", label: "Tube OD", unit: "mm", min: 40, max: 60, step: 0.1, help: "Outer diameter of the main vertical tube." },
  { key: "tube_wall", label: "Tube wall", unit: "mm", min: 2, max: 6, step: 0.1, help: "Wall thickness of the tube." },
  { key: "tube_length", label: "Tube length", unit: "mm", min: 250, max: 4000, step: 10, help: "Total length of the tube." },
  { key: "rosette_pitch", label: "Rosette pitch", unit: "mm", min: 250, max: 750, step: 10, help: "Vertical spacing between rosettes (EN 12811 = 500 mm)." },
  { key: "rosette_count", label: "# rosettes", unit: "", min: 1, max: 10, step: 1, help: "Number of rosettes welded to the tube." },
  { key: "rosette_disc_od", label: "Rosette disc Ø", unit: "mm", min: 80, max: 160, step: 0.5, help: "Outer diameter of each rosette disc." },
  { key: "spigot_od", label: "Spigot Ø", unit: "mm", min: 28, max: 48, step: 0.5, help: "Male stacking spigot outer diameter." },
  { key: "spigot_length", label: "Spigot length", unit: "mm", min: 60, max: 220, step: 5, help: "Length of the male stacking spigot." },
];

const FIELDS_BY_TYPE: Record<PartType, NumberField[]> = {
  caster: CASTER_FIELDS,
  rosette: ROSETTE_FIELDS,
  standard: STANDARD_FIELDS,
};
const SELECTS_BY_TYPE: Record<PartType, SelectField[]> = {
  caster: CASTER_SELECTS,
  rosette: [],
  standard: [],
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */
export function ConfigPanel() {
  const current = useConfigurator((s) => s.current);
  const patchCurrent = useConfigurator((s) => s.patchCurrent);
  const addToBom = useConfigurator((s) => s.addToBom);
  const setCurrent = useConfigurator((s) => s.setCurrent);

  const [tab, setTab] = useState<"preset" | "advanced">("preset");
  const [downloading, setDownloading] = useState(false);
  const [adding, setAdding] = useState(false);

  // When part type changes, jump back to preset tab so the user sees the
  // preset options for the new type.
  useEffect(() => {
    setTab("preset");
  }, [current.type]);

  const presets = presetsForType(current.type);

  function onPresetChange(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setCurrent(preset.preset);
      toast.success(`Loaded preset: ${preset.name}`);
    }
  }

  function patchField(field: string, value: number | string) {
    patchCurrent({ [field]: value } as Partial<PartConfig>);
  }

  async function handleDownloadStep() {
    setDownloading(true);
    try {
      const res = await fetch("/api/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      triggerBrowserDownload(blob, fileNameFor(current));
      toast.success("STEP file generated", {
        description: `${(blob.size / 1024).toFixed(1)} KB · ${partLabel(current)}`,
      });
    } catch (err) {
      toast.error("STEP generation failed", {
        description: (err as Error).message,
      });
    } finally {
      setDownloading(false);
    }
  }

  function handleAddToBom() {
    setAdding(true);
    addToBom(1);
    toast.success("Added to BOM", { description: partLabel(current) });
    // Tiny timeout so the button shows the spinner briefly even on fast machines.
    setTimeout(() => setAdding(false), 250);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Configuration</h2>
          <PartTypeBadge type={current.type} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{current.label}</p>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "preset" | "advanced")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preset">Preset</TabsTrigger>
            <TabsTrigger value="advanced">
              <Settings2 className="mr-1 size-3.5" />
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* PRESET TAB */}
          <TabsContent value="preset" className="mt-3">
            <Label htmlFor="preset-select" className="text-xs text-muted-foreground">
              Pick a preset
            </Label>
            <Select
              value={(current as { preset?: string }).preset ?? ""}
              onValueChange={onPresetChange}
            >
              <SelectTrigger id="preset-select" className="mt-1 w-full">
                <SelectValue placeholder="Select preset…" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.subtitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Separator className="my-4" />

            <ReadonlySummary config={current} />
          </TabsContent>

          {/* ADVANCED TAB */}
          <TabsContent value="advanced" className="mt-3">
            <ScrollArea className="max-h-[calc(100vh-20rem)] pr-2">
              <TooltipProvider delayDuration={200}>
                <div className="flex flex-col gap-4 pb-2">
                  {SELECTS_BY_TYPE[current.type].map((f) => (
                    <SelectRow
                      key={f.key}
                      field={f}
                      value={String((current as Record<string, unknown>)[f.key] ?? "")}
                      onChange={(v) => patchField(f.key, v)}
                    />
                  ))}
                  {SELECTS_BY_TYPE[current.type].length > 0 &&
                    FIELDS_BY_TYPE[current.type].length > 0 && <Separator />}
                  {FIELDS_BY_TYPE[current.type].map((f) => (
                    <NumberRow
                      key={f.key}
                      field={f}
                      value={Number((current as Record<string, unknown>)[f.key] ?? 0)}
                      onChange={(v) => patchField(f.key, v)}
                    />
                  ))}
                </div>
              </TooltipProvider>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action footer */}
      <div className="mt-auto flex flex-col gap-2 border-t p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            variant="default"
            onClick={handleAddToBom}
            disabled={adding}
          >
            {adding ? (
              <RotateCcw className="mr-1.5 size-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-1.5 size-4" />
            )}
            Add to BOM
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            onClick={handleDownloadStep}
            disabled={downloading}
          >
            {downloading ? (
              <RotateCcw className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            Download STEP
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const preset = presets[0];
            if (preset) {
              setCurrent(preset.preset);
              toast.info("Reset to first preset", {
                description: preset.name,
              });
            }
          }}
        >
          <Plus className="mr-1.5 size-3.5" />
          Reset to first preset
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */
function PartTypeBadge({ type }: { type: PartType }) {
  const labels: Record<PartType, string> = {
    caster: "Caster",
    rosette: "Rosette",
    standard: "Standard",
  };
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {labels[type]}
    </span>
  );
}

function ReadonlySummary({ config }: { config: PartConfig }) {
  let rows: { label: string; value: string }[] = [];
  if (isCaster(config)) {
    const c = config as CasterConfig;
    rows = [
      { label: "Wheel", value: `Ø${c.wheel_od} × ${c.wheel_width} mm` },
      { label: "Tread", value: `${c.tread_thickness} mm · ${c.tread_color}` },
      { label: "Hub", value: c.hub_material === "cast_iron" ? "Cast iron" : "Cast aluminum" },
      { label: "Axle", value: `M${Math.round(c.axle_dia)}` },
      { label: "Swivel", value: c.swivel === "swivel" ? "Swivel" : "Rigid" },
      { label: "Brake", value: brakeLabel(c.brake_type) },
      { label: "Mount", value: mountLabel(c.mount_type) },
    ];
  } else if (isRosette(config)) {
    const r = config as RosetteConfig;
    rows = [
      { label: "Disc", value: `Ø${r.disc_od} × ${r.thickness} mm` },
      { label: "Center bore", value: `Ø${r.center_bore} mm` },
      { label: "Small holes", value: `${r.n_small_holes} × Ø${r.small_hole_dia} mm` },
      { label: "Large holes", value: `${r.n_large_holes} × Ø${r.large_hole_dia} mm` },
      { label: "PCD radius", value: `${r.hole_pcd_r} mm` },
    ];
  } else if (isStandard(config)) {
    const s = config as StandardConfig;
    rows = [
      { label: "Tube", value: `Ø${s.tube_od} × wall ${s.tube_wall} × L ${s.tube_length} mm` },
      { label: "Rosettes", value: `${s.rosette_count} × Ø${s.rosette_disc_od} (pitch ${s.rosette_pitch} mm)` },
      { label: "Spigot", value: `Ø${s.spigot_od} × ${s.spigot_length} mm` },
    ];
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NumberRow({
  field,
  value,
  onChange,
}: {
  field: NumberField;
  value: number;
  onChange: (v: number) => void;
}) {
  // Clamp on blur so the slider + input stay consistent.
  const [local, setLocal] = useState<string>(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const sliderValue = Math.min(Math.max(value, field.min), field.max);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <div className="min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              {field.label}
              {field.unit ? (
                <span className="text-[10px] text-muted-foreground/70">
                  ({field.unit})
                </span>
              ) : null}
            </Label>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">
            {field.help}
          </TooltipContent>
        </Tooltip>
        <Slider
          className="mt-2"
          min={field.min}
          max={field.max}
          step={field.step}
          value={[sliderValue]}
          onValueChange={(vals) => {
            const v = vals[0];
            setLocal(String(v));
            onChange(v);
          }}
        />
      </div>
      <Input
        type="number"
        className="h-8 w-20 text-right"
        min={field.min}
        max={field.max}
        step={field.step}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => {
          let v = parseFloat(local);
          if (Number.isNaN(v)) v = field.min;
          v = Math.min(Math.max(v, field.min), field.max);
          setLocal(String(v));
          onChange(v);
        }}
      />
    </div>
  );
}

function SelectRow({
  field,
  value,
  onChange,
}: {
  field: SelectField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          {field.help}
        </TooltipContent>
      </Tooltip>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
function brakeLabel(b: BrakeType): string {
  return b === "total_lock" ? "Total lock" : b === "face_brake" ? "Face brake" : "None";
}
function mountLabel(m: MountType): string {
  return m === "top_plate"
    ? "Top plate"
    : m === "stem"
      ? "Stem"
      : "Threaded stem";
}

function fileNameFor(c: PartConfig): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (isCaster(c)) {
    return `caster_od${Math.round(c.wheel_od)}_${stamp}.step`;
  }
  if (isRosette(c)) {
    return `rosette_od${Math.round(c.disc_od)}_${stamp}.step`;
  }
  if (isStandard(c)) {
    return `standard_${Math.round(c.tube_length / 1000)}m_${stamp}.step`;
  }
  return `part_${stamp}.step`;
}

export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
