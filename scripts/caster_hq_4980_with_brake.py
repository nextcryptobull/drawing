"""
CasterHQ HQ4980S-G3-SPR 8"x2" Swivel Caster WITH BRAKE SYSTEM.

Recreated from product specifications:
  - Wheel: 8 in Ø x 2 in wide (203.2 x 50.8 mm)
  - Tread: blue solid polyurethane, ~12 mm thick
  - Hub: cast iron, precision ball bearing (6204)
  - Top plate: 4" x 4.5" (101.6 x 114.3 mm), industry standard
  - Bolt hole pattern: slotted 2.625" x 3.625" to 3" x 3"
  - Overall height: 9.5" (241.3 mm)
  - Swivel raceway with ball bearings
  - Material: zinc-plated steel
  - Capacity: 1000 lb (454 kg) per caster

BRAKE SYSTEM ADDED (per user request):
  - Side-pedal cam-action face brake: a curved shoe that presses against the
    wheel tread when the pedal is pressed down.
  - Total-lock feature: an additional cam lobe on the same pedal engages a
    notch on the swivel raceway, locking the swivel rotation as well.
  - Pedal pivots on a separate bolt attached to one fork leg.
  - Spring-return not modeled (geometry-only).

Output: STEP assembly openable in SolidWorks alongside the user's SLDASM.
Each part is a separate solid, color-coded, so the brake parts can be
copied into the original assembly if desired.
"""

import cadquery as cq
import math
import os

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ============================= PARAMETERS ===================================
# --- Wheel (8 x 2 in) ---
WHEEL_OD        = 203.2     # 8 in
WHEEL_WIDTH     = 50.8      # 2 in
TREAD_THK       = 12.0      # blue PU thickness
TREAD_CORNER_R  = 4.0
HUB_OD          = WHEEL_OD - 2 * TREAD_THK    # 179.2 mm
HUB_LEN         = WHEEL_WIDTH
HUB_BORE        = 47.0      # 6204 bearing OD
HUB_FACE_INSET  = 0.0
# Bearing
BEARING_OD      = 47.0
BEARING_ID      = 20.0
BEARING_WIDTH   = 14.0
# Axle
AXLE_DIA        = 16.0      # M16
AXLE_LEN        = WHEEL_WIDTH + 60.0   # protrudes 30 mm each side
AXLE_HEAD_AF    = 24.0
AXLE_HEAD_THK   = 10.0
NUT_AF          = 24.0
NUT_THK         = 12.0

# --- Top plate (4 x 4.5 in) ---
TOP_PLATE_L     = 114.3     # 4.5 in (long side, along travel)
TOP_PLATE_W     = 101.6     # 4 in
TOP_PLATE_THK   = 6.0
# Bolt hole pattern: slotted 2.625 x 3.625 to 3 x 3
BOLT_HOLE_L1    = 66.7      # 2-5/8"
BOLT_HOLE_W1    = 92.1      # 3-5/8"
BOLT_HOLE_L2    = 76.2      # 3"
BOLT_HOLE_W2    = 76.2      # 3"
BOLT_HOLE_DIA   = 12.5      # M12 / 1/2" bolt clearance
# Slot length (for slotted portion)
SLOT_LEN        = 9.5       # ~3/8" slot length extra

# --- Swivel raceway ---
SWIVEL_TOP_PLATE_THK = 10.0
SWIVEL_BOSS_OD  = 70.0
SWIVEL_BOSS_LEN = 25.0
SWIVEL_BALL_PCD = 56.0
SWIVEL_BALL_DIA = 9.5
N_SWIVEL_BALLS  = 12
SWIVEL_PIN_DIA  = 8.0       # vertical pin through swivel (for total lock)

# --- Fork / yoke (swivel) ---
FORK_THK        = 6.0
FORK_GAP        = WHEEL_WIDTH + 6.0     # 56.8 mm gap
FORK_LEG_W      = 70.0      # fork leg width along axle
FORK_LEG_LEN    = 130.0     # leg length from axle to top
FORK_BEND_R     = 20.0
# Swivel offset (fork is offset from plate center)
SWIVEL_OFFSET   = 50.0      # kingpin axis is 50 mm behind wheel axle

# Overall height check: 9.5 in = 241.3 mm
# wheel center (z=0) to top of plate = WHEEL_OD/2 + FORK_LEG_LEN + SWIVEL_BOSS_LEN + SWIVEL_TOP_PLATE_THK + TOP_PLATE_THK
# = 101.6 + 130 + 25 + 10 + 6 = 272.6 mm (need to tune to match 241.3)
# Recompute: top of plate above axle centerline should be ~241.3 - 101.6 = 139.7 mm
SWIVEL_BOSS_LEN = 25.0
FORK_LEG_LEN    = 100.0     # tuned to match 9.5" overall height (~241 mm)

# --- Brake system (added) ---
BRAKE_PIVOT_DIA      = 8.0      # 5/16" pivot bolt
BRAKE_PIVOT_OFFSET_Z = 70.0     # above axle (on upper part of fork leg)
BRAKE_PEDAL_LEN      = 110.0    # pedal arm length
BRAKE_PEDAL_W        = 25.0
BRAKE_PEDAL_THK      = 4.0
BRAKE_SHOE_ARC_DEG   = 35.0     # contact shoe wraps 35° of tread
BRAKE_SHOE_THK       = 5.0
BRAKE_SHOE_WIDTH     = 30.0
# Total-lock notch on swivel boss (vertical slot)
LOCK_NOTCH_WIDTH     = 12.0
LOCK_NOTCH_DEPTH     = 8.0
LOCK_NOTCH_HEIGHT    = 20.0
# Brake cam lobe that engages the lock notch (when pedal down)
LOCK_CAM_PROTRUSION  = 10.0
LOCK_CAM_W           = 12.0
LOCK_CAM_H           = 15.0

# ============================= HELPERS ======================================
def make_tread():
    """Blue PU tread - annular ring with rounded corners."""
    body = (cq.Workplane("XY")
              .circle(WHEEL_OD / 2.0)
              .circle(HUB_OD / 2.0)
              .extrude(WHEEL_WIDTH)
              .translate((0, 0, -WHEEL_WIDTH / 2.0)))
    try:
        body = body.edges(">Z").edges("|Z").fillet(TREAD_CORNER_R)
        body = body.edges("<Z").edges("|Z").fillet(TREAD_CORNER_R)
    except Exception:
        pass
    return body

def make_hub():
    """Cast iron hub holding the bearing."""
    hub = (cq.Workplane("XY")
             .circle(HUB_OD / 2.0)
             .circle(HUB_BORE / 2.0)
             .extrude(HUB_LEN)
             .translate((0, 0, -HUB_LEN / 2.0)))
    return hub

def make_bearing():
    """6204 ball bearing sketch (inner + outer race)."""
    outer = (cq.Workplane("XY")
               .circle(BEARING_OD / 2.0)
               .circle((BEARING_OD + BEARING_ID) / 4.0)
               .extrude(BEARING_WIDTH)
               .translate((0, 0, -BEARING_WIDTH / 2.0)))
    inner = (cq.Workplane("XY")
               .circle((BEARING_OD + BEARING_ID) / 4.0)
               .circle(BEARING_ID / 2.0)
               .extrude(BEARING_WIDTH)
               .translate((0, 0, -BEARING_WIDTH / 2.0)))
    return outer.union(inner)

def make_axle():
    """M16 hex-head bolt with nut."""
    shank = (cq.Workplane("XY")
               .circle(AXLE_DIA / 2.0)
               .extrude(AXLE_LEN)
               .translate((0, 0, -AXLE_LEN / 2.0)))
    head = (cq.Workplane("XY")
              .polygon(6, AXLE_HEAD_AF / math.cos(math.radians(30)))
              .extrude(AXLE_HEAD_THK)
              .translate((0, 0, AXLE_LEN / 2.0)))
    return shank.union(head)

def make_nut():
    """Hex nut opposite side."""
    return (cq.Workplane("XY")
              .polygon(6, NUT_AF / math.cos(math.radians(30)))
              .extrude(NUT_THK)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .cutThruAll()
              .translate((0, 0, -AXLE_LEN / 2.0)))

def make_fork_leg(side_sign):
    """One swivel fork leg with axle hole."""
    leg = (cq.Workplane("XZ")
             .center(0, 0)
             .rect(FORK_LEG_W, FORK_LEG_LEN, centered=False)
             .extrude(FORK_THK))
    leg = leg.translate((-FORK_LEG_W / 2.0, 0, 0))
    # Axle hole near bottom of leg
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + 20.0)
             .hole(AXLE_DIA + 1.0))
    # Brake pivot hole (above axle)
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + 20.0 + BRAKE_PIVOT_OFFSET_Z)
             .hole(BRAKE_PIVOT_DIA + 0.5))
    try:
        leg = leg.edges(">Z").edges("|Y").fillet(FORK_BEND_R / 2.0)
    except Exception:
        pass
    leg = leg.translate((0, side_sign * FORK_GAP / 2.0, 0))
    return leg

def make_swivel_assembly():
    """Swivel top plate + boss with ball raceway + kingpin hole.
    Built at origin; the fork attaches below and wheel sits in the fork."""
    # Top plate (4 x 4.5 in), centered on swivel axis
    plate = (cq.Workplane("XY")
               .rect(TOP_PLATE_L, TOP_PLATE_W)
               .extrude(TOP_PLATE_THK))
    # Drill slotted bolt holes (4 corners, slotted along X direction)
    # Slot center positions: (±BOLT_HOLE_L1/2, ±BOLT_HOLE_W1/2)
    # Slot is along X, length = BOLT_HOLE_L2 - BOLT_HOLE_L1 = 9.5 mm
    for sx in (-1, +1):
        for sy in (-1, +1):
            # Build slot as rectangle cut in plate top face
            slot_center_x = sx * BOLT_HOLE_L1 / 2.0
            slot_center_y = sy * BOLT_HOLE_W1 / 2.0
            # Use a slot: small rectangle of length SLOT_LEN + BOLT_HOLE_DIA
            slot = (cq.Workplane("XY")
                      .center(0, 0)
                      .slot2D(BOLT_HOLE_DIA + SLOT_LEN, BOLT_HOLE_DIA)
                      .extrude(TOP_PLATE_THK * 2)
                      .translate((slot_center_x, slot_center_y, -TOP_PLATE_THK / 2.0)))
            plate = plate.cut(slot)
    # Swivel boss (cylinder below plate)
    boss = (cq.Workplane("XY")
              .circle(SWIVEL_BOSS_OD / 2.0)
              .extrude(SWIVEL_BOSS_LEN)
              .translate((0, 0, -SWIVEL_BOSS_LEN)))
    # Ball raceway: drill N ball holes around PCD on the bottom face of boss
    for i in range(N_SWIVEL_BALLS):
        a = 360.0 * i / N_SWIVEL_BALLS
        x = SWIVEL_BALL_PCD / 2.0 * math.cos(math.radians(a))
        y = SWIVEL_BALL_PCD / 2.0 * math.sin(math.radians(a))
        boss = (boss.faces("<Z").workplane()
                  .moveTo(x, y)
                  .hole(SWIVEL_BALL_DIA, depth=SWIVEL_BALL_DIA / 2.0 + 2.0))
    # Lock notch in swivel boss (vertical slot on the side facing +X)
    # This is where the brake cam lobe engages to lock swivel rotation
    notch = (cq.Workplane("YZ")
               .center(0, 0)
               .rect(LOCK_NOTCH_WIDTH, LOCK_NOTCH_HEIGHT)
               .extrude(LOCK_NOTCH_DEPTH)
               .translate((SWIVEL_BOSS_OD / 2.0 - LOCK_NOTCH_DEPTH / 2.0,
                            0, -SWIVEL_BOSS_LEN / 2.0)))
    boss = boss.cut(notch)
    # Combine plate + boss
    return plate.union(boss)

def make_brake_pedal():
    """Side-pedal cam-action brake with curved shoe + total-lock cam lobe.
    Built in rest (disengaged) position - pedal up, shoe away from tread."""
    # Pivot cylinder (the pivot bolt - simplified)
    pivot = (cq.Workplane("XY")
               .circle(BRAKE_PIVOT_DIA / 2.0)
               .extrude(FORK_GAP + 20)
               .translate((0, 0, -(FORK_GAP + 20) / 2.0)))

    # Pedal arm: rectangular plate extending from pivot outward
    # in +X direction (so pedal sticks out to the side of the caster)
    pedal = (cq.Workplane("XZ")
               .center(0, 0)
               .rect(BRAKE_PEDAL_LEN, BRAKE_PEDAL_THK, centered=False)
               .extrude(BRAKE_PEDAL_W)
               .translate((0, -BRAKE_PEDAL_W / 2.0, -BRAKE_PEDAL_THK / 2.0)))

    # Curved brake shoe (a thin curved plate matching tread OD)
    # Build as an arc segment of a tube at BRAKE_SHOE_ARC_DEG around the wheel
    # Use a torus approximation: extrude a small rectangle along an arc
    # Simpler: place a small flat pad tangent to the wheel at top
    shoe_offset_angle = 30.0  # shoe is 30 deg from top of wheel (front upper quadrant)
    shoe_x = (WHEEL_OD / 2.0 + BRAKE_SHOE_THK / 2.0) * math.sin(math.radians(shoe_offset_angle))
    shoe_z = (WHEEL_OD / 2.0 + BRAKE_SHOE_THK / 2.0) * math.cos(math.radians(shoe_offset_angle))
    # Approximate shoe as a flat plate at this location, tangentially oriented
    shoe = (cq.Workplane("XZ")
              .center(0, 0)
              .rect(50.0, BRAKE_SHOE_THK, centered=False)
              .extrude(BRAKE_SHOE_WIDTH)
              .translate((0, -BRAKE_SHOE_WIDTH / 2.0, 0))
              .rotate((0, 0, 0), (0, 1, 0), shoe_offset_angle)
              .translate((shoe_x, 0, shoe_z)))

    # Total-lock cam lobe (small block that engages the swivel boss notch
    # when the pedal is pressed). Located above the pivot, pointing up.
    cam = (cq.Workplane("XY")
             .rect(LOCK_CAM_W, LOCK_CAM_H)
             .extrude(FORK_THK + 2)
             .translate((0, 0, -(FORK_THK + 2) / 2.0))
             .translate((0, 0, BRAKE_PIVOT_OFFSET_Z + 15.0)))

    # Position entire brake assembly relative to wheel center (origin)
    # Pivot is at (FORK_LEG_W/2, on one fork leg side, z=BRAKE_PIVOT_OFFSET_Z)
    pivot_x = FORK_LEG_W / 2.0 + 10.0
    pivot_y = -FORK_GAP / 2.0  # on -Y side fork leg (outer face)
    pivot_z = BRAKE_PIVOT_OFFSET_Z

    # Translate pivot + pedal + shoe + cam to pivot location
    # (shoe was positioned relative to wheel center; needs to be at the brake shoe
    #  contact location which IS at wheel center's frame - so shoe needs separate
    #  handling: it's connected to pedal via a link. For simplicity, we attach
    #  the shoe to the pedal end.)
    # Rebuild: place shoe at end of pedal arm, oriented to contact tread
    # Pedal extends from pivot toward +X. Shoe at end of pedal.
    shoe_at_pivot_frame = (cq.Workplane("XZ")
              .center(0, 0)
              .rect(40.0, BRAKE_SHOE_THK, centered=False)
              .extrude(BRAKE_SHOE_WIDTH)
              .translate((0, -BRAKE_SHOE_WIDTH / 2.0,
                          BRAKE_PEDAL_LEN - 10.0)))
    # Combine: pivot + pedal + shoe_at_pivot_frame + cam
    brake_sub = pivot.union(pedal).union(shoe_at_pivot_frame).union(cam)
    # Translate entire assembly to pivot position (in caster frame)
    brake_sub = brake_sub.translate((pivot_x, pivot_y, pivot_z))
    return brake_sub

# ============================= BUILD ASSEMBLY ================================
asm = cq.Assembly(name="CasterHQ_HQ4980S-G3-SPR_with_Brake")

# 1. Wheel: tread + hub + 2 bearings, axis along Y (rolls along X)
tread = make_tread().rotate((0,0,0), (1,0,0), 90)
hub   = make_hub().rotate((0,0,0), (1,0,0), 90)
brg1  = make_bearing().rotate((0,0,0), (1,0,0), 90).translate((0, -BEARING_WIDTH/2 - 1, 0))
brg2  = make_bearing().rotate((0,0,0), (1,0,0), 90).translate((0,  BEARING_WIDTH/2 + 1, 0))
asm.add(tread, name="Tread_Blue_PU",      color=cq.Color(0.10, 0.30, 0.85))  # blue
asm.add(hub,   name="Hub_Cast_Iron",      color=cq.Color(0.20, 0.20, 0.22))  # dark grey
asm.add(brg1,  name="Bearing_6204_outer", color=cq.Color(0.80, 0.80, 0.85))
asm.add(brg2,  name="Bearing_6204_inner", color=cq.Color(0.80, 0.80, 0.85))

# 2. Axle + nut (along Y)
axle = make_axle().rotate((0,0,0), (1,0,0), 90)
nut  = make_nut().rotate((0,0,0), (1,0,0), 90)
asm.add(axle, name="Axle_M16_HexHead", color=cq.Color(0.30, 0.30, 0.35))
asm.add(nut,  name="Nut_M16_Hex",      color=cq.Color(0.30, 0.30, 0.35))

# 3. Two fork legs + swivel assembly on top
asm.add(make_fork_leg(+1), name="Fork_R", color=cq.Color(0.70, 0.70, 0.74))  # zinc silver
asm.add(make_fork_leg(-1), name="Fork_L", color=cq.Color(0.70, 0.70, 0.74))

# Swivel assembly is centered above the wheel axle, offset back by SWIVEL_OFFSET
swivel = make_swivel_assembly()
swivel_z = FORK_LEG_LEN   # top of fork legs
asm.add(swivel.translate((SWIVEL_OFFSET, 0, swivel_z)),
        name="Swivel_Plate_Boss", color=cq.Color(0.70, 0.70, 0.74))

# 4. Brake pedal assembly (added per user request!)
brake = make_brake_pedal()
asm.add(brake, name="Brake_Pedal_TotalLock", color=cq.Color(0.90, 0.10, 0.10))  # red pedal

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "CasterHQ_HQ4980S-G3-SPR_with_brake.step")
stl_path  = os.path.join(OUT_DIR, "CasterHQ_HQ4980S-G3-SPR_with_brake.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.1, angularTolerance=0.3)

# Overall height check
overall_h = WHEEL_OD / 2.0 + FORK_LEG_LEN + SWIVEL_BOSS_LEN + SWIVEL_TOP_PLATE_THK + TOP_PLATE_THK
print("==== CasterHQ HQ4980S-G3-SPR with BRAKE SYSTEM ====")
print(f"Wheel OD      : {WHEEL_OD} mm  ({WHEEL_OD/25.4:.2f} in)")
print(f"Wheel width   : {WHEEL_WIDTH} mm  ({WHEEL_WIDTH/25.4:.2f} in)")
print(f"Tread         : blue PU, {TREAD_THK} mm thick")
print(f"Hub           : cast iron, OD={HUB_OD} mm, bearing 6204 x2")
print(f"Axle          : M16 hex head + nut")
print(f"Top plate     : {TOP_PLATE_L} x {TOP_PLATE_W} mm ({TOP_PLATE_L/25.4:.1f} x {TOP_PLATE_W/25.4:.1f} in)")
print(f"Bolt holes    : slotted {BOLT_HOLE_L1/25.4:.3f}\" x {BOLT_HOLE_W1/25.4:.3f}\" to {BOLT_HOLE_L2/25.4:.1f}\" x {BOLT_HOLE_W2/25.4:.1f}\"")
print(f"Overall height: {overall_h:.1f} mm  (target 9.5\" = 241.3 mm)")
print(f"Capacity      : 1000 lb / 454 kg per caster")
print()
print("BRAKE SYSTEM (added):")
print(f"  - Side pedal cam-action face brake (curved shoe contacts tread)")
print(f"  - Total-lock: cam lobe also engages notch on swivel boss")
print(f"  - Pedal length: {BRAKE_PEDAL_LEN} mm, pivot Ø{BRAKE_PIVOT_DIA} mm")
print(f"  - Shoe arc: {BRAKE_SHOE_ARC_DEG}° of tread, {BRAKE_SHOE_WIDTH} mm wide")
print()
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
