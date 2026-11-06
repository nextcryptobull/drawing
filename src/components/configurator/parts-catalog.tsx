"use client";

import { CircleDashed, CircleDot, Layers } from "lucide-react";

import { CATALOG } from "@/lib/presets";
import { useConfigurator } from "@/lib/store";
import type { PartType } from "@/lib/part-types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const GROUP_ICON: Record<PartType, typeof CircleDashed> = {
  caster: CircleDashed,
  rosette: CircleDot,
  standard: Layers,
};

export function PartsCatalog() {
  const current = useConfigurator((s) => s.current);
  const setCurrent = useConfigurator((s) => s.setCurrent);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Parts Catalog</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pick a preset to load into the configurator.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={["caster", "rosette", "standard"]}
          className="px-2 py-2"
        >
          {CATALOG.map((group) => {
            const Icon = GROUP_ICON[group.type];
            return (
              <AccordionItem key={group.type} value={group.type}>
                <AccordionTrigger className="px-2 py-3 text-sm hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{group.title}</span>
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => {
                      const isActive =
                        current.type === group.type &&
                        (current as { preset?: string }).preset ===
                          (item.preset as { preset?: string }).preset;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCurrent(item.preset)}
                          className={cn(
                            "group flex items-start gap-3 rounded-md border border-transparent bg-card px-3 py-2 text-left transition hover:border-border hover:bg-accent",
                            isActive && "border-primary/40 bg-accent",
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted",
                              isActive && "border-primary/40 bg-background",
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-4 text-muted-foreground",
                                isActive && "text-foreground",
                              )}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {item.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {item.subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>
    </div>
  );
}
