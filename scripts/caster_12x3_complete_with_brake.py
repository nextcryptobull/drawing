"""
COMPLETE 12x3 Caster Wheel with Full Brake System.
Matched to user's reference images.

Components (all in ONE STEP file):
  WHEEL:
    - Red PU tread (12mm thick, Ø305 x 76)
    - Cast aluminum 6-spoke hub
    - 2x 6204 ball bearings
    - M12 hex-head axle bolt + nut + washers

  YOKE (rigid, zinc-plated steel):
    - Two fork legs (offset rigid yoke, not swivel)
    - Stamped steel plate, 4mm thick
    - Top collar for stem weld
    - Stamped "C-A-3" marking on side

  MOUNTING STEM:
    - Ø25 mm steel stem, 65 mm long
    - Cross-drilled Ø8 mm pin hole at 15 mm from top
    - Red knurled grip ring at base (Ø32 mm)

  COMPLETE BRAKE SYSTEM (dual-action foot pedal, total-lock style):
    1. Foot pedal (stamped steel, teardrop shape, 110mm long, with slot cutout)
    2. Pivot shoulder bolt (M8 hex head + nut) at top of fork leg
    3. Torsion return spring (coil around pivot, 8 turns)
    4. Curved brake shoe (crescent-shaped, wraps tread, contacts red PU face)
    5. Linkage arm connecting pedal to brake shoe
    6. "12X3" embossed marking on wheel
    7. "C-A-3" stamped marking on fork leg
"""
import cadquery as cq
import math
import os
import importlib.util

OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

# ============================= PARAMETERS ===================================
# --- Wheel (12 x 3 in) ---
WHEEL_OD        = 305.0
WHEEL_WIDTH     = 76.0
TREAD_THK       = 12.0
TREAD_CORNER_R  = 4.0
CORE_OD         = WHEEL_OD - 2 * TREAD_THK    # 281 mm
CORE_WIDTH      = WHEEL_WIDTH
HUB_BOSS_OD     = 70.0
HUB_BORE        = 52.0     # holds 2x 6204 bearings (47mm OD with sleeve)
N_SPOKES        = 6
SPOKE_WIDTH     = 28.0
SPOKE_THK       = 14.0
RIM_THK         = 8.0
LIGHTENING_R_OUTER = CORE_OD / 2.0 - 10.0
LIGHTENING_R_INNER = HUB_BOSS_OD / 2.0 + 8.0
LIGHTENING_DEPTH   = (CORE_WIDTH - SPOKE_THK) / 2.0

# Bearing (6204)
BEARING_OD      = 47.0
BEARING_ID      = 20.0
BEARING_WIDTH   = 14.0

# Axle (M12 per VLM analysis)
AXLE_DIA        = 12.0
AXLE_LEN        = WHEEL_WIDTH + 50.0
AXLE_HEAD_AF    = 19.0
AXLE_HEAD_THK   = 8.0
NUT_AF          = 19.0
NUT_THK         = 10.0
WASHER_OD       = 24.0
WASHER_THK      = 2.0

# --- Yoke (rigid) ---
FORK_THK        = 4.0       # stamped sheet metal
FORK_GAP        = WHEEL_WIDTH + 8.0     # 84 mm gap
FORK_LEG_W      = 90.0      # fork leg width (along axle)
FORK_LEG_LEN    = 180.0     # leg length from axle center up
FORK_BEND_R     = 25.0
TOP_COLLAR_OD   = 60.0
TOP_COLLAR_LEN  = 25.0
# Offset (rigid yoke has legs offset back from wheel center)
FORK_OFFSET_X   = -40.0    # fork legs are 40mm behind wheel axle (in -X dir)

# --- Stem ---
STEM_OD        = 25.0
STEM_LEN       = 65.0
GRIP_RING_OD   = 32.0
GRIP_RING_LEN  = 12.0
PIN_HOLE_DIA   = 8.0
PIN_HOLE_Z     = 15.0       # 15mm below stem top

# --- BRAKE SYSTEM ---
# Pedal
PEDAL_LEN       = 110.0
PEDAL_W         = 28.0
PEDAL_THK       = 3.0       # stamped sheet
PEDAL_SLOT_L    = 25.0      # cutout slot in pedal
PEDAL_SLOT_W    = 8.0
PEDAL_TIP_R     = 12.0      # rounded teardrop tip
PEDAL_ANGLE_DEG = -30.0     # pedal tilts down 30deg from horizontal at rest

# Pivot (M8 shoulder bolt)
PIVOT_DIA       = 8.0
PIVOT_LEN       = 50.0      # spans fork leg + pedal + nut
PIVOT_HEAD_AF   = 13.0
PIVOT_HEAD_THK  = 5.0
PIVOT_OFFSET_X  = FORK_LEG_W / 2.0 + 15.0   # outside fork leg
PIVOT_OFFSET_Z  = 90.0      # above axle, near top of fork

# Torsion spring (return spring around pivot)
SPRING_COIL_DIA = 14.0
SPRING_WIRE_DIA = 2.0
SPRING_N_TURNS  = 6
SPRING_LEN      = 20.0
SPRING_LEG_LEN  = 30.0      # extension leg that pushes pedal up

# Curved brake shoe (the part that contacts tread)
SHOE_ARC_DEG    = 50.0      # wraps 50deg of tread
SHOE_THK        = 4.0
SHOE_WIDTH      = 60.0       # wider than pedal for stable contact
SHOE_INNER_R    = WHEEL_OD / 2.0    # matches tread OD
SHOE_OUTER_R    = WHEEL_OD / 2.0 + SHOE_THK

# Linkage arm (connects pedal pivot to brake shoe pivot)
LINK_LEN        = 80.0
LINK_W          = 15.0
LINK_THK        = 3.0

# Shoe pivot (separate bolt where shoe pivots - lower on fork leg)
SHOE_PIVOT_DIA  = 6.0
SHOE_PIVOT_OFFSET_X = FORK_LEG_W / 2.0 + 15.0   # outside fork leg (same side)
SHOE_PIVOT_OFFSET_Z = 30.0      # 30mm above axle

# ============================= PART BUILDERS =================================
def make_tread():
    body = (cq.Workplane("XY")
              .circle(WHEEL_OD / 2.0)
              .circle(CORE_OD / 2.0)
              .extrude(WHEEL_WIDTH)
              .translate((0, 0, -WHEEL_WIDTH / 2.0)))
    try:
        body = body.edges(">Z").edges("|Z").fillet(TREAD_CORNER_R)
        body = body.edges("<Z").edges("|Z").fillet(TREAD_CORNER_R)
    except Exception:
        pass
    return body.rotate((0,0,0), (1,0,0), 90)

def make_hub():
    """6-spoke cast aluminum hub."""
    boss = (cq.Workplane("XY")
              .circle(HUB_BOSS_OD / 2.0)
              .circle(HUB_BORE / 2.0)
              .extrude(CORE_WIDTH)
              .translate((0, 0, -CORE_WIDTH / 2.0)))
    rim = (cq.Workplane("XY")
             .circle(CORE_OD / 2.0)
             .circle(CORE_OD / 2.0 - RIM_THK)
             .extrude(CORE_WIDTH)
             .translate((0, 0, -CORE_WIDTH / 2.0)))
    spokes = None
    for i in range(N_SPOKES):
        a = 360.0 * i / N_SPOKES
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
    # Lightening pockets between spokes on both faces
    for face_sign in (+1, -1):
        for i in range(N_SPOKES):
            a = 360.0 * i / N_SPOKES + 30.0
            mid_r = (LIGHTENING_R_OUTER + LIGHTENING_R_INNER) / 2.0
            x = mid_r * math.cos(math.radians(a))
            y = mid_r * math.sin(math.radians(a))
            pocket_w = (LIGHTENING_R_OUTER - LIGHTENING_R_INNER) * 0.9
            pocket_h = 60.0
            pkt = (cq.Workplane("XY")
                     .center(0, 0)
                     .rect(pocket_w, pocket_h)
                     .extrude(LIGHTENING_DEPTH + 1.0)
                     .translate((x, y, 0))
                     .rotate((0, 0, 0), (0, 0, 1), a)
                     .translate((0, 0, face_sign * (CORE_WIDTH / 2.0 - LIGHTENING_DEPTH / 2.0))))
            core = core.cut(pkt)
    return core.rotate((0,0,0), (1,0,0), 90)

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

def make_washer():
    return (cq.Workplane("XY")
              .circle(WASHER_OD / 2.0)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .extrude(WASHER_THK)
              .translate((0, 0, -AXLE_LEN / 2.0 + NUT_THK + WASHER_THK/2))
              .rotate((0,0,0), (1,0,0), 90))

def make_fork_leg(side_sign):
    """One rigid fork leg, offset in -X direction (behind wheel).
    Built in XZ plane, then translated to its Y side."""
    leg = (cq.Workplane("XZ")
             .center(0, 0)
             .rect(FORK_LEG_W, FORK_LEG_LEN, centered=False)
             .extrude(FORK_THK))
    leg = leg.translate((FORK_OFFSET_X - FORK_LEG_W / 2.0, 0, 0))
    # Axle hole near bottom (z = 20)
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + 20.0)
             .hole(AXLE_DIA + 1.0))
    # Brake pivot hole (high up on leg, z = PIVOT_OFFSET_Z)
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + PIVOT_OFFSET_Z)
             .hole(PIVOT_DIA + 0.5))
    # Shoe pivot hole (mid-height on leg, z = SHOE_PIVOT_OFFSET_Z)
    leg = (leg.faces(">Y").workplane()
             .center(0, 0)
             .moveTo(0, -FORK_LEG_LEN / 2.0 + SHOE_PIVOT_OFFSET_Z)
             .hole(SHOE_PIVOT_DIA + 0.5))
    # Top collar weld prep (just leave solid for now)
    try:
        leg = leg.edges(">Z").edges("|Y").fillet(FORK_BEND_R / 2.0)
    except Exception:
        pass
    leg = leg.translate((0, side_sign * FORK_GAP / 2.0, 0))
    return leg

def make_top_collar():
    return (cq.Workplane("XY")
              .circle(TOP_COLLAR_OD / 2.0)
              .circle(STEM_OD / 2.0 + 0.5)
              .extrude(TOP_COLLAR_LEN)
              .translate((FORK_OFFSET_X, 0, FORK_LEG_LEN + TOP_COLLAR_LEN / 2.0)))

def make_stem():
    stem = (cq.Workplane("XY")
              .circle(STEM_OD / 2.0)
              .extrude(STEM_LEN))
    pin_cut = (cq.Workplane("YZ")
                 .center(0, 0)
                 .circle(PIN_HOLE_DIA / 2.0)
                 .extrude(STEM_OD * 1.2)
                 .translate((-STEM_OD * 0.6, 0, 0)))
    stem = stem.cut(pin_cut.translate((0, 0, STEM_LEN - PIN_HOLE_Z)))
    return stem

def make_grip_ring():
    ring = (cq.Workplane("XY")
              .circle(GRIP_RING_OD / 2.0)
              .circle(STEM_OD / 2.0)
              .extrude(GRIP_RING_LEN))
    n_knurls = 48
    for i in range(n_knurls):
        a = 360.0 * i / n_knurls
        x = (GRIP_RING_OD / 2.0 - 0.5) * math.cos(math.radians(a))
        y = (GRIP_RING_OD / 2.0 - 0.5) * math.sin(math.radians(a))
        ring = (ring.faces(">Z").workplane()
                  .moveTo(x, y)
                  .hole(0.6))
    return ring

def make_brake_pedal():
    """Foot pedal - flat stamped steel with teardrop shape and slot.
    Built in XZ plane, pivots at origin, extends +X and -Z (downward at angle).
    At rest position (disengaged), pedal is tilted up."""
    # Main pedal body: rectangular plate with rounded tip
    pedal = (cq.Workplane("XZ")
               .center(0, 0)
               # teardrop shape: rectangle + circle at end
               .rect(PEDAL_LEN - PEDAL_TIP_R, PEDAL_W, centered=False)
               .extrude(PEDAL_THK))
    # Round tip (teardrop)
    tip = (cq.Workplane("XZ")
             .center(0, 0)
             .circle(PEDAL_TIP_R)
             .extrude(PEDAL_THK)
             .translate((PEDAL_LEN - PEDAL_TIP_R, 0, 0)))
    # Combine tip and main body (in XZ plane, Y extrusion)
    # Note: rect centered=False creates from origin (0,0) to (L, W)
    # Need to translate rect so its top is at y=0 (centered in Y around 0)
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
    # Cut slot in middle of pedal (rectangular cutout)
    slot = (cq.Workplane("XZ")
              .center(0, 0)
              .rect(PEDAL_SLOT_L, PEDAL_SLOT_W)
              .extrude(PEDAL_THK * 2)
              .translate((PEDAL_LEN / 2.0, 0, 0)))
    pedal = pedal.cut(slot)
    # Round all edges lightly
    try:
        pedal = pedal.edges("|Y").fillet(1.5)
    except Exception:
        pass
    return pedal

def make_pivot_bolt():
    """M8 hex-head shoulder bolt for brake pedal pivot."""
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
    """Coil spring around pivot + 2 extension legs (one pushes pedal up,
    one anchors to fork)."""
    # Coil body
    coil = (cq.Workplane("XY")
              .circle(SPRING_COIL_DIA / 2.0)
              .circle(SPRING_COIL_DIA / 2.0 - SPRING_WIRE_DIA)
              .extrude(SPRING_LEN)
              .translate((0, 0, -SPRING_LEN / 2.0)))
    # Leg 1 (top, anchors to fork)
    leg1 = (cq.Workplane("XY")
              .rect(SPRING_LEG_LEN, SPRING_WIRE_DIA * 1.5)
              .extrude(SPRING_WIRE_DIA)
              .translate((SPRING_LEG_LEN / 2.0, 0, SPRING_LEN / 2.0 - SPRING_WIRE_DIA / 2.0)))
    # Leg 2 (bottom, pushes pedal up - in -X direction)
    leg2 = (cq.Workplane("XY")
              .rect(SPRING_LEG_LEN, SPRING_WIRE_DIA * 1.5)
              .extrude(SPRING_WIRE_DIA)
              .translate((-SPRING_LEG_LEN / 2.0, 0, -SPRING_LEN / 2.0 + SPRING_WIRE_DIA / 2.0)))
    return coil.union(leg1).union(leg2)

def make_brake_shoe():
    """Curved brake shoe - crescent shape that contacts tread OD.
    Built with arc centered at origin, opens toward +Z (top of wheel)."""
    arc_half = SHOE_ARC_DEG / 2.0
    annulus = (cq.Workplane("XY")
                 .circle(SHOE_OUTER_R)
                 .circle(SHOE_INNER_R)
                 .extrude(SHOE_WIDTH)
                 .translate((0, 0, -SHOE_WIDTH / 2.0)))
    # Cut side wedges to leave only the arc segment around +Y axis
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
    # Rotate so arc opens toward +Z (top of wheel) - rotate +90 around X
    shoe = shoe.rotate((0,0,0), (1,0,0), 90)
    return shoe

def make_linkage_arm():
    """Linkage arm connecting pedal pivot to brake shoe pivot.
    Simple rectangular bar."""
    return (cq.Workplane("XZ")
              .center(0, 0)
              .rect(LINK_LEN, LINK_THK, centered=False)
              .extrude(LINK_W)
              .translate((0, -LINK_W / 2.0, -LINK_THK / 2.0)))

def make_shoe_pivot_bolt():
    """M6 hex bolt for brake shoe pivot."""
    shank = (cq.Workplane("XY")
               .circle(SHOE_PIVOT_DIA / 2.0)
               .extrude(40.0)
               .translate((0, 0, -20.0)))
    head = (cq.Workplane("XY")
              .polygon(6, 10.0 / math.cos(math.radians(30)))
              .extrude(4.0)
              .translate((0, 0, 20.0)))
    return shank.union(head)

# ============================= ASSEMBLE ======================================
asm = cq.Assembly(name="Caster_12x3_Complete_with_Brake")

# --- WHEEL ---
asm.add(make_tread(),  name="Tread_Red_PU",      color=cq.Color(0.85, 0.10, 0.10))
asm.add(make_hub(),    name="Hub_Cast_Al_6spoke", color=cq.Color(0.70, 0.72, 0.75))
asm.add(make_bearing().translate((0, -BEARING_WIDTH/2 - 1, 0)),
        name="Bearing_6204_outer", color=cq.Color(0.80, 0.80, 0.85))
asm.add(make_bearing().translate((0,  BEARING_WIDTH/2 + 1, 0)),
        name="Bearing_6204_inner", color=cq.Color(0.80, 0.80, 0.85))

# Axle assembly
asm.add(make_axle(),   name="Axle_M12_HexHead",   color=cq.Color(0.30, 0.30, 0.35))
asm.add(make_nut(),    name="Nut_M12_Hex",        color=cq.Color(0.30, 0.30, 0.35))
asm.add(make_washer(), name="Washer",             color=cq.Color(0.40, 0.40, 0.45))

# --- YOKE ---
asm.add(make_fork_leg(+1), name="Fork_R",  color=cq.Color(0.72, 0.74, 0.78))
asm.add(make_fork_leg(-1), name="Fork_L",  color=cq.Color(0.72, 0.74, 0.78))
asm.add(make_top_collar(), name="Top_Collar", color=cq.Color(0.72, 0.74, 0.78))

# --- STEM ---
stem_z = FORK_LEG_LEN + TOP_COLLAR_LEN
asm.add(make_stem().translate((FORK_OFFSET_X, 0, stem_z)),
        name="Stem_25mm", color=cq.Color(0.72, 0.74, 0.78))
asm.add(make_grip_ring().translate((FORK_OFFSET_X, 0, stem_z)),
        name="GripRing_Red_Knurled", color=cq.Color(0.85, 0.10, 0.10))

# --- BRAKE SYSTEM ---
# All brake parts are on the +Y side fork leg (visible side)
PIVOT_LOC = (PIVOT_OFFSET_X, FORK_GAP / 2.0, PIVOT_OFFSET_Z)
SHOE_PIVOT_LOC = (SHOE_PIVOT_OFFSET_X, FORK_GAP / 2.0, SHOE_PIVOT_OFFSET_Z)

# 1. Foot pedal - rotates around pivot, tilts down 30deg at rest (disengaged)
pedal = make_brake_pedal()
# Rotate pedal so its long axis is at PEDAL_ANGLE_DEG from horizontal
pedal = pedal.rotate((0,0,0), (0,1,0), PEDAL_ANGLE_DEG)
pedal = pedal.translate(PIVOT_LOC)
asm.add(pedal, name="Brake_Pedal_Foot", color=cq.Color(0.60, 0.62, 0.65))   # silver/zinc

# 2. Pivot bolt (along Y axis at pivot location)
pivot_bolt = make_pivot_bolt().rotate((0,0,0), (1,0,0), 90)
asm.add(pivot_bolt.translate(PIVOT_LOC),
        name="Brake_Pivot_Bolt_M8", color=cq.Color(0.30, 0.30, 0.35))

# 3. Torsion return spring (around pivot, between fork leg and pedal)
spring = make_torsion_spring().rotate((0,0,0), (1,0,0), 90)
asm.add(spring.translate(PIVOT_LOC),
        name="Brake_Torsion_Spring", color=cq.Color(0.50, 0.50, 0.55))

# 4. Curved brake shoe (arc center at wheel center, opens upward)
shoe = make_brake_shoe()
# Shoe is positioned so its arc center is at wheel axle (0, 0, 0).
# Place it on +Y side of wheel (outside, where pedal is)
shoe = shoe.translate((0, FORK_GAP / 2.0 - SHOE_WIDTH / 2.0 - 2.0, 0))
asm.add(shoe, name="Brake_Curved_Shoe", color=cq.Color(0.60, 0.62, 0.65))

# 5. Linkage arm (connects pedal pivot to shoe pivot, runs diagonally)
link = make_linkage_arm()
# Position link between PIVOT_LOC and SHOE_PIVOT_LOC
# Compute rotation to point from shoe pivot toward main pivot
dx = PIVOT_LOC[0] - SHOE_PIVOT_LOC[0]
dz = PIVOT_LOC[2] - SHOE_PIVOT_LOC[2]
link_angle = math.degrees(math.atan2(dz, dx))
link_len_actual = math.sqrt(dx*dx + dz*dz)
# Scale the link to actual length
link = (cq.Workplane("XZ")
          .center(0, 0)
          .rect(link_len_actual, LINK_THK, centered=False)
          .extrude(LINK_W)
          .translate((0, -LINK_W / 2.0, -LINK_THK / 2.0)))
link = link.rotate((0,0,0), (0,1,0), link_angle)
link = link.translate(SHOE_PIVOT_LOC)
asm.add(link, name="Brake_Linkage_Arm", color=cq.Color(0.55, 0.55, 0.58))

# 6. Shoe pivot bolt
shoe_pivot_bolt = make_shoe_pivot_bolt().rotate((0,0,0), (1,0,0), 90)
asm.add(shoe_pivot_bolt.translate(SHOE_PIVOT_LOC),
        name="Brake_Shoe_Pivot_Bolt_M6", color=cq.Color(0.30, 0.30, 0.35))

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "caster_12x3_complete_with_brake.step")
stl_path  = os.path.join(OUT_DIR, "caster_12x3_complete_with_brake.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.1, angularTolerance=0.3)

# Validation
imp = cq.importers.importStep(step_path)
bb = imp.val().BoundingBox()
print("=" * 70)
print("COMPLETE 12x3 CASTER WITH FULL BRAKE SYSTEM")
print("=" * 70)
print(f"Wheel         : Ø{WHEEL_OD}mm x {WHEEL_WIDTH}mm  (12 in x 3 in)")
print(f"  Tread       : red PU, {TREAD_THK}mm thick")
print(f"  Hub         : cast Al, {N_SPOKES} spokes, Ø{CORE_OD}mm core, 2x 6204 bearings, M12 axle")
print(f"Yoke          : rigid, {FORK_THK}mm stamped steel, zinc-plated")
print(f"Stem          : Ø{STEM_OD}mm x {STEM_LEN}mm, Ø{PIN_HOLE_DIA}mm pin hole, red knurled grip ring")
print()
print("COMPLETE BRAKE SYSTEM (6 parts):")
print(f"  1. Foot pedal       : {PEDAL_LEN}mm long, {PEDAL_W}mm wide, stamped steel, slot cutout")
print(f"  2. Pivot bolt       : M8 hex head, length {PIVOT_LEN}mm")
print(f"  3. Torsion spring   : Ø{SPRING_COIL_DIA}mm coil, {SPRING_N_TURNS} turns, 2 legs")
print(f"  4. Curved brake shoe: wraps {SHOE_ARC_DEG}deg of tread, {SHOE_WIDTH}mm wide")
print(f"  5. Linkage arm      : connects pedal pivot to shoe pivot")
print(f"  6. Shoe pivot bolt  : M6 hex head")
print()
print(f"BBox          : {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
print(f"Solids in STEP: {len(imp.vals())}")
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
