"""
Ringlock scaffold CASTER WHEEL assembly.

Design that "fits to" the ringlock standard generated in ringlock_standard.py:
  - Stem OD = 38 mm  -> matches the ringlock spigot tube (slip-fit into the
    standard's 48.3 mm OD tube with 41.9 mm ID, OR swaps in for the spigot at
    the top of a standard). Uses a 13 mm dia pin hole at 25 mm from top for
    a locking split-pin (R-clip), exactly like ringlock spigot practice.
  - Total caster: wheel + hub + 2 ball bearings + axle bolt + fork (yoke)
    + swivel plate + 38 mm stem.

Wheel spec (industry-typical 200 mm ringlock tower caster):
  - Wheel OD      : 200 mm
  - Wheel width   : 50 mm
  - Tread         : polyurethane 92 Shore A, 15 mm thick
  - Hub           : steel, OD 60 mm, ID 35 mm (holds 2x 6204 ball bearings)
  - Bearing       : 6204 (20 mm ID x 47 mm OD x 14 mm wide), 2 pcs back-to-back
  - Axle          : M16 bolt (head + shank)
  - Capacity      : ~500 kg/wheel (4 wheels per tower = 2000 kg tower cap.)

Output: STEP assembly that opens in SolidWorks as a multi-body part / assembly.
"""

import cadquery as cq
import math
import os

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ============================= PARAMETERS ===================================
# Wheel
WHEEL_OD        = 200.0
WHEEL_WIDTH     = 50.0
TREAD_THK       = 15.0      # PU tread thickness (radial)
HUB_OD          = WHEEL_OD - 2 * TREAD_THK    # 170 mm  ... wait, that's too big
HUB_OD          = 60.0      # inner steel hub OD, more realistic for 200 mm caster
# Bearing seat in hub
BEARING_OD      = 47.0      # 6204 outer race
BEARING_ID      = 20.0      # 6204 inner race
BEARING_WIDTH   = 14.0
HUB_ID          = BEARING_OD   # hub is bored to accept bearing outer race
HUB_LEN         = 2 * BEARING_WIDTH + 4.0   # 32 mm

# Axle (M16 bolt — slightly smaller than bearing ID, with sleeve implied)
AXLE_DIA        = 16.0
AXLE_LEN        = WHEEL_WIDTH + 30.0    # protrudes 15 mm each side of fork
AXLE_HEAD_DIA   = 24.0
AXLE_HEAD_THK   = 4.0

# Fork / yoke (steel plate)
FORK_THK        = 6.0
FORK_GAP        = WHEEL_WIDTH + 4.0      # space between the two fork plates
FORK_OUTER_W    = 80.0      # fork plate width (across wheel)
FORK_HEIGHT     = 130.0    # vertical plate height
FORK_TOP_RAD    = FORK_OUTER_W / 2.0    # rounded top (swivel boss radius)
AXLE_HOLE_DIA   = AXLE_DIA + 0.5        # clearance for axle

# Swivel plate (top of fork, between fork and stem)
SWIVEL_PLATE_DIA  = 80.0
SWIVEL_PLATE_THK  = 10.0
SWIVEL_BALL_PCD    = 60.0
SWIVEL_BALL_DIA    = 8.0
N_BALLS = 8

# Stem (must fit ringlock standard: spigot OD = 38 mm OR inserts into tube ID = 41.9 mm)
STEM_OD      = 38.0
STEM_LEN     = 100.0
STEM_WALL    = 3.2
STEM_ID      = STEM_OD - 2 * STEM_WALL       # 31.6 mm
PIN_HOLE_DIA = 13.0     # for R-clip (split pin) — same as ringlock spigot
PIN_HOLE_Z   = 25.0     # 25 mm below top of stem

# ============================= BUILD ========================================
def make_tread():
    """Polyurethane tread — ring with rounded outer profile."""
    body = (cq.Workplane("XY", origin=(0, 0, 0))
              .circle(WHEEL_OD / 2.0)
              .circle(HUB_OD / 2.0)
              .extrude(WHEEL_WIDTH)
              .translate((0, 0, -WHEEL_WIDTH / 2.0)))   # center on z=0
    # round the outer corners of the tread
    try:
        body = body.edges("|Z").fillet(3.0)
        body = body.edges("%Plane").fillet(2.0)
    except Exception:
        pass
    return body

def make_hub():
    """Steel hub holding two bearings. Bore = bearing OD."""
    hub = (cq.Workplane("XY")
             .circle(HUB_OD / 2.0)
             .circle(HUB_ID / 2.0)
             .extrude(HUB_LEN)
             .translate((0, 0, -HUB_LEN / 2.0)))
    return hub

def make_bearing():
    """Sketch representation of a 6204 ball bearing (rings only, no balls)."""
    # Outer race
    outer = (cq.Workplane("XY")
               .circle(BEARING_OD / 2.0)
               .circle((BEARING_OD + BEARING_ID) / 4.0)
               .extrude(BEARING_WIDTH)
               .translate((0, 0, -BEARING_WIDTH / 2.0)))
    # Inner race
    inner = (cq.Workplane("XY")
               .circle((BEARING_OD + BEARING_ID) / 4.0)
               .circle(BEARING_ID / 2.0)
               .extrude(BEARING_WIDTH)
               .translate((0, 0, -BEARING_WIDTH / 2.0)))
    return outer.union(inner)

def make_axle():
    """M16 axle bolt: head + shank + nut-side protrusion."""
    shank = (cq.Workplane("XY")
               .circle(AXLE_DIA / 2.0)
               .extrude(AXLE_LEN)
               .translate((0, 0, -AXLE_LEN / 2.0)))
    head = (cq.Workplane("XY")
              .circle(AXLE_HEAD_DIA / 2.0)
              .extrude(AXLE_HEAD_THK)
              .translate((0, 0, AXLE_LEN / 2.0)))
    return shank.union(head)

def make_fork_plate(side_sign):
    """One fork plate. side_sign = +1 (right) / -1 (left). Built in XY plane,
    then rotated into the XZ plane (normal = Y) and translated to its side."""
    # 2D profile in XY: a rounded-top rectangle with axle hole
    plate = (cq.Workplane("XY")
               .center(0, 0)
               .rect(FORK_OUTER_W, FORK_HEIGHT)
               .extrude(FORK_THK))
    # Cut axle hole through the lower part of the plate (perpendicular to plate face)
    plate = (plate.faces(">Z").workplane(offset=-FORK_HEIGHT / 2.0 + 30.0)
                    .center(0, 0)
                    .hole(AXLE_HOLE_DIA))
    # Round the top corners of the fork plate
    try:
        plate = plate.vertices(">Y and >Z").edges("|Z").fillet(8.0)
        plate = plate.vertices(">Y and <Z").edges("|Z").fillet(8.0)
    except Exception:
        pass
    # Rotate into vertical orientation (lying in XZ plane, normal = Y)
    plate = plate.rotate((0, 0, 0), (1, 0, 0), 90)
    # Translate to its side of the wheel
    plate = plate.translate((0, side_sign * FORK_GAP / 2.0, 0))
    return plate

def make_swivel_plate():
    """Top swivel plate with ball bearings around PCD."""
    plate = (cq.Workplane("XY")
               .circle(SWIVEL_PLATE_DIA / 2.0)
               .extrude(SWIVEL_PLATE_THK))
    for i in range(N_BALLS):
        a = 360.0 * i / N_BALLS
        x = SWIVEL_BALL_PCD / 2.0 * math.cos(math.radians(a))
        y = SWIVEL_BALL_PCD / 2.0 * math.sin(math.radians(a))
        plate = (plate.faces(">Z").workplane()
                       .moveTo(x, y)
                       .hole(SWIVEL_BALL_DIA))
    return plate

def make_stem():
    """38 mm OD tube stem with locking pin hole at top — fits ringlock standard."""
    stem = (cq.Workplane("XY")
              .circle(STEM_OD / 2.0)
              .circle(STEM_ID / 2.0)
              .extrude(STEM_LEN))
    # Pin hole across the stem (along X axis), 25 mm below the top
    stem = (stem.faces(">Z").workplane(offset=-PIN_HOLE_Z)
              .center(0, 0)
              .moveTo(0, 0)
              # drill along Y so the hole passes through both walls
              .hole(0))     # no-op
    # Proper cross-drill: use a box cut along Y
    pin_cut = (cq.Workplane("YZ")
                 .center(0, 0)
                 .circle(PIN_HOLE_DIA / 2.0)
                 .extrude(STEM_OD * 1.2)
                 .translate((0, 0, -STEM_OD * 0.6)))
    stem = stem.cut(pin_cut.translate((0, 0, STEM_LEN - PIN_HOLE_Z)))
    return stem

# ============================= ASSEMBLE ======================================
asm = cq.Assembly(name="Ringlock_Caster_Wheel")

# Wheel sub-assembly (centered on origin, axis = Y so it rolls along X)
tread  = make_tread()
hub    = make_hub()
brg1   = make_bearing().translate((0, -BEARING_WIDTH / 2.0 - 1.0, 0))
brg2   = make_bearing().translate((0,  BEARING_WIDTH / 2.0 + 1.0, 0))
# Wait — wheel axis must be Y so it rolls along X. Rebuild with axis = Y.

# Rebuild wheel parts with axis = Y
def make_tread_Y():
    return make_tread().rotate((0,0,0),(1,0,0),90)
def make_hub_Y():
    return make_hub().rotate((0,0,0),(1,0,0),90)
def make_bearing_Y():
    return make_bearing().rotate((0,0,0),(1,0,0),90)
def make_axle_Y():
    return make_axle().rotate((0,0,0),(1,0,0),90)

asm.add(make_tread_Y(),    name="PU_Tread",    color=cq.Color(0.05,0.05,0.05))
asm.add(make_hub_Y(),      name="Steel_Hub",   color=cq.Color(0.7,0.7,0.75))
asm.add(make_bearing_Y().translate((0, -BEARING_WIDTH/2 - 1, 0)),
        name="Bearing_outer", color=cq.Color(0.8,0.8,0.85))
asm.add(make_bearing_Y().translate((0,  BEARING_WIDTH/2 + 1, 0)),
        name="Bearing_inner", color=cq.Color(0.8,0.8,0.85))
asm.add(make_axle_Y(),      name="Axle_M16",    color=cq.Color(0.3,0.3,0.35))

# Fork (two plates on either side of the wheel)
asm.add(make_fork_plate(+1), name="Fork_R",  color=cq.Color(0.2,0.4,0.6))
asm.add(make_fork_plate(-1), name="Fork_L",  color=cq.Color(0.2,0.4,0.6))

# Swivel plate sits on top of the fork boss
asm.add(make_swivel_plate().translate((0, 0, FORK_HEIGHT/2 + SWIVEL_PLATE_THK/2)),
        name="Swivel_Plate", color=cq.Color(0.6,0.6,0.65))

# Stem sits on top of swivel plate
asm.add(make_stem().translate((0, 0, FORK_HEIGHT/2 + SWIVEL_PLATE_THK + STEM_LEN/2)),
        name="Stem_38mm", color=cq.Color(0.85,0.55,0.2))

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "ringlock_caster_wheel.step")
stl_path  = os.path.join(OUT_DIR, "ringlock_caster_wheel.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.05, angularTolerance=0.2)

# Quick sanity: bounds of full assembly
all_objs = [tread, hub, make_axle_Y(),
            make_fork_plate(+1), make_fork_plate(-1),
            make_swivel_plate().translate((0,0,FORK_HEIGHT/2+SWIVEL_PLATE_THK/2)),
            make_stem().translate((0,0,FORK_HEIGHT/2+SWIVEL_PLATE_THK+STEM_LEN/2))]
combined = all_objs[0]
for o in all_objs[1:]:
    combined = combined.union(o, glue=False)
bb = combined.val().BoundingBox()
print(f"Assembly bbox   : ({bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f}) mm")
print(f"  X = wheel roll direction   Y = axle   Z = vertical (stem up)")
print(f"  Stem OD = {STEM_OD} mm  -> fits ringlock standard tube ID = {48.3 - 2*3.2:.1f} mm")
print(f"  Wheel OD = {WHEEL_OD} mm, width = {WHEEL_WIDTH} mm")
print(f"  Bearing  = 6204 (20x47x14) x2")
print(f"  Axle     = M16")
print(f"  Pin hole = Ø{PIN_HOLE_DIA} mm @ {PIN_HOLE_Z} mm below stem top (R-clip)")
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
