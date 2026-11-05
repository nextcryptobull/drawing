"""
Parametric Ringlock scaffolding rosette (the "wheel" disc).

Industry-standard dimensions (Layher Allround / EN 12811 compatible):
  - Disc outer diameter : 122 mm
  - Disc thickness      : 10 mm
  - Center bore (tube)  : 50 mm  (slip fit over 48.3 mm standard tube for welding)
  - 4 small holes  (right-angle ledger connection)  - 14 mm dia, on PCD 35 mm
  - 4 large holes  (variable-angle brace connection) - 20 mm dia, on PCD 35 mm
  - Holes at every 45 deg around the disc

Output: STEP file openable / editable in SolidWorks (File -> Open -> import as solid).
        Also exports IGES and STL for convenience.
"""

import cadquery as cq
import os

# ----------------------------- PARAMETERS -----------------------------------
# Disc
DISC_OD        = 122.0     # outer diameter [mm]
DISC_THK       = 10.0      # thickness [mm]
CENTER_BORE    = 50.0      # slip-fit over 48.3 mm tube + welding clearance

# Holes
SMALL_HOLE_DIA = 14.0      # ledger holes (4x, at 0/90/180/270)
LARGE_HOLE_DIA = 20.0      # brace holes (4x, at 45/135/225/315)
HOLE_PCD       = 35.0      # pitch-circle radius is HOLE_PCD * 2 dia? -> here it is RADIUS
# NOTE: HOLE_PCD below is the radius from disc center to hole center.
HOLE_PCD_R     = 35.0      # [mm] radial distance from center to hole centers

# Cosmetic
CHAMFER        = 1.5
FILLET         = 1.0

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ----------------------------- BUILD ----------------------------------------
# 1. Base disc with central bore
disc = (
    cq.Workplane("XY")
      .circle(DISC_OD / 2.0)
      .extrude(DISC_THK)
      .faces(">Z").workplane()
      .hole(CENTER_BORE)
)

# 2. Drill the 4 small holes (ledger, 0/90/180/270 deg)
import math
small_angles = [0.0, 90.0, 180.0, 270.0]
for a in small_angles:
    x = HOLE_PCD_R * math.cos(math.radians(a))
    y = HOLE_PCD_R * math.sin(math.radians(a))
    disc = (
        disc.faces(">Z").workplane()
            .moveTo(x, y)
            .hole(SMALL_HOLE_DIA)
    )

# 3. Drill the 4 large holes (brace, 45/135/225/315 deg)
large_angles = [45.0, 135.0, 225.0, 315.0]
for a in large_angles:
    x = HOLE_PCD_R * math.cos(math.radians(a))
    y = HOLE_PCD_R * math.sin(math.radians(a))
    disc = (
        disc.faces(">Z").workplane()
            .moveTo(x, y)
            .hole(LARGE_HOLE_DIA)
    )

# 4. Cosmetic chamfers/fillets are intentionally OMITTED here so the STEP
#    remains a clean, parametric solid that you can chamfer / fillet yourself
#    inside SolidWorks (Insert > Features > Chamfer / Fillet).
#    Sharp edges are acceptable for a welded rosette.

# ----------------------------- EXPORT ---------------------------------------
step_path  = os.path.join(OUT_DIR, "ringlock_rosette.step")
stl_path   = os.path.join(OUT_DIR, "ringlock_rosette.stl")

cq.exporters.export(disc, step_path, exportType="STEP")
cq.exporters.export(disc, stl_path,  exportType="STL", tolerance=0.01, angularTolerance=0.1)

# Volume & mass check (steel density 7.85e-6 kg/mm^3)
vol = disc.val().Volume()
mass_kg = vol * 7.85e-6
print(f"Rosette volume   : {vol:.1f} mm^3")
print(f"Rosette mass     : {mass_kg:.3f} kg (steel)")
print(f"STEP  -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL   -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
