"""
12x3 Industrial Heavy-Duty Caster Wheel (matches the uploaded photo).

Photo-verified spec:
  - Wheel OD    : 12 in  = 305 mm
  - Wheel width : 3 in   = 76 mm
  - Tread       : red polyurethane, ~12 mm thick, bonded to cast core
  - Hub/Core    : cast aluminum, grey, 5 radial spokes with lightening pockets
  - Yoke        : rigid (non-swivel) stamped steel, zinc-plated silver
  - Brake       : cam-action face brake, scimitar-shaped pedal that presses the
                  tread face when engaged
  - Axle        : M16 hex-head bolt with integral flange
  - Stem        : round steel shank Ø28 mm with cross-drilled Ø8 mm pin hole
                  and a red knurled grip ring (press-fit type)
  - Marking     : "12X3" embossed on the wheel face (5 spokes)

Stem still fits the ringlock standard: Ø28 mm shank with grip ring is the
common press-fit size for a Ø32 mm ID socket (matches a 38x3.2 ringlock
spigot tube ID = 31.6 mm with a grip-ring compression fit).
"""

import cadquery as cq
import math
import os

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ============================= PARAMETERS ===================================
# --- Wheel ---
WHEEL_OD          = 305.0     # 12 in
WHEEL_WIDTH       = 76.0      # 3 in
TREAD_THK        = 12.0      # red PU thickness
TREAD_CORNER_R   = 5.0       # rounded outer corners of tread
CORE_OD           = WHEEL_OD - 2 * TREAD_THK     # 281 mm  (cast core outer rim)
CORE_WIDTH       = WHEEL_WIDTH                  # full width
CORE_FACE_INSET  = 0.0       # core fills full wheel width (sidewalls visible)

# Cast hub: 5 spokes
HUB_BOSS_OD      = 60.0      # central boss
HUB_BOSS_LEN     = CORE_WIDTH     # boss spans full width
HUB_BORE         = 35.0      # axle sleeve bore (accepts M16 + sleeve)
N_SPOKES         = 5
SPOKE_WIDTH      = 25.0      # spoke width (radial)
SPOKE_THK        = 12.0      # spoke thickness (axial, at mid-plane)
RIM_THK          = 8.0       # core rim thickness (radial)
LIGHTENING_R_OUTER = CORE_OD / 2.0 - 8.0     # outer edge of lightening pocket
LIGHTENING_R_INNER = HUB_BOSS_OD / 2.0 + 5.0 # inner edge of pocket
LIGHTENING_DEPTH = (CORE_WIDTH - SPOKE_THK) / 2.0    # pocket depth on each face

# --- Tread text marking ---
MARK_TEXT = "12X3"
MARK_HEIGHT = 25.0       # text height (mm)
MARK_DEPTH  = 1.5        # embossed depth

# --- Axle ---
AXLE_DIA        = 16.0     # M16 shank
AXLE_LEN        = WHEEL_WIDTH + 50.0    # protrudes 25 mm each side
AXLE_HEAD_ACROSS_FLATS = 24.0   # hex head across flats (~M16 = 24 mm)
AXLE_HEAD_THK   = 10.0
AXLE_FLANGE_DIA = 28.0
AXLE_FLANGE_THK = 2.0
NUT_ACROSS_FLATS = 24.0
NUT_THK          = 12.0

# --- Yoke / fork (rigid, no swivel) ---
FORK_THK        = 6.0
FORK_GAP        = WHEEL_WIDTH + 6.0    # space between fork legs
FORK_LEG_W      = 70.0      # fork leg width (along axle)
FORK_LEG_LEN    = 200.0     # leg length (from axle to top of fork)
FORK_BEND_R     = 30.0      # bend radius at corners
TOP_COLLAR_OD   = 60.0
TOP_COLLAR_LEN  = 30.0

# --- Brake (cam-action face brake) ---
BRAKE_PIVOT_DIA = 10.0     # 3/8 in pivot bolt
BRAKE_PIVOT_OFFSET_Z = 110.0  # above axle center (pivot near top of fork)
BRAKE_PEDAL_LEN = 120.0
BRAKE_PEDAL_W   = 30.0
BRAKE_PEDAL_THK = 4.0
BRAKE_SHOE_R    = WHEEL_OD / 2.0 + 5.0   # curved shoe matches tread OD
BRAKE_SHOE_THK  = 6.0

# --- Stem (round shank, press-fit with red grip ring) ---
STEM_OD        = 28.0
STEM_LEN       = 80.0
GRIP_RING_OD   = 32.0       # knurled red grip ring outer dia
GRIP_RING_LEN  = 12.0
PIN_HOLE_DIA   = 8.0
PIN_HOLE_Z     = 15.0       # 15 mm below stem top

# ============================= HELPERS ======================================
def make_tread():
    """Red polyurethane tread, annular ring with rounded outer corners."""
    body = (cq.Workplane("XY")
              .circle(WHEEL_OD / 2.0)
              .circle(CORE_OD / 2.0)
              .extrude(WHEEL_WIDTH)
              .translate((0, 0, -WHEEL_WIDTH / 2.0)))
    # round outer corners
    try:
        body = body.edges(">Z").edges("|Z").fillet(TREAD_CORNER_R)
        body = body.edges("<Z").edges("|Z").fillet(TREAD_CORNER_R)
    except Exception:
        pass
    return body

def make_core():
    """Cast aluminum 5-spoke hub: central boss + 5 spokes + outer rim, with
    lightening pockets on both faces between spokes."""
    # 1) Central boss (cylinder)
    boss = (cq.Workplane("XY")
              .circle(HUB_BOSS_OD / 2.0)
              .circle(HUB_BORE / 2.0)
              .extrude(HUB_BOSS_LEN)
              .translate((0, 0, -HUB_BOSS_LEN / 2.0)))

    # 2) Outer rim (annular cylinder at CORE_OD)
    rim = (cq.Workplane("XY")
             .circle(CORE_OD / 2.0)
             .circle(CORE_OD / 2.0 - RIM_THK)
             .extrude(CORE_WIDTH)
             .translate((0, 0, -CORE_WIDTH / 2.0)))

    # 3) 5 spokes (rectangular bars from boss to rim)
    spokes = None
    for i in range(N_SPOKES):
        a = 360.0 * i / N_SPOKES
        # spoke as a rectangle in the XY plane, then rotate around Z
        spoke = (cq.Workplane("XY")
                   .center(0, 0)
                   .rect(SPOKE_WIDTH, (CORE_OD / 2.0 - HUB_BOSS_OD / 2.0 + 4.0))
                   .extrude(SPOKE_THK)
                   .translate((0,
                               (CORE_OD / 2.0 + HUB_BOSS_OD / 2.0) / 2.0,
                               -SPOKE_THK / 2.0))
                   .rotate((0, 0, 0), (0, 0, 1), a))
        spokes = spoke if spokes is None else spokes.union(spoke)

    core = boss.union(rim).union(spokes)

    # 4) Lightening pockets: cut 5 large circular/segment pockets between spokes
    #    on BOTH faces, leaving the spokes intact at the mid-plane.
    for face_sign in (+1, -1):
        for i in range(N_SPOKES):
            a = 360.0 * i / N_SPOKES + 36.0  # offset to land between spokes
            # build a wedge pocket at angle a, spanning the radial gap
            mid_r = (LIGHTENING_R_OUTER + LIGHTENING_R_INNER) / 2.0
            x = mid_r * math.cos(math.radians(a))
            y = mid_r * math.sin(math.radians(a))
            # pocket: rectangular cutout ~70 mm wide radially, ~50 mm tangentially
            pocket_w = (LIGHTENING_R_OUTER - LIGHTENING_R_INNER) * 0.9
            pocket_h = 50.0
            pkt = (cq.Workplane("XY")
                     .center(0, 0)
                     .rect(pocket_w, pocket_h)
                     .extrude(LIGHTENING_DEPTH + 1.0)
                     .translate((x, y, 0))
                     .rotate((0, 0, 0), (0, 0, 1), a)
                     .translate((0, 0, face_sign * (CORE_WIDTH / 2.0 - LIGHTENING_DEPTH / 2.0))))
            core = core.cut(pkt)
    return core

def make_tread_marking():
    """Embossed '12X3' text on one face of the tread (raised letters).
    Approximated with a flat rectangular boss on the tread face (true text
    geometry would need a font-extrusion tool)."""
    # Simple representation: 4 raised rectangular pads spelling "12X3"
    # Using cq.Workplane text() if available
    try:
        txt = (cq.Workplane("XY")
                 .text(MARK_TEXT, MARK_HEIGHT, MARK_DEPTH, font="Noto Sans"))
        # center the text and place it on the +Z face of the tread
        bb = txt.val().BoundingBox()
        txt = txt.translate((-bb.xlen / 2.0, -bb.ylen / 2.0,
                              WHEEL_WIDTH / 2.0 - MARK_DEPTH / 2.0))
        return txt
    except Exception as e:
        print(f"  (text marking skipped: {e})")
        return None

def make_axle():
    """M16 hex-head bolt with flange."""
    shank = (cq.Workplane("XY")
               .circle(AXLE_DIA / 2.0)
               .extrude(AXLE_LEN)
               .translate((0, 0, -AXLE_LEN / 2.0)))
    # Hex head as a polygon extrusion
    head = (cq.Workplane("XY")
              .polygon(6, AXLE_HEAD_ACROSS_FLATS / math.cos(math.radians(30)))
              .extrude(AXLE_HEAD_THK)
              .translate((0, 0, AXLE_LEN / 2.0)))
    # Flange between head and shank
    flange = (cq.Workplane("XY")
                .circle(AXLE_FLANGE_DIA / 2.0)
                .extrude(AXLE_FLANGE_THK)
                .translate((0, 0, AXLE_LEN / 2.0 - AXLE_FLANGE_THK / 2.0)))
    return shank.union(head).union(flange)

def make_nut():
    """Hex nut for the opposite side."""
    return (cq.Workplane("XY")
              .polygon(6, NUT_ACROSS_FLATS / math.cos(math.radians(30)))
              .extrude(NUT_THK)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .cutThruAll()
              .translate((0, 0, -AXLE_LEN / 2.0)))

def make_fork_leg(side_sign):
    """One rigid fork leg: flat strap with axle hole and a 90-deg bend at top
    to form the collar. side_sign = +1 / -1."""
    # Build leg in XZ plane (normal = Y), then translate to its side.
    leg = (cq.Workplane("XZ")
             .center(0, 0)
             # outer profile: rectangle with rounded top
             .rect(FORK_LEG_W, FORK_LEG_LEN, centered=False)
             .extrude(FORK_THK))
    # Translate so the leg starts at axle center (z=0) and goes up
    leg = leg.translate((-FORK_LEG_W / 2.0, 0, 0))
    # Cut axle hole through the bottom of the leg
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + 15.0)
             .hole(AXLE_DIA + 1.0))
    # Round top corners
    try:
        leg = leg.edges(">Z").edges("|Y").fillet(FORK_BEND_R / 2.0)
    except Exception:
        pass
    # Translate to its side of the wheel
    leg = leg.translate((0, side_sign * FORK_GAP / 2.0, 0))
    return leg

def make_top_collar():
    """Cylindrical collar at the top of the fork where the stem mounts."""
    return (cq.Workplane("XY")
              .circle(TOP_COLLAR_OD / 2.0)
              .circle(STEM_OD / 2.0 + 0.5)
              .extrude(TOP_COLLAR_LEN)
              .translate((0, 0, FORK_LEG_LEN + TOP_COLLAR_LEN / 2.0)))

def make_brake_pedal():
    """Cam-action face brake: a curved scimitar-shaped pedal that pivots on a
    bolt near the top of the fork and cams a curved shoe into the tread face."""
    # Pivot cylinder (3/8 in bolt) at z = BRAKE_PIVOT_OFFSET_Z above axle
    pivot = (cq.Workplane("XY")
               .circle(BRAKE_PIVOT_DIA / 2.0)
               .extrude(FORK_GAP + 20)
               .translate((0, 0, BRAKE_PIVOT_OFFSET_Z - (FORK_GAP + 20) / 2.0)))

    # Pedal arm: rectangular plate from pivot outward + downward
    pedal = (cq.Workplane("XZ")
               .center(0, 0)
               .rect(BRAKE_PEDAL_LEN, BRAKE_PEDAL_THK, centered=False)
               .extrude(BRAKE_PEDAL_W)
               .translate((0, -BRAKE_PEDAL_W / 2.0, BRAKE_PIVOT_OFFSET_Z - BRAKE_PEDAL_THK / 2.0)))
    # Bend the pedal downward at the end (cam-shape): cut a curve from top
    # Actually represent the scimitar shape with a swept curve - approximate
    # by rotating the pedal end down by 25 deg around the pivot
    pedal = pedal.rotate((0, 0, BRAKE_PIVOT_OFFSET_Z), (0, 1, 0), -25.0)

    # Curved brake shoe that contacts the tread (a thin curved pad matching tread OD)
    shoe_angle_deg = 30.0   # arc length of contact shoe
    shoe_arc_r = BRAKE_SHOE_R
    # Build shoe as a torus segment? Simpler: thin curved plate approximated by
    # a small box positioned tangentially above the wheel
    shoe = (cq.Workplane("XZ")
              .center(0, 0)
              .rect(40.0, BRAKE_SHOE_THK, centered=False)
              .extrude(BRAKE_PEDAL_W)
              .translate((0, -BRAKE_PEDAL_W / 2.0,
                          BRAKE_PIVOT_OFFSET_Z - BRAKE_PEDAL_THK / 2.0 - BRAKE_PEDAL_LEN + 20)))
    # Position shoe so it presses on the tread face (offset to side of wheel)
    shoe = shoe.translate((0, 0, 0))
    return pivot.union(pedal).union(shoe)

def make_stem():
    """Round stem with cross-drilled pin hole and red knurled grip ring."""
    # Main shank
    stem = (cq.Workplane("XY")
              .circle(STEM_OD / 2.0)
              .extrude(STEM_LEN))
    # Cross-drill pin hole
    pin_cut = (cq.Workplane("YZ")
                 .center(0, 0)
                 .circle(PIN_HOLE_DIA / 2.0)
                 .extrude(STEM_OD * 1.2)
                 .translate((-STEM_OD * 0.6, 0, 0)))
    stem = stem.cut(pin_cut.translate((0, 0, STEM_LEN - PIN_HOLE_Z)))
    return stem

def make_grip_ring():
    """Red knurled grip ring at base of stem."""
    ring = (cq.Workplane("XY")
              .circle(GRIP_RING_OD / 2.0)
              .circle(STEM_OD / 2.0)
              .extrude(GRIP_RING_LEN))
    # Knurl approximation: small axial grooves around the perimeter
    n_knurls = 36
    for i in range(n_knurls):
        a = 360.0 * i / n_knurls
        x = (GRIP_RING_OD / 2.0 - 0.5) * math.cos(math.radians(a))
        y = (GRIP_RING_OD / 2.0 - 0.5) * math.sin(math.radians(a))
        ring = (ring.faces(">Z").workplane()
                  .moveTo(x, y)
                  .hole(0.8))
    return ring

# ============================= BUILD ASSEMBLY ================================
asm = cq.Assembly(name="Industrial_Caster_12x3")

# 1. Wheel: tread + core, axis = Y (so wheel rolls along X)
tread = make_tread().rotate((0,0,0), (1,0,0), 90)
core  = make_core().rotate((0,0,0), (1,0,0), 90)
asm.add(tread, name="Tread_PU_Red",     color=cq.Color(0.85, 0.10, 0.10))
asm.add(core,  name="Hub_Cast_Aluminum", color=cq.Color(0.70, 0.72, 0.75))

# 2. Tread marking (12X3) on one face of the tread
mark = make_tread_marking()
if mark is not None:
    # place on +Y face (since wheel rotated)
    mark = mark.rotate((0,0,0), (1,0,0), 90)
    asm.add(mark, name="Marking_12X3", color=cq.Color(0.95, 0.95, 0.95))

# 3. Axle bolt + nut (along Y axis)
axle = make_axle().rotate((0,0,0), (1,0,0), 90)
nut  = make_nut().rotate((0,0,0), (1,0,0), 90)
asm.add(axle, name="Axle_M16_HexHead", color=cq.Color(0.30, 0.30, 0.35))
asm.add(nut,  name="Nut_M16_Hex",      color=cq.Color(0.30, 0.30, 0.35))

# 4. Two rigid fork legs + top collar
asm.add(make_fork_leg(+1), name="Fork_R", color=cq.Color(0.55, 0.55, 0.60))
asm.add(make_fork_leg(-1), name="Fork_L", color=cq.Color(0.55, 0.55, 0.60))
asm.add(make_top_collar(), name="Top_Collar", color=cq.Color(0.55, 0.55, 0.60))

# 5. Brake pedal assembly (positioned on +X side, pivoting above the wheel)
brake = make_brake_pedal()
asm.add(brake, name="Brake_Pedal_Assy", color=cq.Color(0.40, 0.40, 0.45))

# 6. Stem + grip ring on top of the fork
stem_z = FORK_LEG_LEN + TOP_COLLAR_LEN
asm.add(make_stem().translate((0, 0, stem_z)),
        name="Stem_28mm", color=cq.Color(0.55, 0.55, 0.60))
asm.add(make_grip_ring().translate((0, 0, stem_z)),
        name="GripRing_Red_Knurled", color=cq.Color(0.85, 0.10, 0.10))

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "industrial_caster_12x3.step")
stl_path  = os.path.join(OUT_DIR, "industrial_caster_12x3.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.1, angularTolerance=0.3)

print(f"Wheel OD      : {WHEEL_OD} mm  (12 in)")
print(f"Wheel width   : {WHEEL_WIDTH} mm  (3 in)")
print(f"Tread         : red PU, {TREAD_THK} mm thick")
print(f"Core          : cast aluminum, {N_SPOKES} spokes, OD={CORE_OD} mm")
print(f"Axle          : M16 hex head with flange")
print(f"Stem          : Ø{STEM_OD} mm x {STEM_LEN} mm, Ø{PIN_HOLE_DIA} pin hole @ {PIN_HOLE_Z} mm below top")
print(f"Grip ring     : Ø{GRIP_RING_OD} mm, knurled, red")
print(f"Brake         : cam-action face brake, pedal {BRAKE_PEDAL_LEN} mm")
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
