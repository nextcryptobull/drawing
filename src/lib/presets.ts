/**
 * Catalog + preset definitions for the Scaffold Parts Configurator.
 *
 * The catalog is what the LEFT panel renders (grouped by part type).
 * Each catalog entry points at a "preset" (a full PartConfig) that loads
 * into the RIGHT panel when clicked.
 */
import type { PartConfig, PartType } from "./part-types";

export interface CatalogGroup {
  type: PartType;
  title: string;
  description: string;
  items: CatalogItem[];
}

export interface CatalogItem {
  id: string;
  name: string;
  subtitle: string;
  preset: PartConfig;
}

/* ------------------------------------------------------------------ */
/* Caster presets                                                     */
/* ------------------------------------------------------------------ */
const casterPresets: CatalogItem[] = [
  {
    id: "caster-8x2-swivel-tl",
    name: "8×2 swivel",
    subtitle: "Blue PU · total-lock · top plate",
    preset: {
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
    },
  },
  {
    id: "caster-10x2-5-swivel-fb",
    name: "10×2.5 swivel",
    subtitle: "Blue PU · face brake · top plate",
    preset: {
      type: "caster",
      preset: "caster_10x2.5_swivel_face_brake",
      label: "Caster 10×2.5 swivel face-brake",
      wheel_od: 254.0,
      wheel_width: 63.5,
      tread_thickness: 14.0,
      tread_color: "blue",
      hub_material: "cast_aluminum",
      hub_bore: 52.0,
      bearing_id: 20.0,
      bearing_od: 52.0,
      bearing_width: 15.0,
      axle_dia: 16.0,
      fork_thickness: 8.0,
      fork_leg_width: 80.0,
      fork_leg_length: 130.0,
      swivel_boss_od: 80.0,
      top_plate_length: 130.0,
      top_plate_width: 120.0,
      top_plate_thickness: 8.0,
      swivel: "swivel",
      brake_type: "face_brake",
      pedal_length: 110.0,
      mount_type: "top_plate",
    },
  },
  {
    id: "caster-12x3-rigid-tl",
    name: "12×3 rigid",
    subtitle: "Red PU · total-lock · stem",
    preset: {
      type: "caster",
      preset: "caster_12x3_rigid_total_lock",
      label: "Caster 12×3 rigid total-lock",
      wheel_od: 304.8,
      wheel_width: 76.2,
      tread_thickness: 16.0,
      tread_color: "red",
      hub_material: "cast_iron",
      hub_bore: 62.0,
      bearing_id: 25.0,
      bearing_od: 62.0,
      bearing_width: 16.0,
      axle_dia: 20.0,
      fork_thickness: 10.0,
      fork_leg_width: 95.0,
      fork_leg_length: 160.0,
      swivel_boss_od: 90.0,
      top_plate_length: 150.0,
      top_plate_width: 140.0,
      top_plate_thickness: 10.0,
      swivel: "rigid",
      brake_type: "total_lock",
      pedal_length: 120.0,
      mount_type: "stem",
    },
  },
  {
    id: "caster-12x3-swivel-tl",
    name: "12×3 swivel",
    subtitle: "Red PU · total-lock · top plate",
    preset: {
      type: "caster",
      preset: "caster_12x3_swivel_total_lock",
      label: "Caster 12×3 swivel total-lock",
      wheel_od: 304.8,
      wheel_width: 76.2,
      tread_thickness: 16.0,
      tread_color: "red",
      hub_material: "cast_iron",
      hub_bore: 62.0,
      bearing_id: 25.0,
      bearing_od: 62.0,
      bearing_width: 16.0,
      axle_dia: 20.0,
      fork_thickness: 10.0,
      fork_leg_width: 95.0,
      fork_leg_length: 160.0,
      swivel_boss_od: 90.0,
      top_plate_length: 150.0,
      top_plate_width: 140.0,
      top_plate_thickness: 10.0,
      swivel: "swivel",
      brake_type: "total_lock",
      pedal_length: 120.0,
      mount_type: "top_plate",
    },
  },
];

/* ------------------------------------------------------------------ */
/* Rosette presets                                                    */
/* ------------------------------------------------------------------ */
const rosettePresets: CatalogItem[] = [
  {
    id: "rosette-122-standard",
    name: "Ø122 standard",
    subtitle: "8 holes (4+4) · 10mm thick",
    preset: {
      type: "rosette",
      preset: "rosette_122_standard",
      label: "Rosette Ø122mm standard",
      disc_od: 122.0,
      thickness: 10.0,
      center_bore: 50.0,
      small_hole_dia: 14.0,
      large_hole_dia: 20.0,
      hole_pcd_r: 35.0,
      n_small_holes: 4,
      n_large_holes: 4,
    },
  },
  {
    id: "rosette-100-mini",
    name: "Ø100 mini",
    subtitle: "8 holes (4+4) · 8mm thick",
    preset: {
      type: "rosette",
      preset: "rosette_100_mini",
      label: "Rosette Ø100mm mini",
      disc_od: 100.0,
      thickness: 8.0,
      center_bore: 41.0,
      small_hole_dia: 12.0,
      large_hole_dia: 18.0,
      hole_pcd_r: 28.0,
      n_small_holes: 4,
      n_large_holes: 4,
    },
  },
  {
    id: "rosette-custom",
    name: "Custom rosette",
    subtitle: "Edit dimensions on the right",
    preset: {
      type: "rosette",
      preset: "rosette_custom",
      label: "Rosette (custom)",
      disc_od: 110.0,
      thickness: 9.0,
      center_bore: 45.0,
      small_hole_dia: 13.0,
      large_hole_dia: 19.0,
      hole_pcd_r: 32.0,
      n_small_holes: 4,
      n_large_holes: 4,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Standard presets                                                    */
/* ------------------------------------------------------------------ */
function standardPreset(
  id: string,
  name: string,
  subtitle: string,
  lengthM: number,
  rosetteCount: number,
): CatalogItem {
  const length = lengthM * 1000;
  return {
    id,
    name,
    subtitle,
    preset: {
      type: "standard",
      preset: `standard_${lengthM}m`,
      label: `Standard ${lengthM}m`,
      tube_od: 48.3,
      tube_wall: 3.2,
      tube_length: length,
      rosette_pitch: 500.0,
      rosette_count: rosetteCount,
      rosette_disc_od: 122.0,
      rosette_thickness: 10.0,
      rosette_center_bore: 50.0,
      spigot_od: 38.0,
      spigot_length: 150.0,
    },
  };
}

const standardPresets: CatalogItem[] = [
  standardPreset("std-0.5m", "0.5m", "1 rosette", 0.5, 1),
  standardPreset("std-1m", "1m", "2 rosettes", 1, 2),
  standardPreset("std-1.5m", "1.5m", "3 rosettes", 1.5, 3),
  standardPreset("std-2m", "2m", "4 rosettes", 2, 4),
  standardPreset("std-3m", "3m", "6 rosettes", 3, 6),
];

/* ------------------------------------------------------------------ */
/* Full catalog                                                        */
/* ------------------------------------------------------------------ */
export const CATALOG: CatalogGroup[] = [
  {
    type: "caster",
    title: "Caster Wheels",
    description: "Swivel & rigid, blue/red PU tread, with brake options",
    items: casterPresets,
  },
  {
    type: "rosette",
    title: "Ringlock Rosettes",
    description: "Welded disc with 8 connection holes",
    items: rosettePresets,
  },
  {
    type: "standard",
    title: "Ringlock Standards",
    description: "Vertical tube + rosettes + spigot",
    items: standardPresets,
  },
];

/** All presets flattened (used by the preset dropdown). */
export function presetsForType(type: PartType): CatalogItem[] {
  return CATALOG.find((g) => g.type === type)?.items ?? [];
}
