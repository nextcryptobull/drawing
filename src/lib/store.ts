/**
 * Zustand store for the Scaffold Parts Configurator.
 *
 * Holds the currently selected part config (drives the 3D viewer + right panel)
 * and the BOM cart. UI-only state — no server persistence here.
 */
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  BomItem,
  CasterConfig,
  PartConfig,
  RosetteConfig,
  StandardConfig,
} from "./part-types";
import { partLabel } from "./part-types";

interface ConfiguratorState {
  /** The part currently being edited / previewed. */
  current: PartConfig;
  /** BOM cart items. */
  bom: BomItem[];

  /** Replace the current config (used by catalog clicks + preset dropdown). */
  setCurrent: (c: PartConfig) => void;
  /** Patch the current config with partial fields. */
  patchCurrent: (patch: Partial<PartConfig>) => void;

  /** Add the current part to the BOM. */
  addToBom: (quantity?: number) => void;
  /** Increment / decrement quantity of a BOM line item. */
  setBomQuantity: (id: string, quantity: number) => void;
  /** Remove a BOM line item. */
  removeFromBom: (id: string) => void;
  /** Replace the entire BOM (used by Load config). */
  setBom: (bom: BomItem[]) => void;
  /** Clear the BOM. */
  clearBom: () => void;
}

function withLabel(c: PartConfig): PartConfig {
  return { ...c, label: partLabel(c) } as PartConfig;
}

export const useConfigurator = create<ConfiguratorState>((set, get) => ({
  current: {
    type: "caster",
    preset: "caster_8x2_swivel_total_lock",
    label: "Caster 8×2 swivel total-lock",
    wheel_od: 203.2,
    wheel_width: 50.8,
    tread_thickness: 12.0,
    tread_color: "blue",
    hub_material: "cast_iron",
    hub_bore: 47.0,
    bearing_id: 20.0,
    bearing_od: 47.0,
    bearing_width: 14.0,
    axle_dia: 16.0,
    fork_thickness: 6.0,
    fork_leg_width: 70.0,
    fork_leg_length: 100.0,
    swivel_boss_od: 70.0,
    top_plate_length: 114.3,
    top_plate_width: 101.6,
    top_plate_thickness: 6.0,
    swivel: "swivel",
    brake_type: "total_lock",
    pedal_length: 100.0,
    mount_type: "top_plate",
  } as CasterConfig,

  bom: [],

  setCurrent: (c) => set({ current: withLabel(c) }),

  patchCurrent: (patch) =>
    set((s) => ({
      current: withLabel({ ...s.current, ...patch } as PartConfig),
    })),

  addToBom: (quantity = 1) => {
    const c = get().current;
    const item: BomItem = {
      id: uuidv4(),
      part: c,
      quantity,
      label: partLabel(c),
    };
    set((s) => ({ bom: [...s.bom, item] }));
  },

  setBomQuantity: (id, quantity) =>
    set((s) => ({
      bom: s.bom
        .map((it) => (it.id === id ? { ...it, quantity } : it))
        .filter((it) => it.quantity > 0),
    })),

  removeFromBom: (id) =>
    set((s) => ({ bom: s.bom.filter((it) => it.id !== id) })),

  setBom: (bom) => set({ bom }),

  clearBom: () => set({ bom: [] }),
}));

/** Convenience typed accessors for use in components. */
export function asCaster(c: PartConfig): CasterConfig {
  return c as CasterConfig;
}
export function asRosette(c: PartConfig): RosetteConfig {
  return c as RosetteConfig;
}
export function asStandard(c: PartConfig): StandardConfig {
  return c as StandardConfig;
}
