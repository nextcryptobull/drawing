"use client";

import { TowerAssembler } from "@/components/assembler/tower-assembler";

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TowerAssembler />
    </div>
  );
}
