"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Package, Plus, ShoppingCart, X } from "lucide-react";
import * as fflate from "fflate";

import { useConfigurator } from "@/lib/store";
import {
  isCaster,
  isRosette,
  isStandard,
  type BomItem,
  type PartConfig,
} from "@/lib/part-types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function BomCart() {
  const bom = useConfigurator((s) => s.bom);
  const setBomQuantity = useConfigurator((s) => s.setBomQuantity);
  const removeFromBom = useConfigurator((s) => s.removeFromBom);
  const setCurrent = useConfigurator((s) => s.setCurrent);

  const [exportingCsv, setExportingCsv] = useState(false);
  const [zipping, setZipping] = useState(false);

  const totalParts = useMemo(
    () => bom.reduce((acc, it) => acc + it.quantity, 0),
    [bom],
  );

  function handleExportCsv() {
    setExportingCsv(true);
    try {
      const rows: string[][] = [
        ["#", "Part Type", "Subtype", "Quantity", "Key Dimensions", "Preset"],
      ];
      bom.forEach((it, idx) => {
        rows.push([
          String(idx + 1),
          it.part.type,
          it.label,
          String(it.quantity),
          keyDimensions(it.part),
          (it.part as { preset?: string }).preset ?? "",
        ]);
      });
      const csv = rows
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      triggerDownload(blob, `bom_${Date.now()}.csv`);
      toast.success("BOM CSV exported", {
        description: `${bom.length} line item${bom.length === 1 ? "" : "s"}, ${totalParts} parts total`,
      });
    } catch (err) {
      toast.error("CSV export failed", { description: (err as Error).message });
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleDownloadAllStep() {
    if (bom.length === 0) {
      toast.error("BOM is empty", { description: "Add some parts first." });
      return;
    }
    setZipping(true);
    try {
      // Generate a STEP for each BOM line (dedup by signature to avoid
      // recomputing identical configs).
      const seen = new Map<string, Uint8Array>();
      const files: { name: string; data: Uint8Array }[] = [];

      for (let i = 0; i < bom.length; i++) {
        const it = bom[i];
        const sig = JSON.stringify(it.part);
        let data = seen.get(sig);
        if (!data) {
          const res = await fetch("/api/generate-step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(it.part),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              err.error ?? `Failed to generate STEP for "${it.label}"`,
            );
          }
          const buf = await res.arrayBuffer();
          data = new Uint8Array(buf);
          seen.set(sig, data);
        }
        const safeLabel = it.label.replace(/[^a-zA-Z0-9_-]+/g, "_");
        const idx = String(i + 1).padStart(2, "0");
        files.push({ name: `${idx}_${safeLabel}__x${it.quantity}.step`, data });
      }

      const zipped = fflate.zipSync(
        Object.fromEntries(files.map((f) => [f.name, f.data])),
      );
      const blob = new Blob([zipped], { type: "application/zip" });
      triggerDownload(blob, `scaffold_bom_${Date.now()}.zip`);
      toast.success("ZIP archive ready", {
        description: `${files.length} STEP file${files.length === 1 ? "" : "s"}, ${(blob.size / 1024).toFixed(1)} KB`,
      });
    } catch (err) {
      toast.error("ZIP export failed", { description: (err as Error).message });
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="border-t bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">BOM</span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {bom.length} item{bom.length === 1 ? "" : "s"} · {totalParts} part
            {totalParts === 1 ? "" : "s"}
          </Badge>
        </div>

        {/* Chip list */}
        <div className="flex flex-1 flex-wrap items-center gap-2 overflow-x-auto">
          {bom.length === 0 ? (
            <span className="text-xs italic text-muted-foreground">
              No parts in the cart yet — use “Add to BOM” in the right panel.
            </span>
          ) : (
            bom.map((it, idx) => (
              <BomChip
                key={it.id}
                item={it}
                index={idx}
                onInc={() => setBomQuantity(it.id, it.quantity + 1)}
                onDec={() => setBomQuantity(it.id, it.quantity - 1)}
                onRemove={() => {
                  removeFromBom(it.id);
                  toast.info("Removed from BOM", { description: it.label });
                }}
                onClick={() => {
                  setCurrent(it.part);
                  toast.info("Loaded into configurator", { description: it.label });
                }}
              />
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={exportingCsv || bom.length === 0}
          >
            <Package className="mr-1.5 size-3.5" />
            {exportingCsv ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadAllStep}
            disabled={zipping || bom.length === 0}
          >
            <Package className="mr-1.5 size-3.5" />
            {zipping ? "Zipping…" : "Download all STEPs (ZIP)"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
function BomChip({
  item,
  index,
  onInc,
  onDec,
  onRemove,
  onClick,
}: {
  item: BomItem;
  index: number;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-full border bg-background pl-2 pr-1 py-1",
          "transition hover:border-foreground/30 hover:bg-accent",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1.5"
          title="Load this part into the configurator"
        >
          <span className="font-mono text-[10px] text-muted-foreground">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <PartIcon type={item.part.type} />
          <span className="max-w-[200px] truncate text-xs font-medium">
            {item.label}
          </span>
        </button>

        {/* Quantity stepper */}
        <div className="flex items-center gap-0.5 rounded-full bg-muted px-0.5">
          <button
            type="button"
            onClick={onDec}
            className="flex size-5 items-center justify-center rounded-full hover:bg-background"
            aria-label="Decrease quantity"
          >
            <Minus className="size-3" />
          </button>
          <span className="min-w-[1.5rem] text-center font-mono text-xs font-semibold">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={onInc}
            className="flex size-5 items-center justify-center rounded-full hover:bg-background"
            aria-label="Increase quantity"
          >
            <Plus className="size-3" />
          </button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRemove}
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove from BOM"
            >
              <X className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function PartIcon({ type }: { type: PartConfig["type"] }) {
  // Use simple inline SVG dots so we don't pull more lucide icons
  // than necessary (the colors reinforce the part family).
  const colors: Record<PartConfig["type"], string> = {
    caster: "#1a4dd8",
    rosette: "#d9822e",
    standard: "#8e9098",
  };
  return (
    <span
      className="inline-block size-2.5 rounded-full"
      style={{ background: colors[type] }}
      aria-hidden
    />
  );
}

/* -------------------------------------------------------------------------- */
function keyDimensions(c: PartConfig): string {
  if (isCaster(c)) {
    return `Ø${c.wheel_od}×${c.wheel_width}mm, ${c.swivel}, ${c.brake_type}, ${c.mount_type}`;
  }
  if (isRosette(c)) {
    return `Ø${c.disc_od}×${c.thickness}mm, ${c.n_small_holes}+${c.n_large_holes} holes`;
  }
  if (isStandard(c)) {
    return `Ø${c.tube_od}×${c.tube_length}mm, ${c.rosette_count} rosettes`;
  }
  return "";
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
