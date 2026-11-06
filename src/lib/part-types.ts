/**
 * Type definitions for the Scaffold Parts Configurator.
 * All dimensions are in millimetres (mm) unless otherwise noted.
 */

export type PartType = "caster" | "rosette" | "standard";
export type BrakeType = "none" | "face_brake" | "total_lock";
export type MountType = "top_plate" | "stem" | "threaded_stem";
export type SwivelType = "swivel" | "rigid";
export type TreadColor = "blue" | "red" | "grey";
export type HubMaterial = "cast_iron" | "cast_aluminum";

/* ------------------------------------------------------------------ */
/* Caster                                                              */
/* ------------------------------------------------------------------ */
export interface CasterConfig {
  type: "caster";
  preset?: string;
  label?: string;
  // Wheel
  wheel_od: number; // mm
  wheel_width: number; // mm
  tread_thickness: number; // mm
  tread_color: TreadColor;
  hub_material: HubMaterial;
  hub_bore: number; // bearing OD, mm
  bearing_id: number; // mm
  bearing_od: number; // mm
  bearing_width: number; // mm
  // Axle
  axle_dia: number; // mm
  // Yoke / fork
  fork_thickness: number; // mm
  fork_leg_width: number; // mm
  fork_leg_length: number; // mm
  swivel_boss_od: number; // mm
  top_plate_length: number; // mm
  top_plate_width: number; // mm
  top_plate_thickness: number; // mm
  swivel: SwivelType;
  // Brake
  brake_type: BrakeType;
  pedal_length: number; // mm
  // Mount
  mount_type: MountType;
}

/* ------------------------------------------------------------------ */
/* Ringlock Rosette                                                     */
/* ------------------------------------------------------------------ */
export interface RosetteConfig {
  type: "rosette";
  preset?: string;
  label?: string;
  disc_od: number; // mm
  thickness: number; // mm
  center_bore: number; // mm
  small_hole_dia: number; // mm
  large_hole_dia: number; // mm
  hole_pcd_r: number; // mm (radial distance from center to hole centers)
  n_small_holes: number; // count (typically 4)
  n_large_holes: number; // count (typically 4)
}

/* ------------------------------------------------------------------ */
/* Ringlock Standard (vertical upright)                                */
/* ------------------------------------------------------------------ */
export interface StandardConfig {
  type: "standard";
  preset?: string;
  label?: string;
  tube_od: number; // mm
  tube_wall: number; // mm
  tube_length: number; // mm
  rosette_pitch: number; // mm (distance between rosettes, typically 500)
  rosette_count: number; // derived from length / pitch
  // Rosette geometry (kept in sync with rosette presets)
  rosette_disc_od: number; // mm
  rosette_thickness: number; // mm
  rosette_center_bore: number; // mm
  // Spigot
  spigot_od: number; // mm
  spigot_length: number; // mm
}

export type PartConfig = CasterConfig | RosetteConfig | StandardConfig;

/* ------------------------------------------------------------------ */
/* BOM item                                                            */
/* ------------------------------------------------------------------ */
export interface BomItem {
  id: string; // uuid
  part: PartConfig;
  quantity: number;
  label: string; // human-readable
}

/* ------------------------------------------------------------------ */
/* Saved configuration                                                 */
/* ------------------------------------------------------------------ */
export interface SavedConfig {
  id: string;
  name: string;
  savedAt: number; // epoch ms
  current: PartConfig;
  bom: BomItem[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
export function isCaster(c: PartConfig): c is CasterConfig {
  return c.type === "caster";
}
export function isRosette(c: PartConfig): c is RosetteConfig {
  return c.type === "rosette";
}
export function isStandard(c: PartConfig): c is StandardConfig {
  return c.type === "standard";
}

/** Build a short human-readable label for a part config. */
export function partLabel(c: PartConfig): string {
  if (isCaster(c)) {
    const inch_od = (c.wheel_od / 25.4).toFixed(1).replace(/\.0$/, "");
    const inch_w = (c.wheel_width / 25.4).toFixed(1).replace(/\.0$/, "");
    const sw = c.swivel === "swivel" ? "swivel" : "rigid";
    const brake = c.brake_type === "total_lock"
      ? "TL"
      : c.brake_type === "face_brake"
        ? "FB"
        : "no-brake";
    return `Caster ${inch_od}x${inch_w} ${sw} ${brake}`;
  }
  if (isRosette(c)) {
    return `Rosette Ø${c.disc_od}mm`;
  }
  return `Standard ${(c.tube_length / 1000).toFixed(2)}m`;
}

/** Default config for a freshly-loaded part type. */
export function defaultConfig(type: PartType): PartConfig {
  switch (type) {
    case "caster":
      return {
        type: "caster",
        preset: "caster_8x2_swivel_total_lock",
        label: "Caster 8x2 swivel total-lock",
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
      };
    case "rosette":
      return {
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
      };
    case "standard":
      return {
        type: "standard",
        preset: "standard_1m",
        label: "Standard 1m",
        tube_od: 48.3,
        tube_wall: 3.2,
        tube_length: 1000.0,
        rosette_pitch: 500.0,
        rosette_count: 2,
        rosette_disc_od: 122.0,
        rosette_thickness: 10.0,
        rosette_center_bore: 50.0,
        spigot_od: 38.0,
        spigot_length: 150.0,
      };
  }
}
