"""
Parametric Ringlock scaffolding STANDARD (vertical upright) assembly.

Builds:
  - Main tube : 48.3 mm OD x 3.2 mm wall x 1000 mm long  (Q345/S355 steel)
  - 2 rosettes welded at z = 500 mm and z = 1000 mm (500 mm pitch per EN 12811)
  - Male spigot at top (38 mm OD x 150 mm) for stacking standards

Outputs a STEP assembly (multi-solid) that opens in SolidWorks as an
assembly with each rosette as a separate part -> fully editable.
"""

import cadquery as cq
import os

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ----------------------------- PARAMETERS -----------------------------------
# Main tube
TUBE_OD    = 48.3
TUBE_WALL  = 3.2
TUBE_ID    = TUBE_OD - 2 * TUBE_WALL        # 41.9 mm
TUBE_LEN   = 1000.0

# Rosette (must match ringlock_rosette.py)
DISC_OD        = 122.0
DISC_THK       = 10.0
CENTER_BORE    = 50.0      # slips over TUBE_OD = 48.3 mm with ~0.85 mm radial clearance for welding
SMALL_HOLE_DIA = 14.0
LARGE_HOLE_DIA = 20.0
HOLE_PCD_R     = 35.0

# Rosette positions along the tube (z, measured from bottom of tube)
ROSETTE_Z_POSITIONS = [500.0, 1000.0]      # 2 rosettes on a 1 m standard, 500 mm pitch

# Spigot (top, male, for stacking)
SPIGOT_OD       = 38.0
SPIGOT_LEN      = 150.0
SPIGOT_BORE     = 26.0     # hollow to save weight

# ----------------------------- HELPERS --------------------------------------
import math

def make_rosette():
    """Build a single rosette disc (no chamfers/fillets, see rosette script)."""
    d = (cq.Workplane("XY")
         .circle(DISC_OD / 2.0)
         .extrude(DISC_THK)
         .faces(">Z").workplane()
         .hole(CENTER_BORE))
    for a in [0.0, 90.0, 180.0, 270.0]:
        x = HOLE_PCD_R * math.cos(math.radians(a))
        y = HOLE_PCD_R * math.sin(math.radians(a))
        d = d.faces(">Z").workplane().moveTo(x, y).hole(SMALL_HOLE_DIA)
    for a in [45.0, 135.0, 225.0, 315.0]:
        x = HOLE_PCD_R * math.cos(math.radians(a))
        y = HOLE_PCD_R * math.sin(math.radians(a))
        d = d.faces(">Z").workplane().moveTo(x, y).hole(LARGE_HOLE_DIA)
    return d

def make_tube():
    """Main vertical tube, origin at bottom, axis along +Z."""
    return (cq.Workplane("XY")
              .circle(TUBE_OD / 2.0)
              .circle(TUBE_ID / 2.0)
              .extrude(TUBE_LEN))

def make_spigot():
    """Male spigot on top of the tube for stacking the next standard."""
    return (cq.Workplane("XY")
              .circle(SPIGOT_OD / 2.0)
              .circle(SPIGOT_BORE / 2.0)
              .extrude(SPIGOT_LEN))

# ----------------------------- BUILD ASSEMBLY -------------------------------
asm = cq.Assembly(name="Ringlock_Standard_1m")

# Tube (origin = bottom of tube, along Z)
tube = make_tube()
asm.add(tube, name="Tube_48.3x3.2x1000", loc=cq.Location(cq.Vector(0, 0, 0)))

# Rosettes: center the disc on the tube at each z position.
# Rosette is built with thickness 0..DISC_THK along Z, so shift down by DISC_THK/2
# to center it on the target z.
rosette = make_rosette()
for i, z in enumerate(ROSETTE_Z_POSITIONS, start=1):
    asm.add(
        rosette,
        name=f"Rosette_{i}_z{int(z)}mm",
        loc=cq.Location(cq.Vector(0, 0, z - DISC_THK / 2.0)),
        color=cq.Color(0.85, 0.55, 0.2),  # warm orange to distinguish
    )

# Spigot: sits on top of tube, half inside the upper rosette
spigot = make_spigot()
asm.add(
    spigot,
    name="Spigot_38x150",
    loc=cq.Location(cq.Vector(0, 0, TUBE_LEN)),
    color=cq.Color(0.4, 0.4, 0.45),
)

# ----------------------------- EXPORT ---------------------------------------
step_path = os.path.join(OUT_DIR, "ringlock_standard_1m.step")
stl_path  = os.path.join(OUT_DIR, "ringlock_standard_1m.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.05, angularTolerance=0.2)

# Report volumes (tube + 2 rosettes + spigot)
steel_rho = 7.85e-6  # kg/mm^3
vol_tube   = tube.val().Volume()
vol_ros    = rosette.val().Volume()
vol_spigot = spigot.val().Volume()
total_vol = vol_tube + len(ROSETTE_Z_POSITIONS) * vol_ros + vol_spigot
print(f"Tube volume     : {vol_tube:9.1f} mm^3  -> mass {vol_tube * steel_rho:.3f} kg")
print(f"Rosette volume  : {vol_ros:9.1f} mm^3  -> mass {vol_ros * steel_rho:.3f} kg x{len(ROSETTE_Z_POSITIONS)}")
print(f"Spigot volume   : {vol_spigot:9.1f} mm^3  -> mass {vol_spigot * steel_rho:.3f} kg")
print(f"Total volume    : {total_vol:9.1f} mm^3")
print(f"Total mass      : {total_vol * steel_rho:.3f} kg  (steel, no galvanizing)")
print(f"STEP  -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL   -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
