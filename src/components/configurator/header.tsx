"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  FolderOpen,
  Save,
  Trash2,
  ChevronDown,
} from "lucide-react";

import { useConfigurator } from "@/lib/store";
import {
  listSavedConfigs,
  saveConfig,
  loadConfig,
  deleteConfig,
} from "@/lib/storage";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const current = useConfigurator((s) => s.current);
  const bom = useConfigurator((s) => s.bom);
  const setCurrent = useConfigurator((s) => s.setCurrent);
  const setBom = useConfigurator((s) => s.setBom);

  // Read once on first render so the badge count is correct.
  const [savedConfigs, setSavedConfigs] = useState(() => listSavedConfigs());
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  function refresh() {
    setSavedConfigs(listSavedConfigs());
  }

  function handleSave() {
    const name = saveName.trim() || `Config ${new Date().toLocaleString()}`;
    saveConfig(name, current, bom);
    toast.success("Configuration saved", {
      description: `"${name}" — ${bom.length} BOM item${bom.length === 1 ? "" : "s"}`,
    });
    setSaveName("");
    setSaveOpen(false);
    refresh();
  }

  function handleLoad(id: string) {
    const entry = loadConfig(id);
    if (!entry) {
      toast.error("Could not load configuration");
      return;
    }
    setCurrent(entry.current);
    setBom(entry.bom);
    toast.success("Configuration loaded", {
      description: `"${entry.name}"`,
    });
  }

  function handleDelete(id: string, name: string) {
    deleteConfig(id);
    refresh();
    toast.info("Configuration deleted", { description: name });
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-2.5">
      {/* Title */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
          <Boxes className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            Scaffold Parts Configurator
          </span>
          <span className="text-[11px] text-muted-foreground">
            Parametric CAD · Live 3D preview · STEP export
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Load dropdown */}
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) refresh();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={savedConfigs.length === 0}>
              <FolderOpen className="mr-1.5 size-3.5" />
              Load
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                {savedConfigs.length}
              </Badge>
              <ChevronDown className="ml-1 size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {savedConfigs.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No saved configurations yet.
                <br />
                Click “Save” to store the current setup.
              </div>
            ) : (
              savedConfigs.map((cfg) => (
                <DropdownMenuItem
                  key={cfg.id}
                  className="flex items-start justify-between gap-2 py-2"
                  onSelect={(e) => {
                    e.preventDefault();
                    handleLoad(cfg.id);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{cfg.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {new Date(cfg.savedAt).toLocaleString()} ·{" "}
                      {cfg.bom.length} BOM item{cfg.bom.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(cfg.id, cfg.name);
                    }}
                    aria-label="Delete saved configuration"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Save dialog */}
        <Dialog
          open={saveOpen}
          onOpenChange={(open) => {
            setSaveOpen(open);
            if (open) refresh();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Save className="mr-1.5 size-3.5" />
              Save
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save configuration</DialogTitle>
              <DialogDescription>
                Saves the current part config and BOM cart to your browser
                (localStorage). Up to ~5 MB total.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              <Label htmlFor="save-name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="save-name"
                placeholder={`Config ${new Date().toLocaleString()}`}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                autoFocus
              />
              <div className="mt-1 rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                <div className="font-medium text-foreground">{current.label}</div>
                <div className="mt-0.5">
                  BOM: {bom.length} item{bom.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSave}>
                <Save className="mr-1.5 size-3.5" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
