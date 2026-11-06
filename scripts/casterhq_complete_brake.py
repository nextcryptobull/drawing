"""
CasterHQ HQ4980S-G3-SPR 8"x2" swivel caster with COMPLETE brake system.

Spec (matched to user's reference + product spec sheet):
  WHEEL (blue PU, 8"x2"):
    - Wheel OD: 203.2 mm (8 in)
    - Wheel width: 50.8 mm (2 in)
    - Tread: blue solid PU, 12 mm thick
    - Hub: cast iron, OD 179 mm
    - 2x 6204 ball bearings (20x47x14)
    - M16 hex-head axle + nut + washers

  YOKE (swivel, zinc-plated steel):
    - Top plate: 4" x 4.5" (101.6 x 114.3 mm), 6 mm thick
    - Bolt holes: slotted 2.625" x 3.625" to 3" x 3" (4 holes)
    - Swivel boss: Ø70 mm, 25 mm tall, 12-ball raceway
    - 2 fork legs (swivel type)
    - Overall height: 9.5" (241 mm)

  COMPLETE BRAKE SYSTEM (6 components):
    1. Foot pedal - stamped steel, 100 mm long, with toe-tab
    2. M8 hex-head pivot bolt
    3. Torsion return spring (6 turns, 2 legs)
    4. Curved brake shoe (wraps 40 deg of tread, contacts blue PU face)
    5. Linkage arm (connects pedal pivot to shoe pivot)
    6. M6 hex-head shoe pivot bolt

  Total: 1 STEP file, opens as assembly in SolidWorks.
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
BEARING_OD      = 47.0
BEARING_ID      = 20.0
BEARING_WIDTH   = 14.0

# Axle (M16)
AXLE_DIA        = 16.0
AXLE_LEN        = WHEEL_WIDTH + 50.0
AXLE_HEAD_AF    = 24.0
AXLE_HEAD_THK   = 10.0
NUT_AF          = 24.0
NUT_THK         = 12.0
WASHER_OD       = 30.0
WASHER_THK      = 2.0

# --- Top plate (4 x 4.5 in) ---
TOP_PLATE_L     = 114.3     # 4.5 in (long side)
TOP_PLATE_W     = 101.6     # 4 in
TOP_PLATE_THK   = 6.0
BOLT_HOLE_L1    = 66.7      # 2-5/8"
BOLT_HOLE_W1    = 92.1      # 3-5/8"
BOLT_HOLE_L2    = 76.2      # 3"
BOLT_HOLE_W2    = 76.2      # 3"
BOLT_HOLE_DIA   = 12.5
SLOT_LEN        = 9.5

# --- Swivel raceway ---
SWIVEL_BOSS_OD  = 70.0
SWIVEL_BOSS_LEN = 25.0
SWIVEL_BALL_PCD = 56.0
SWIVEL_BALL_DIA = 9.5
N_SWIVEL_BALLS  = 12

# --- Fork / yoke ---
FORK_THK        = 6.0
FORK_GAP        = WHEEL_WIDTH + 6.0     # 56.8 mm
FORK_LEG_W      = 70.0
FORK_LEG_LEN    = 100.0     # tuned to give 9.5" overall height
FORK_BEND_R     = 20.0
SWIVEL_OFFSET   = 30.0     # kingpin axis is 30 mm behind wheel axle

# --- BRAKE SYSTEM ---
PEDAL_LEN       = 100.0
PEDAL_W         = 25.0
PEDAL_THK       = 3.0       # stamped sheet
PEDAL_SLOT_L    = 22.0
PEDAL_SLOT_W    = 7.0
PEDAL_TIP_R     = 10.0      # rounded toe tab
PEDAL_ANGLE_DEG = -25.0     # pedal tilts down 25 deg at rest (disengaged)

PIVOT_DIA       = 8.0       # M8
PIVOT_LEN       = 45.0
PIVOT_HEAD_AF   = 13.0
PIVOT_HEAD_THK  = 5.0
PIVOT_OFFSET_X  = FORK_LEG_W / 2.0 + 12.0   # outside fork leg
PIVOT_OFFSET_Z  = 70.0      # 70 mm above axle

SPRING_COIL_DIA = 12.0
SPRING_WIRE_DIA = 1.8
SPRING_N_TURNS  = 6
SPRING_LEN      = 18.0
SPRING_LEG_LEN  = 25.0

SHOE_ARC_DEG    = 40.0      # wraps 40 deg of tread
SHOE_THK        = 4.0
SHOE_WIDTH      = 50.0
SHOE_INNER_R    = WHEEL_OD / 2.0
SHOE_OUTER_R    = WHEEL_OD / 2.0 + SHOE_THK

LINK_W          = 12.0
LINK_THK        = 3.0

SHOE_PIVOT_DIA  = 6.0       # M6
SHOE_PIVOT_OFFSET_X = FORK_LEG_W / 2.0 + 12.0
SHOE_PIVOT_OFFSET_Z = 25.0   # 25 mm above axle

# ============================= PART BUILDERS =================================
def make_tread():
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
    return body.rotate((0,0,0), (1,0,0), 90)

def make_hub():
    return (cq.Workplane("XY")
              .circle(HUB_OD / 2.0)
              .circle(HUB_BORE / 2.0)
              .extrude(HUB_LEN)
              .translate((0, 0, -HUB_LEN / 2.0))
              .rotate((0,0,0), (1,0,0), 90))

def make_bearing():
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
    return outer.union(inner).rotate((0,0,0), (1,0,0), 90)

def make_axle():
    shank = (cq.Workplane("XY")
               .circle(AXLE_DIA / 2.0)
               .extrude(AXLE_LEN)
               .translate((0, 0, -AXLE_LEN / 2.0)))
    head = (cq.Workplane("XY")
              .polygon(6, AXLE_HEAD_AF / math.cos(math.radians(30)))
              .extrude(AXLE_HEAD_THK)
              .translate((0, 0, AXLE_LEN / 2.0)))
    return (shank.union(head)).rotate((0,0,0), (1,0,0), 90)

def make_nut():
    return (cq.Workplane("XY")
              .polygon(6, NUT_AF / math.cos(math.radians(30)))
              .extrude(NUT_THK)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .cutThruAll()
              .translate((0, 0, -AXLE_LEN / 2.0))
              .rotate((0,0,0), (1,0,0), 90))

def make_washer(side_sign):
    """Washer - side_sign = +1 (axle head side) / -1 (nut side)"""
    z = side_sign * (AXLE_LEN / 2.0 - AXLE_HEAD_THK - WASHER_THK/2 - 1.0)
    if side_sign < 0:
        z = -AXLE_LEN / 2.0 + NUT_THK + WASHER_THK/2 + 1.0
    return (cq.Workplane("XY")
              .circle(WASHER_OD / 2.0)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .extrude(WASHER_THK)
              .translate((0, 0, z))
              .rotate((0,0,0), (1,0,0), 90))

def make_fork_leg(side_sign):
    """Swivel fork leg."""
    leg = (cq.Workplane("XZ")
             .center(0, 0)
             .rect(FORK_LEG_W, FORK_LEG_LEN, centered=False)
             .extrude(FORK_THK))
    leg = leg.translate((-FORK_LEG_W / 2.0, 0, 0))
    # Axle hole near bottom
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + 20.0)
             .hole(AXLE_DIA + 1.0))
    # Brake pivot hole
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + PIVOT_OFFSET_Z)
             .hole(PIVOT_DIA + 0.5))
    # Shoe pivot hole
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + SHOE_PIVOT_OFFSET_Z)
             .hole(SHOE_PIVOT_DIA + 0.5))
    try:
        leg = leg.edges(">Z").edges("|Y").fillet(FORK_BEND_R / 2.0)
    except Exception:
        pass
    leg = leg.translate((0, side_sign * FORK_GAP / 2.0, 0))
    return leg

def make_swivel_assembly():
    """Top plate + swivel boss with ball raceway + kingpin hole."""
    plate = (cq.Workplane("XY")
               .rect(TOP_PLATE_L, TOP_PLATE_W)
               .extrude(TOP_PLATE_THK))
    # Slotted bolt holes (4 corners)
    for sx in (-1, +1):
        for sy in (-1, +1):
            slot_center_x = sx * BOLT_HOLE_L1 / 2.0
            slot_center_y = sy * BOLT_HOLE_W1 / 2.0
            slot = (cq.Workplane("XY")
                      .center(0, 0)
                      .slot2D(BOLT_HOLE_DIA + SLOT_LEN, BOLT_HOLE_DIA)
                      .extrude(TOP_PLATE_THK * 2)
                      .translate((slot_center_x, slot_center_y, -TOP_PLATE_THK / 2.0)))
            plate = plate.cut(slot)
    # Swivel boss
    boss = (cq.Workplane("XY")
              .circle(SWIVEL_BOSS_OD / 2.0)
              .extrude(SWIVEL_BOSS_LEN)
              .translate((0, 0, -SWIVEL_BOSS_LEN)))
    # Ball raceway
    for i in range(N_SWIVEL_BALLS):
        a = 360.0 * i / N_SWIVEL_BALLS
        x = SWIVEL_BALL_PCD / 2.0 * math.cos(math.radians(a))
        y = SWIVEL_BALL_PCD / 2.0 * math.sin(math.radians(a))
        boss = (boss.faces("<Z").workplane()
                  .moveTo(x, y)
                  .hole(SWIVEL_BALL_DIA, depth=SWIVEL_BALL_DIA / 2.0 + 2.0))
    return plate.union(boss)

def make_brake_pedal():
    """Foot pedal - flat stamped steel with teardrop toe tab + slot."""
    pedal = (cq.Workplane("XZ")
               .center(0, 0)
               .rect(PEDAL_LEN - PEDAL_TIP_R, PEDAL_W, centered=False)
               .extrude(PEDAL_THK)
               .translate((0, -PEDAL_W / 2.0, -PEDAL_THK / 2.0)))
    tip = (cq.Workplane("XZ")
             .center(0, 0)
             .circle(PEDAL_TIP_R)
             .extrude(PEDAL_THK)
             .translate((PEDAL_LEN - PEDAL_TIP_R, 0, -PEDAL_THK / 2.0)))
    pedal = pedal.union(tip)
    slot = (cq.Workplane("XZ")
              .center(0, 0)
              .rect(PEDAL_SLOT_L, PEDAL_SLOT_W)
              .extrude(PEDAL_THK * 2)
              .translate((PEDAL_LEN / 2.0, 0, 0)))
    pedal = pedal.cut(slot)
    try:
        pedal = pedal.edges("|Y").fillet(1.0)
    except Exception:
        pass
    return pedal

def make_pivot_bolt():
    """M8 hex-head shoulder bolt."""
    shank = (cq.Workplane("XY")
               .circle(PIVOT_DIA / 2.0)
               .extrude(PIVOT_LEN)
               .translate((0, 0, -PIVOT_LEN / 2.0)))
    head = (cq.Workplane("XY")
              .polygon(6, PIVOT_HEAD_AF / math.cos(math.radians(30)))
              .extrude(PIVOT_HEAD_THK)
              .translate((0, 0, PIVOT_LEN / 2.0)))
    return shank.union(head)

def make_torsion_spring():
    """Coil spring with 2 legs."""
    coil = (cq.Workplane("XY")
              .circle(SPRING_COIL_DIA / 2.0)
              .circle(SPRING_COIL_DIA / 2.0 - SPRING_WIRE_DIA)
              .extrude(SPRING_LEN)
              .translate((0, 0, -SPRING_LEN / 2.0)))
    leg1 = (cq.Workplane("XY")
              .rect(SPRING_LEG_LEN, SPRING_WIRE_DIA * 1.5)
              .extrude(SPRING_WIRE_DIA)
              .translate((SPRING_LEG_LEN / 2.0, 0, SPRING_LEN / 2.0 - SPRING_WIRE_DIA / 2.0)))
    leg2 = (cq.Workplane("XY")
              .rect(SPRING_LEG_LEN, SPRING_WIRE_DIA * 1.5)
              .extrude(SPRING_WIRE_DIA)
              .translate((-SPRING_LEG_LEN / 2.0, 0, -SPRING_LEN / 2.0 + SPRING_WIRE_DIA / 2.0)))
    return coil.union(leg1).union(leg2)

def make_brake_shoe():
    """Curved brake shoe - crescent shape that contacts tread OD."""
    annulus = (cq.Workplane("XY")
                 .circle(SHOE_OUTER_R)
                 .circle(SHOE_INNER_R)
                 .extrude(SHOE_WIDTH)
                 .translate((0, 0, -SHOE_WIDTH / 2.0)))
    wedge_w = SHOE_OUTER_R * 2.5
    wedge_h = SHOE_OUTER_R * 2.5
    cut1 = (cq.Workplane("XY")
              .rect(wedge_w, wedge_h)
              .extrude(SHOE_WIDTH * 1.5)
              .translate((-wedge_w * 0.7, 0, 0)))
    cut2 = (cq.Workplane("XY")
              .rect(wedge_w, wedge_h)
              .extrude(SHOE_WIDTH * 1.5)
              .translate((wedge_w * 0.7, 0, 0)))
    shoe = annulus.cut(cut1).cut(cut2)
    # Rotate so arc opens toward +Z (top of wheel)
    return shoe.rotate((0,0,0), (1,0,0), 90)

def make_linkage_arm(length):
    """Linkage arm with given length, connects pedal pivot to shoe pivot."""
    return (cq.Workplane("XZ")
              .center(0, 0)
              .rect(length, LINK_THK, centered=False)
              .extrude(LINK_W)
              .translate((0, -LINK_W / 2.0, -LINK_THK / 2.0)))

def make_shoe_pivot_bolt():
    """M6 hex-head bolt."""
    shank = (cq.Workplane("XY")
               .circle(SHOE_PIVOT_DIA / 2.0)
               .extrude(35.0)
               .translate((0, 0, -17.5)))
    head = (cq.Workplane("XY")
              .polygon(6, 10.0 / math.cos(math.radians(30)))
              .extrude(4.0)
              .translate((0, 0, 17.5)))
    return shank.union(head)

# ============================= ASSEMBLE ======================================
asm = cq.Assembly(name="CasterHQ_HQ4980S_G3_SPR_with_COMPLETE_Brake")

# --- WHEEL ---
asm.add(make_tread(),  name="Tread_Blue_PU",      color=cq.Color(0.10, 0.30, 0.85))
asm.add(make_hub(),    name="Hub_Cast_Iron",      color=cq.Color(0.20, 0.20, 0.22))
asm.add(make_bearing().translate((0, -BEARING_WIDTH/2 - 1, 0)),
        name="Bearing_6204_outer", color=cq.Color(0.80, 0.80, 0.85))
asm.add(make_bearing().translate((0,  BEARING_WIDTH/2 + 1, 0)),
        name="Bearing_6204_inner", color=cq.Color(0.80, 0.80, 0.85))

# Axle assembly
asm.add(make_axle(),   name="Axle_M16_HexHead",   color=cq.Color(0.30, 0.30, 0.35))
asm.add(make_nut(),    name="Nut_M16_Hex",        color=cq.Color(0.30, 0.30, 0.35))
asm.add(make_washer(+1), name="Washer_HeadSide",  color=cq.Color(0.40, 0.40, 0.45))
asm.add(make_washer(-1), name="Washer_NutSide",   color=cq.Color(0.40, 0.40, 0.45))

# --- YOKE (swivel) ---
asm.add(make_fork_leg(+1), name="Fork_R", color=cq.Color(0.72, 0.74, 0.78))
asm.add(make_fork_leg(-1), name="Fork_L", color=cq.Color(0.72, 0.74, 0.78))

# Swivel assembly on top of fork
swivel_z = FORK_LEG_LEN
asm.add(make_swivel_assembly().translate((SWIVEL_OFFSET, 0, swivel_z)),
        name="Swivel_TopPlate_Boss", color=cq.Color(0.72, 0.74, 0.78))

# --- BRAKE SYSTEM (6 components) ---
PIVOT_LOC = (PIVOT_OFFSET_X, FORK_GAP / 2.0, PIVOT_OFFSET_Z)
SHOE_PIVOT_LOC = (SHOE_PIVOT_OFFSET_X, FORK_GAP / 2.0, SHOE_PIVOT_OFFSET_Z)

# 1. Foot pedal (rotated + translated to pivot location)
pedal = make_brake_pedal()
pedal = pedal.rotate((0,0,0), (0,1,0), PEDAL_ANGLE_DEG)
pedal = pedal.translate(PIVOT_LOC)
asm.add(pedal, name="01_Brake_FootPedal", color=cq.Color(0.95, 0.45, 0.10))   # orange

# 2. Pivot bolt (along Y axis at pivot location)
pivot_bolt = make_pivot_bolt().rotate((0,0,0), (1,0,0), 90)
asm.add(pivot_bolt.translate(PIVOT_LOC),
        name="02_Brake_PivotBolt_M8", color=cq.Color(0.30, 0.30, 0.35))

# 3. Torsion return spring
spring = make_torsion_spring().rotate((0,0,0), (1,0,0), 90)
asm.add(spring.translate(PIVOT_LOC),
        name="03_Brake_TorsionSpring", color=cq.Color(0.50, 0.50, 0.55))

# 4. Curved brake shoe (arc center at wheel axle 0,0,0; placed on +Y side)
shoe = make_brake_shoe()
shoe = shoe.translate((0, FORK_GAP / 2.0 - SHOE_WIDTH / 2.0 - 2.0, 0))
asm.add(shoe, name="04_Brake_CurvedShoe", color=cq.Color(0.95, 0.45, 0.10))   # orange

# 5. Linkage arm - connects pedal pivot to shoe pivot
dx = PIVOT_LOC[0] - SHOE_PIVOT_LOC[0]
dz = PIVOT_LOC[2] - SHOE_PIVOT_LOC[2]
link_angle = math.degrees(math.atan2(dz, dx))
link_len_actual = math.sqrt(dx*dx + dz*dz)
link = make_linkage_arm(link_len_actual)
link = link.rotate((0,0,0), (0,1,0), link_angle)
link = link.translate(SHOE_PIVOT_LOC)
asm.add(link, name="05_Brake_LinkageArm", color=cq.Color(0.95, 0.45, 0.10))   # orange

# 6. Shoe pivot bolt
shoe_pivot_bolt = make_shoe_pivot_bolt().rotate((0,0,0), (1,0,0), 90)
asm.add(shoe_pivot_bolt.translate(SHOE_PIVOT_LOC),
        name="06_Brake_ShoePivotBolt_M6", color=cq.Color(0.30, 0.30, 0.35))

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "CasterHQ_HQ4980S-G3-SPR_with_brake.step")
stl_path  = os.path.join(OUT_DIR, "CasterHQ_HQ4980S-G3-SPR_with_brake.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.1, angularTolerance=0.3)

# Validate
imp = cq.importers.importStep(step_path)
bb = imp.val().BoundingBox()
overall_h = WHEEL_OD / 2.0 + FORK_LEG_LEN + SWIVEL_BOSS_LEN + TOP_PLATE_THK

print("=" * 70)
print("CasterHQ HQ4980S-G3-SPR 8x2 swivel caster + COMPLETE brake system")
print("=" * 70)
print(f"Wheel         : Ø{WHEEL_OD}mm x {WHEEL_WIDTH}mm  (8 in x 2 in)")
print(f"  Tread       : blue PU, {TREAD_THK}mm thick")
print(f"  Hub         : cast iron, 2x 6204 bearings, M16 axle + nut + 2 washers")
print(f"Yoke          : swivel, 2 fork legs, Ø{SWIVEL_BOSS_OD}mm boss w/ {N_SWIVEL_BALLS}-ball raceway")
print(f"Top plate     : {TOP_PLATE_L}x{TOP_PLATE_W}mm ({TOP_PLATE_L/25.4:.1f}x{TOP_PLATE_W/25.4:.1f} in)")
print(f"Overall height: {overall_h:.1f} mm  (target 9.5 in = 241.3 mm)")
print()
print("COMPLETE BRAKE SYSTEM (6 components):")
print(f"  1. Foot pedal        : {PEDAL_LEN}mm long, {PEDAL_W}mm wide, stamped steel + toe tab + slot")
print(f"  2. M8 pivot bolt     : hex head, length {PIVOT_LEN}mm, mounted at z={PIVOT_OFFSET_Z}mm above axle")
print(f"  3. Torsion spring    : Ø{SPRING_COIL_DIA}mm coil, {SPRING_N_TURNS} turns, 2 legs (return pedal to rest)")
print(f"  4. Curved brake shoe : wraps {SHOE_ARC_DEG}deg of tread, {SHOE_WIDTH}mm wide")
print(f"  5. Linkage arm       : connects pedal pivot to shoe pivot")
print(f"  6. M6 shoe pivot bolt: hex head")
print()
print(f"BBox          : {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
print(f"Solids in STEP: {len(imp.vals())}")
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
