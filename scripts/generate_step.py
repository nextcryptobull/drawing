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
# TOWER  (complete scaffold tower assembly)
# ============================================================================
def build_tower(cfg: Dict[str, Any]) -> cq.Assembly:
    """Build a complete ringlock scaffold tower assembly.

    Layout:
      - Standards (vertical tubes) at grid corners (i*bay_x, j*bay_y)
      - Rosettes on each standard at each lift level
      - Ledgers (horizontal tubes) connecting adjacent standards at each level
      - Diagonal braces on perimeter faces (if include_braces)
      - Base jacks below each standard (if include_base_jacks)
      - Planks on top level (if include_planks)
    """
    bays_x = int(cfg.get("bays_x", 1))
    bays_y = int(cfg.get("bays_y", 1))
    bay_x = float(cfg.get("bay_length_x", 2570.0))
    bay_y = float(cfg.get("bay_length_y", 1090.0))
    lift_h = float(cfg.get("lift_height", 2000.0))
    num_lifts = int(cfg.get("num_lifts", 1))

    tube_od = float(cfg.get("tube_od", 48.3))
    tube_wall = float(cfg.get("tube_wall", 3.2))
    tube_id = tube_od - 2.0 * tube_wall
    pitch = float(cfg.get("rosette_pitch", 500.0))
    disc_od = float(cfg.get("rosette_disc_od", 122.0))
    disc_thk = float(cfg.get("rosette_thickness", 10.0))
    center_bore = float(cfg.get("rosette_center_bore", 50.0))
    spigot_od = float(cfg.get("spigot_od", 38.0))
    spigot_len = float(cfg.get("spigot_length", 150.0))

    ledger_od = float(cfg.get("ledger_od", 48.3))
    ledger_wall = float(cfg.get("ledger_wall", 3.2))
    ledger_id = ledger_od - 2.0 * ledger_wall

    include_braces = bool(cfg.get("include_braces", True))
    include_base_jacks = bool(cfg.get("include_base_jacks", True))
    base_jack_od = float(cfg.get("base_jack_od", 38.0))
    base_jack_len = float(cfg.get("base_jack_length", 600.0))

    include_planks = bool(cfg.get("include_planks", False))
    plank_thk = float(cfg.get("plank_thickness", 50.0))

    tower_height = num_lifts * lift_h
    tower_x = bays_x * bay_x
    tower_y = bays_y * bay_y

    # ---- Build reusable part templates ----
    # Standard tube (vertical)
    tube = (
        cq.Workplane("XY")
        .circle(tube_od / 2.0)
        .circle(tube_id / 2.0)
        .extrude(tower_height)
    )

    # Rosette disc with 8 holes
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

    # Spigot
    spigot = (
        cq.Workplane("XY")
        .circle(spigot_od / 2.0)
        .circle(26.0 / 2.0)
        .extrude(spigot_len)
    )

    # Base jack
    base_jack = (
        cq.Workplane("XY")
        .circle(base_jack_od / 2.0)
        .extrude(base_jack_len)
    )

    # Ledger tube (will be rotated/translated as needed)
    ledger_x = (
        cq.Workplane("XY")
        .circle(ledger_od / 2.0)
        .circle(ledger_id / 2.0)
        .extrude(bay_x)
        .translate((bay_x / 2.0, 0, 0))
    )

    ledger_y = (
        cq.Workplane("XY")
        .circle(ledger_od / 2.0)
        .circle(ledger_id / 2.0)
        .extrude(bay_y)
        .translate((0, bay_y / 2.0, 0))
    )

    # ---- Build the assembly ----
    asm = cq.Assembly(name=f"Scaffold_Tower_{bays_x}x{bays_y}_{int(tower_height)}mm")

    # Standards + rosettes + spigots + base jacks
    std_count = 0
    for i in range(bays_x + 1):
        for j in range(bays_y + 1):
            x = i * bay_x - tower_x / 2.0
            y = j * bay_y - tower_y / 2.0
            std_count += 1

            # Base: jack or wheel (below ground)
            base_type = str(cfg.get("base_type", "jack"))
            if base_type == "wheel":
                # Caster wheel assembly: wheel + fork + stem
                wheel_od = 100.0  # 100mm wheel
                wheel_w = 40.0
                wheel = (
                    cq.Workplane("XY")
                    .circle(wheel_od / 2.0)
                    .extrude(wheel_w)
                )
                asm.add(
                    wheel,
                    name=f"Wheel_{std_count}",
                    loc=cq.Location(cq.Vector(x, y, -120)),
                    color=cq.Color(0.10, 0.30, 0.85),  # blue
                )
                # Fork plate
                fork = (
                    cq.Workplane("XY")
                    .box(70, 50, 6)
                )
                asm.add(
                    fork,
                    name=f"Fork_{std_count}",
                    loc=cq.Location(cq.Vector(x, y, -65)),
                    color=cq.Color(0.42, 0.44, 0.46),
                )
                # Stem
                stem = (
                    cq.Workplane("XY")
                    .circle(15 / 2.0)
                    .extrude(60)
                )
                asm.add(
                    stem,
                    name=f"Stem_{std_count}",
                    loc=cq.Location(cq.Vector(x, y, -35)),
                    color=cq.Color(0.42, 0.44, 0.46),
                )
            elif include_base_jacks:
                asm.add(
                    base_jack,
                    name=f"BaseJack_{std_count}",
                    loc=cq.Location(cq.Vector(x, y, -base_jack_len)),
                    color=cq.Color(0.30, 0.30, 0.35),
                )

            # Vertical tube
            asm.add(
                tube,
                name=f"Standard_{std_count}",
                loc=cq.Location(cq.Vector(x, y, 0)),
                color=cq.Color(0.55, 0.55, 0.58),
            )

            # Rosettes at each lift level
            for k in range(1, num_lifts + 1):
                z = k * lift_h
                asm.add(
                    rosette,
                    name=f"Rosette_{std_count}_L{k}",
                    loc=cq.Location(cq.Vector(x, y, z - disc_thk / 2.0)),
                    color=cq.Color(0.85, 0.55, 0.2),
                )

            # Top spigot
            asm.add(
                spigot,
                name=f"Spigot_{std_count}",
                loc=cq.Location(cq.Vector(x, y, tower_height)),
                color=cq.Color(0.40, 0.40, 0.45),
            )

    # Ledgers at each lift level
    for k in range(1, num_lifts + 1):
        z = k * lift_h
        # Ledgers along X (connect standards at same j, different i)
        for j in range(bays_y + 1):
            for i in range(bays_x):
                x = i * bay_x - tower_x / 2.0
                y = j * bay_y - tower_y / 2.0
                asm.add(
                    ledger_x,
                    name=f"LedgerX_L{k}_{i}_{j}",
                    loc=cq.Location(cq.Vector(x, y, z)),
                    color=cq.Color(0.50, 0.50, 0.55),
                )
        # Ledgers along Y (connect standards at same i, different j)
        for i in range(bays_x + 1):
            for j in range(bays_y):
                x = i * bay_x - tower_x / 2.0
                y = j * bay_y - tower_y / 2.0
                asm.add(
                    ledger_y,
                    name=f"LedgerY_L{k}_{i}_{j}",
                    loc=cq.Location(cq.Vector(x, y, z)),
                    color=cq.Color(0.50, 0.50, 0.55),
                )

    # Diagonal braces on perimeter faces
    # Real scaffold practice: ONE diagonal per side, with opposite direction
    # across (adjacent sides have opposite diagonal directions). NOT X-pattern.
    if include_braces:
        brace_thk = 4.0
        for k in range(num_lifts):
            z1 = k * lift_h
            z2 = (k + 1) * lift_h
            # X-perimeter faces (i=0 and i=bays_x) — opposite directions
            for side_idx in [0, 1]:
                i = 0 if side_idx == 0 else bays_x
                x = i * bay_x - tower_x / 2.0
                # side 0: bottom-left → top-right, side 1: top-left → bottom-right
                dir_sign = 1 if side_idx == 0 else -1
                for j in range(bays_y):
                    y1 = j * bay_y - tower_y / 2.0
                    y2 = (j + 1) * bay_y - tower_y / 2.0
                    brace_len = math.sqrt(bay_y * bay_y + (z2 - z1) ** 2)
                    mid_x = x
                    mid_y = (y1 + y2) / 2.0
                    mid_z = (z1 + z2) / 2.0
                    brace = (
                        cq.Workplane("XY")
                        .circle(brace_thk / 2.0)
                        .extrude(brace_len)
                    )
                    suffix = "A" if dir_sign > 0 else "B"
                    asm.add(
                        brace,
                        name=f"BraceX_L{k}_{i}_{j}_{suffix}",
                        loc=cq.Location(cq.Vector(mid_x, mid_y, mid_z)),
                        color=cq.Color(0.30, 0.60, 0.30),
                    )
            # Y-perimeter faces (j=0 and j=bays_y) — opposite directions
            for side_idx in [0, 1]:
                j = 0 if side_idx == 0 else bays_y
                y = j * bay_y - tower_y / 2.0
                dir_sign = 1 if side_idx == 0 else -1
                for i in range(bays_x):
                    x1 = i * bay_x - tower_x / 2.0
                    x2 = (i + 1) * bay_x - tower_x / 2.0
                    brace_len = math.sqrt(bay_x * bay_x + (z2 - z1) ** 2)
                    mid_x = (x1 + x2) / 2.0
                    mid_y = y
                    mid_z = (z1 + z2) / 2.0
                    brace = (
                        cq.Workplane("XY")
                        .circle(brace_thk / 2.0)
                        .extrude(brace_len)
                    )
                    suffix = "A" if dir_sign > 0 else "B"
                    asm.add(
                        brace,
                        name=f"BraceY_L{k}_{i}_{j}_{suffix}",
                        loc=cq.Location(cq.Vector(mid_x, mid_y, mid_z)),
                        color=cq.Color(0.30, 0.60, 0.30),
                    )

    # Planks on top level
    if include_planks:
        top_z = tower_height + plank_thk / 2.0
        for i in range(bays_x):
            for j in range(bays_y):
                x = (i + 0.5) * bay_x - tower_x / 2.0
                y = (j + 0.5) * bay_y - tower_y / 2.0
                plank = (
                    cq.Workplane("XY")
                    .box(bay_x * 0.92, bay_y * 0.92, plank_thk)
                )
                asm.add(
                    plank,
                    name=f"Plank_{i}_{j}",
                    loc=cq.Location(cq.Vector(x, y, top_z)),
                    color=cq.Color(0.55, 0.40, 0.25),
                )

    # Grating platforms per level — 2 pieces + 1 open (working platform > access)
    # Working platform = 2/3 of bay (LARGER than access opening = 1/3).
    # Gratings follow WIDTH (Y direction, shorter span).
    # Bay divided into 3 sections along X (length).
    #
    # Opening STAGGERS between levels:
    # - Odd levels (1,3,5...): opening on +X (front) side, boards on sections 0,1
    # - Even levels (2,4,6...): opening on -X (back) side, boards on sections 1,2
    # This prevents fall-through: each opening is covered by the level below.
    include_gratings = bool(cfg.get("include_gratings", True))
    if include_gratings:
        grating_thk = 8.0
        for k in range(1, num_lifts + 1):
            level_z = k * lift_h
            grating_z = level_z - grating_thk / 2.0 - 2.0
            is_open_at_front = (k % 2 == 1)  # odd levels open at front (+X)
            for i in range(bays_x):
                for j in range(bays_y):
                    bay_center_x = (i + 0.5) * bay_x - tower_x / 2.0
                    bay_center_y = (j + 0.5) * bay_y - tower_y / 2.0
                    board_len_y = bay_y * 0.94
                    section_width = bay_x / 3.0
                    # Section X positions (0=back, 1=middle, 2=front)
                    section_x0 = bay_center_x - bay_x / 2.0 + section_width / 2.0
                    section_x1 = bay_center_x - bay_x / 2.0 + section_width + section_width / 2.0
                    section_x2 = bay_center_x - bay_x / 2.0 + 2.0 * section_width + section_width / 2.0
                    # Which 2 sections get boards
                    board_sections = [section_x0, section_x1] if is_open_at_front else [section_x1, section_x2]
                    for bi, board_x in enumerate(board_sections):
                        board = (
                            cq.Workplane("XY")
                            .box(section_width * 0.9, board_len_y, grating_thk)
                        )
                        asm.add(
                            board,
                            name=f"Grating_L{k}_{i}_{j}_{bi}",
                            loc=cq.Location(cq.Vector(board_x, bay_center_y, grating_z)),
                            color=cq.Color(0.35, 0.42, 0.48),
                        )

    # Toeboards per level (yellow safety boards around platform perimeter)
    # The +Y (front/access) side has NO toeboard — open for ladder access.
    include_toeboards = bool(cfg.get("include_toeboards", True))
    if include_toeboards:
        toeboard_h = 100.0  # 100mm high (industry standard)
        toeboard_thk = 10.0  # 10mm thick
        for k in range(1, num_lifts + 1):
            level_z = k * lift_h
            grating_z = level_z - 5.0 - 5.0  # align with grating
            toeboard_center_z = grating_z + toeboard_h / 2.0
            # South side (along Y-)
            tb_south = (
                cq.Workplane("XY")
                .box(tower_x, toeboard_thk, toeboard_h)
            )
            asm.add(
                tb_south,
                name=f"Toeboard_S_L{k}",
                loc=cq.Location(cq.Vector(0, -tower_y / 2 + toeboard_thk / 2, toeboard_center_z)),
                color=cq.Color(0.83, 0.63, 0.09),
            )
            # East side (along X+)
            tb_east = (
                cq.Workplane("XY")
                .box(toeboard_thk, tower_y, toeboard_h)
            )
            asm.add(
                tb_east,
                name=f"Toeboard_E_L{k}",
                loc=cq.Location(cq.Vector(tower_x / 2 - toeboard_thk / 2, 0, toeboard_center_z)),
                color=cq.Color(0.83, 0.63, 0.09),
            )
            # West side (along X-)
            tb_west = (
                cq.Workplane("XY")
                .box(toeboard_thk, tower_y, toeboard_h)
            )
            asm.add(
                tb_west,
                name=f"Toeboard_W_L{k}",
                loc=cq.Location(cq.Vector(-tower_x / 2 + toeboard_thk / 2, 0, toeboard_center_z)),
                color=cq.Color(0.83, 0.63, 0.09),
            )
            # Note: North side (+Y) has NO toeboard — open for access

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
    if ptype == "tower":
        return build_tower(cfg), warnings
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
