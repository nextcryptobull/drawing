#!/usr/bin/env python3
"""
Unified parametric STEP generator for the Scaffold Parts Configurator.

Wraps the three reference CAD scripts (caster, rosette, standard) behind a
single CLI that the Next.js API route can spawn:

    python3 generate_step.py --config /tmp/cfg.json --output /tmp/out.step

The config JSON has the same shape as the TypeScript PartConfig union:

    {
      "type": "caster" | "rosette" | "standard",
      ...per-type fields...
    }

The script prints a single JSON status line to stdout that the API route can
parse directly:

    {"status": "ok", "step_path": "/tmp/out.step", "warnings": [...]}
    {"status": "error", "message": "..."}
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import traceback
from typing import Any, Dict, List, Tuple

import cadquery as cq


# ============================================================================
# CASTER  (adapted from casterhq_complete_brake.py, made parametric)
# ============================================================================
def build_caster(cfg: Dict[str, Any]) -> cq.Assembly:
    """Build a parametric caster with optional brake. Returns an Assembly."""
    wheel_od = float(cfg.get("wheel_od", 203.2))
    wheel_width = float(cfg.get("wheel_width", 50.8))
    tread_thk = float(cfg.get("tread_thickness", 12.0))
    tread_color = str(cfg.get("tread_color", "blue"))
    hub_od = wheel_od - 2.0 * tread_thk
    hub_bore = float(cfg.get("hub_bore", 47.0))
    bearing_od = float(cfg.get("bearing_od", 47.0))
    bearing_id = float(cfg.get("bearing_id", 20.0))
    bearing_width = float(cfg.get("bearing_width", 14.0))
    axle_dia = float(cfg.get("axle_dia", 16.0))
    fork_thk = float(cfg.get("fork_thickness", 6.0))
    fork_leg_w = float(cfg.get("fork_leg_width", 70.0))
    fork_leg_len = float(cfg.get("fork_leg_length", 100.0))
    swivel_boss_od = float(cfg.get("swivel_boss_od", 70.0))
    top_plate_l = float(cfg.get("top_plate_length", 114.3))
    top_plate_w = float(cfg.get("top_plate_width", 101.6))
    top_plate_thk = float(cfg.get("top_plate_thickness", 6.0))
    swivel = str(cfg.get("swivel", "swivel"))
    brake_type = str(cfg.get("brake_type", "total_lock"))
    pedal_len = float(cfg.get("pedal_length", 100.0))
    mount_type = str(cfg.get("mount_type", "top_plate"))

    fork_gap = wheel_width + 6.0
    swivel_offset = 30.0
    axle_len = wheel_width + 50.0

    color_map = {
        "blue": cq.Color(0.10, 0.30, 0.85),
        "red": cq.Color(0.78, 0.18, 0.18),
        "grey": cq.Color(0.55, 0.55, 0.58),
    }
    tread_color_obj = color_map.get(tread_color, color_map["blue"])

    asm = cq.Assembly(name=f"Caster_OD{int(wheel_od)}_W{int(wheel_width)}")

    # ---- Wheel ----
    tread = (
        cq.Workplane("XY")
        .circle(wheel_od / 2.0)
        .circle(hub_od / 2.0)
        .extrude(wheel_width)
        .translate((0, 0, -wheel_width / 2.0))
        .rotate((0, 0, 0), (1, 0, 0), 90)
    )
    try:
        tread = tread.edges(">Z").edges("|Z").fillet(2.0)
        tread = tread.edges("<Z").edges("|Z").fillet(2.0)
    except Exception:
        pass
    asm.add(tread, name="Tread_PU", color=tread_color_obj)

    hub = (
        cq.Workplane("XY")
        .circle(hub_od / 2.0)
        .circle(hub_bore / 2.0)
        .extrude(wheel_width)
        .translate((0, 0, -wheel_width / 2.0))
        .rotate((0, 0, 0), (1, 0, 0), 90)
    )
    asm.add(hub, name="Hub", color=cq.Color(0.20, 0.20, 0.22))

    # Bearings (2)
    bearing = (
        cq.Workplane("XY")
        .circle(bearing_od / 2.0)
        .circle(bearing_id / 2.0)
        .extrude(bearing_width)
        .translate((0, 0, -bearing_width / 2.0))
        .rotate((0, 0, 0), (1, 0, 0), 90)
    )
    asm.add(bearing.translate((0, -bearing_width / 2 - 1, 0)),
            name="Bearing_A", color=cq.Color(0.80, 0.80, 0.85))
    asm.add(bearing.translate((0, bearing_width / 2 + 1, 0)),
            name="Bearing_B", color=cq.Color(0.80, 0.80, 0.85))

    # Axle
    axle = (
        cq.Workplane("XY")
        .circle(axle_dia / 2.0)
        .extrude(axle_len)
        .translate((0, 0, -axle_len / 2.0))
        .rotate((0, 0, 0), (1, 0, 0), 90)
    )
    asm.add(axle, name="Axle", color=cq.Color(0.30, 0.30, 0.35))

    # ---- Fork legs ----
    def make_fork_leg(side_sign: float) -> cq.Workplane:
        leg = (
            cq.Workplane("XZ")
            .center(0, 0)
            .rect(fork_leg_w, fork_leg_len, centered=False)
            .extrude(fork_thk)
        )
        leg = leg.translate((-fork_leg_w / 2.0, 0, 0))
        leg = (
            leg.faces(">Y").workplane()
            .center(0, 0)
            .moveTo(0, -fork_leg_len / 2.0 + 20.0)
            .hole(axle_dia + 1.0)
        )
        leg = leg.translate((0, side_sign * fork_gap / 2.0, 0))
        return leg

    asm.add(make_fork_leg(+1), name="Fork_R", color=cq.Color(0.72, 0.74, 0.78))
    asm.add(make_fork_leg(-1), name="Fork_L", color=cq.Color(0.72, 0.74, 0.78))

    # ---- Top plate + swivel boss ----
    plate = (
        cq.Workplane("XY")
        .rect(top_plate_l, top_plate_w)
        .extrude(top_plate_thk)
    )
    boss = (
        cq.Workplane("XY")
        .circle(swivel_boss_od / 2.0)
        .extrude(25.0)
        .translate((0, 0, -25.0))
    )
    swivel_asm = plate.union(boss)
    swivel_z = fork_leg_len
    if swivel == "swivel":
        asm.add(swivel_asm.translate((swivel_offset, 0, swivel_z)),
                name="Swivel_TopPlate", color=cq.Color(0.72, 0.74, 0.78))
    else:
        # rigid: plate sits directly above the fork
        asm.add(swivel_asm.translate((0, 0, swivel_z)),
                name="TopPlate_Rigid", color=cq.Color(0.72, 0.74, 0.78))

    # ---- Mounting stem (if stem mount) ----
    if mount_type in ("stem", "threaded_stem"):
        stem = (
            cq.Workplane("XY")
            .circle(12.0)
            .extrude(40.0)
            .translate((0, 0, swivel_z + top_plate_thk))
        )
        asm.add(stem, name="MountStem", color=cq.Color(0.55, 0.55, 0.60))

    # ---- Brake (only if requested) ----
    if brake_type in ("face_brake", "total_lock"):
        pivot_offset_x = fork_leg_w / 2.0 + 12.0
        pivot_offset_z = 70.0
        # Foot pedal (orange)
        pedal = (
            cq.Workplane("XZ")
            .center(0, 0)
            .rect(pedal_len - 10.0, 25.0, centered=False)
            .extrude(3.0)
            .translate((0, -12.5, -1.5))
        )
        pedal = pedal.rotate((0, 0, 0), (0, 1, 0), -25.0)
        pedal = pedal.translate((pivot_offset_x, fork_gap / 2.0, pivot_offset_z))
        asm.add(pedal, name="Brake_Pedal", color=cq.Color(0.95, 0.45, 0.10))

        # Curved brake shoe
        shoe_inner_r = wheel_od / 2.0
        shoe_outer_r = wheel_od / 2.0 + 4.0
        annulus = (
            cq.Workplane("XY")
            .circle(shoe_outer_r)
            .circle(shoe_inner_r)
            .extrude(50.0)
            .translate((0, 0, -25.0))
        )
        wedge_w = shoe_outer_r * 2.5
        cut1 = (
            cq.Workplane("XY")
            .rect(wedge_w, wedge_w)
            .extrude(75.0)
            .translate((-wedge_w * 0.7, 0, 0))
        )
        cut2 = (
            cq.Workplane("XY")
            .rect(wedge_w, wedge_w)
            .extrude(75.0)
            .translate((wedge_w * 0.7, 0, 0))
        )
        shoe = annulus.cut(cut1).cut(cut2).rotate((0, 0, 0), (1, 0, 0), 90)
        shoe = shoe.translate((0, fork_gap / 2.0 - 25.0, 0))
        asm.add(shoe, name="Brake_Shoe", color=cq.Color(0.95, 0.45, 0.10))

        # Linkage arm
        shoe_pivot_offset_x = fork_leg_w / 2.0 + 12.0
        shoe_pivot_offset_z = 25.0
        dx = pivot_offset_x - shoe_pivot_offset_x
        dz = pivot_offset_z - shoe_pivot_offset_z
        link_angle = math.degrees(math.atan2(dz, dx))
        link_len = math.sqrt(dx * dx + dz * dz)
        link = (
            cq.Workplane("XZ")
            .center(0, 0)
            .rect(link_len, 3.0, centered=False)
            .extrude(12.0)
            .translate((0, -6.0, -1.5))
        )
        link = link.rotate((0, 0, 0), (0, 1, 0), link_angle)
        link = link.translate((shoe_pivot_offset_x, fork_gap / 2.0, shoe_pivot_offset_z))
        asm.add(link, name="Brake_LinkageArm", color=cq.Color(0.95, 0.45, 0.10))

    return asm


# ============================================================================
# ROSETTE  (adapted from ringlock_rosette.py)
# ============================================================================
def build_rosette(cfg: Dict[str, Any]) -> cq.Workplane:
    disc_od = float(cfg.get("disc_od", 122.0))
    disc_thk = float(cfg.get("thickness", 10.0))
    center_bore = float(cfg.get("center_bore", 50.0))
    small_dia = float(cfg.get("small_hole_dia", 14.0))
    large_dia = float(cfg.get("large_hole_dia", 20.0))
    pcd_r = float(cfg.get("hole_pcd_r", 35.0))
    n_small = int(cfg.get("n_small_holes", 4))
    n_large = int(cfg.get("n_large_holes", 4))

    disc = (
        cq.Workplane("XY")
        .circle(disc_od / 2.0)
        .extrude(disc_thk)
        .faces(">Z").workplane()
        .hole(center_bore)
    )
    # Small holes at evenly spaced angles starting at 0
    for i in range(n_small):
        a = 360.0 * i / max(n_small, 1)
        x = pcd_r * math.cos(math.radians(a))
        y = pcd_r * math.sin(math.radians(a))
        disc = disc.faces(">Z").workplane().moveTo(x, y).hole(small_dia)
    # Large holes offset by half a small-hole step
    step = 360.0 / max(n_small + n_large, 1) if (n_small + n_large) > 0 else 0
    offset = step / 2.0
    for i in range(n_large):
        a = offset + 360.0 * i / max(n_large, 1)
        x = pcd_r * math.cos(math.radians(a))
        y = pcd_r * math.sin(math.radians(a))
        disc = disc.faces(">Z").workplane().moveTo(x, y).hole(large_dia)
    return disc


# ============================================================================
# STANDARD  (adapted from ringlock_standard.py)
# ============================================================================
def build_standard(cfg: Dict[str, Any]) -> cq.Assembly:
    tube_od = float(cfg.get("tube_od", 48.3))
    tube_wall = float(cfg.get("tube_wall", 3.2))
    tube_len = float(cfg.get("tube_length", 1000.0))
    pitch = float(cfg.get("rosette_pitch", 500.0))
    n_ros = int(cfg.get("rosette_count", max(1, int(tube_len // pitch))))
    disc_od = float(cfg.get("rosette_disc_od", 122.0))
    disc_thk = float(cfg.get("rosette_thickness", 10.0))
    center_bore = float(cfg.get("rosette_center_bore", 50.0))
    spigot_od = float(cfg.get("spigot_od", 38.0))
    spigot_len = float(cfg.get("spigot_length", 150.0))

    tube_id = tube_od - 2.0 * tube_wall

    tube = (
        cq.Workplane("XY")
        .circle(tube_od / 2.0)
        .circle(tube_id / 2.0)
        .extrude(tube_len)
    )

    rosette = (
        cq.Workplane("XY")
        .circle(disc_od / 2.0)
        .extrude(disc_thk)
        .faces(">Z").workplane()
        .hole(center_bore)
    )
    for a in [0.0, 90.0, 180.0, 270.0]:
        x = 35.0 * math.cos(math.radians(a))
        y = 35.0 * math.sin(math.radians(a))
        rosette = rosette.faces(">Z").workplane().moveTo(x, y).hole(14.0)
    for a in [45.0, 135.0, 225.0, 315.0]:
        x = 35.0 * math.cos(math.radians(a))
        y = 35.0 * math.sin(math.radians(a))
        rosette = rosette.faces(">Z").workplane().moveTo(x, y).hole(20.0)

    spigot = (
        cq.Workplane("XY")
        .circle(spigot_od / 2.0)
        .circle(26.0 / 2.0)
        .extrude(spigot_len)
    )

    asm = cq.Assembly(name=f"Ringlock_Standard_{int(tube_len)}mm")
    asm.add(tube, name="Tube",
            loc=cq.Location(cq.Vector(0, 0, 0)),
            color=cq.Color(0.55, 0.55, 0.58))
    for i in range(n_ros):
        # Place rosettes at z = (i+1)*pitch, centred on that z
        z = (i + 1) * pitch
        if z > tube_len:
            z = tube_len
        asm.add(
            rosette,
            name=f"Rosette_{i + 1}_z{int(z)}mm",
            loc=cq.Location(cq.Vector(0, 0, z - disc_thk / 2.0)),
            color=cq.Color(0.85, 0.55, 0.2),
        )
    asm.add(spigot, name="Spigot",
            loc=cq.Location(cq.Vector(0, 0, tube_len)),
            color=cq.Color(0.40, 0.40, 0.45))
    return asm


# ============================================================================
# Dispatcher
# ============================================================================
def build_part(cfg: Dict[str, Any]) -> Tuple[Any, List[str]]:
    """Return (cadquery_object, warnings). Object is Workplane or Assembly."""
    warnings: List[str] = []
    ptype = str(cfg.get("type", "")).strip().lower()
    if ptype == "caster":
        return build_caster(cfg), warnings
    if ptype == "rosette":
        return build_rosette(cfg), warnings
    if ptype == "standard":
        return build_standard(cfg), warnings
    raise ValueError(f"Unknown part type: {ptype!r}")


def export_step(obj: Any, out_path: str) -> None:
    """cadquery Workplane uses cq.exporters.export; Assembly uses .save()."""
    if isinstance(obj, cq.Assembly):
        obj.save(out_path, exportType="STEP")
    else:
        cq.exporters.export(obj, out_path, exportType="STEP")


# ============================================================================
# CLI
# ============================================================================
def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate a STEP file from JSON config.")
    parser.add_argument("--config", required=True, help="Path to JSON config file")
    parser.add_argument("--output", required=True, help="Path to write STEP file")
    args = parser.parse_args(argv)

    try:
        with open(args.config, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        obj, warnings = build_part(cfg)
        export_step(obj, args.output)
        size_kb = os.path.getsize(args.output) / 1024.0
        result = {
            "status": "ok",
            "step_path": args.output,
            "size_kb": round(size_kb, 1),
            "warnings": warnings,
        }
        print(json.dumps(result))
        return 0
    except Exception as exc:  # noqa: BLE001 — we want a single JSON error
        tb = traceback.format_exc(limit=8)
        result = {
            "status": "error",
            "message": str(exc),
            "traceback": tb,
        }
        print(json.dumps(result))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
