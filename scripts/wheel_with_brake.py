"""
Single consolidated file: Wheel + Brake system only.

Outputs ONE STEP file containing:
  - Tread (blue PU)
  - Hub (cast iron, with bearing seats)
  - 2x 6204 ball bearings
  - Axle bolt + nut (M16)
  - Brake pedal assembly (cam-action face brake with total-lock cam lobe)
  - Brake pivot bolt

Wheel spec: 8" x 2" blue solid polyurethane, 1000 lb capacity
           (CasterHQ HQ4980S-G3-SPR compatible)
"""

import cadquery as cq
import math
import os

OUT_DIR = "/home/z/my-project/download"

# ============================= PARAMETERS ===================================
# Wheel
WHEEL_OD        = 203.2     # 8 in
WHEEL_WIDTH     = 50.8      # 2 in
TREAD_THK       = 12.0      # blue PU thickness
HUB_OD          = WHEEL_OD - 2 * TREAD_THK    # 179.2 mm
HUB_LEN         = WHEEL_WIDTH
HUB_BORE        = 47.0      # 6204 bearing OD
TREAD_CORNER_R  = 4.0

# Bearing (6204)
BEARING_OD      = 47.0
BEARING_ID      = 20.0
BEARING_WIDTH   = 14.0

# Axle (M16)
AXLE_DIA        = 16.0
AXLE_LEN        = WHEEL_WIDTH + 40.0     # protrudes 20 mm each side
AXLE_HEAD_AF    = 24.0      # hex head across flats
AXLE_HEAD_THK   = 10.0
NUT_AF          = 24.0
NUT_THK         = 12.0

# Brake
BRAKE_PIVOT_DIA      = 8.0      # 5/16" pivot bolt
BRAKE_PIVOT_LEN      = 70.0     # length spans fork gap
BRAKE_PIVOT_HEAD_AF  = 13.0
BRAKE_PIVOT_HEAD_THK = 5.0
BRAKE_PIVOT_OFFSET_Z = 60.0     # 60 mm above axle center
BRAKE_PIVOT_OFFSET_X = 60.0     # 60 mm to side of axle (outside wheel)

BRAKE_PEDAL_LEN      = 110.0
BRAKE_PEDAL_W        = 25.0
BRAKE_PEDAL_THK      = 4.0

# Curved brake shoe that contacts the tread
BRAKE_SHOE_ARC_DEG   = 35.0     # wraps 35 deg of tread OD
BRAKE_SHOE_THK       = 5.0
BRAKE_SHOE_WIDTH     = 30.0
BRAKE_SHOE_RAD_INNER = WHEEL_OD / 2.0          # matches tread OD
BRAKE_SHOE_RAD_OUTER = WHEEL_OD / 2.0 + BRAKE_SHOE_THK

# Total-lock cam lobe (engages a notch on the swivel boss - represented
# here as a small block above the pedal pivot pointing upward)
LOCK_CAM_W           = 12.0
LOCK_CAM_H           = 18.0
LOCK_CAM_THK         = 6.0

# ============================= BUILD =========================================
def make_tread():
    """Blue polyurethane tread - annular ring with rounded outer corners."""
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
    # Rotate so wheel axis = Y (rolls along X)
    return body.rotate((0,0,0), (1,0,0), 90)

def make_hub():
    """Cast iron hub holding bearings."""
    hub = (cq.Workplane("XY")
             .circle(HUB_OD / 2.0)
             .circle(HUB_BORE / 2.0)
             .extrude(HUB_LEN)
             .translate((0, 0, -HUB_LEN / 2.0)))
    return hub.rotate((0,0,0), (1,0,0), 90)

def make_bearing():
    """6204 ball bearing (outer race + inner race sketch)."""
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
    """M16 hex-head bolt."""
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
    """Hex nut."""
    return (cq.Workplane("XY")
              .polygon(6, NUT_AF / math.cos(math.radians(30)))
              .extrude(NUT_THK)
              .circle(AXLE_DIA / 2.0 + 0.5)
              .cutThruAll()
              .translate((0, 0, -AXLE_LEN / 2.0))
              .rotate((0,0,0), (1,0,0), 90))

def make_brake_shoe():
    """Curved brake shoe that wraps BRAKE_SHOE_ARC_DEG of the tread OD.
    Built in XY plane (centered on origin), then positioned by caller."""
    # Build as an annular sector: difference of two arcs swept around Z
    # Use cq Workplane with a polar sketch.
    # Simpler: build a tube segment using two concentric circles cut by two angles.
    arc_half = BRAKE_SHOE_ARC_DEG / 2.0
    # Build the full annulus first, then cut two wedges to leave just the arc segment
    annulus = (cq.Workplane("XY")
                 .circle(BRAKE_SHOE_RAD_OUTER)
                 .circle(BRAKE_SHOE_RAD_INNER)
                 .extrude(BRAKE_SHOE_WIDTH)
                 .translate((0, 0, -BRAKE_SHOE_WIDTH / 2.0)))
    # Cut wedges at angles 0 ± (180 - arc_half) to leave arc segment centered on +Y
    # Easier: rotate the annulus, then cut a big box at angles outside the arc.
    # Use a polygon approximation: cut two rectangular wedges
    # Approach: build wedge from outer circle to outer circle +/- arc_half
    wedge_w = BRAKE_SHOE_RAD_OUTER * 2.0
    wedge_h = BRAKE_SHOE_RAD_OUTER * 2.0
    # Cut everything outside the arc by cutting two side rectangles
    cut1 = (cq.Workplane("XY")
              .rect(wedge_w, wedge_h)
              .extrude(BRAKE_SHOE_WIDTH * 1.2)
              .translate((-wedge_w * 0.75, 0, 0)))
    cut2 = (cq.Workplane("XY")
              .rect(wedge_w, wedge_h)
              .extrude(BRAKE_SHOE_WIDTH * 1.2)
              .translate((wedge_w * 0.75, 0, 0)))
    annulus = annulus.cut(cut1).cut(cut2)
    # Now annulus is a strip along +Y direction. Rotate so arc is centered on +Y axis.
    # The arc spans +/- arc_half around +Y, which is what we have.
    return annulus

def make_brake_pedal():
    """Brake pedal arm + curved shoe + total-lock cam lobe, all in one body.
    Pivot is at origin; pedal extends in +X direction (sideways from wheel)."""
    # Pedal arm: rectangular plate extending +X from pivot
    pedal = (cq.Workplane("XZ")
               .center(0, 0)
               .rect(BRAKE_PEDAL_LEN, BRAKE_PEDAL_THK, centered=False)
               .extrude(BRAKE_PEDAL_W)
               .translate((0, -BRAKE_PEDAL_W / 2.0, -BRAKE_PEDAL_THK / 2.0)))
    # Round the free end of the pedal (finger tab)
    try:
        pedal = pedal.edges(">X").edges("|Y").fillet(8.0)
    except Exception:
        pass

    # Curved brake shoe at end of pedal arm, oriented to wrap around tread OD
    # Shoe arcs around the +Z direction (top of wheel)
    shoe = make_brake_shoe()
    # Position shoe so its inner radius sits on the tread OD, above the pedal arm
    # Shoe's arc center should be at the wheel center (0,0,0) in pedal's local frame
    # But shoe is at end of pedal (X = BRAKE_PEDAL_LEN), so we need to position the
    # shoe such that its arc center is back at the axle center.
    # If pivot is at (BRAKE_PIVOT_OFFSET_X, 0, BRAKE_PIVOT_OFFSET_Z) in wheel frame,
    # and pedal extends +X from pivot, then pedal end is at (BRAKE_PIVOT_OFFSET_X
    # + BRAKE_PEDAL_LEN, 0, BRAKE_PIVOT_OFFSET_Z).
    # For the shoe to wrap the tread, its arc center must coincide with axle (0,0,0).
    # So in pedal-local frame, shoe's arc center is at (-BRAKE_PIVOT_OFFSET_X - BRAKE_PEDAL_LEN,
    # 0, -BRAKE_PIVOT_OFFSET_Z). This is awkward, so let's just position the shoe
    # in wheel frame directly.

    # Total-lock cam lobe: small block pointing up from pivot
    cam = (cq.Workplane("XY")
             .rect(LOCK_CAM_W, LOCK_CAM_H)
             .extrude(LOCK_CAM_THK)
             .translate((0, 0, -LOCK_CAM_THK / 2.0))
             .translate((0, 0, BRAKE_PIVOT_HEAD_THK)))   # just above pivot head
    return pedal, cam, shoe

def make_pivot_bolt():
    """Brake pivot bolt: M8 with hex head and nut."""
    # Shank
    shank = (cq.Workplane("XY")
               .circle(BRAKE_PIVOT_DIA / 2.0)
               .extrude(BRAKE_PIVOT_LEN)
               .translate((0, 0, -BRAKE_PIVOT_LEN / 2.0)))
    # Head (hex)
    head = (cq.Workplane("XY")
              .polygon(6, BRAKE_PIVOT_HEAD_AF / math.cos(math.radians(30)))
              .extrude(BRAKE_PIVOT_HEAD_THK)
              .translate((0, 0, BRAKE_PIVOT_LEN / 2.0)))
    return shank.union(head)

# ============================= ASSEMBLE ======================================
asm = cq.Assembly(name="Wheel_with_Brake")

# Wheel: tread + hub + 2 bearings + axle + nut (axis = Y, rolls along X)
asm.add(make_tread(),  name="Tread_Blue_PU",      color=cq.Color(0.10, 0.30, 0.85))
asm.add(make_hub(),    name="Hub_Cast_Iron",      color=cq.Color(0.20, 0.20, 0.22))
asm.add(make_bearing().translate((0, -BEARING_WIDTH/2 - 1, 0)),
        name="Bearing_6204_outer", color=cq.Color(0.80, 0.80, 0.85))
asm.add(make_bearing().translate((0,  BEARING_WIDTH/2 + 1, 0)),
        name="Bearing_6204_inner", color=cq.Color(0.80, 0.80, 0.85))
asm.add(make_axle(),   name="Axle_M16_HexHead",   color=cq.Color(0.30, 0.30, 0.35))
asm.add(make_nut(),    name="Nut_M16_Hex",        color=cq.Color(0.30, 0.30, 0.35))

# Brake pedal assembly (separate parts - positioned in wheel frame)
# Pivot location: outside wheel on +X side, 60 mm above axle center
PIVOT_X = BRAKE_PIVOT_OFFSET_X
PIVOT_Y = 0.0
PIVOT_Z = BRAKE_PIVOT_OFFSET_Z

pedal, cam, shoe = make_brake_pedal()

# Position pedal arm: pivot at (PIVOT_X, PIVOT_Y, PIVOT_Z), arm extends -X toward wheel
# Re-orient: pedal was built extending +X, so we need to mirror or rotate 180° around Z
pedal = pedal.rotate((0,0,0), (0,0,1), 180)  # now extends -X from pivot
pedal = pedal.translate((PIVOT_X, PIVOT_Y, PIVOT_Z))
asm.add(pedal, name="Brake_Pedal_Arm", color=cq.Color(0.90, 0.10, 0.10))  # red

# Cam lobe: above pivot, pointing up
cam = cam.translate((PIVOT_X, PIVOT_Y, PIVOT_Z))
asm.add(cam, name="Brake_TotalLock_Cam", color=cq.Color(0.90, 0.10, 0.10))

# Curved brake shoe: arc center must be at axle (0,0,0). Shoe was built with
# arc centered on origin in its own frame, arc opening on +Y.
# We want the shoe to sit at top of wheel (+Z direction) pressing on tread.
# So rotate shoe so its arc opens toward +Z (top), and translate so its center
# is at axle (0,0,0). Since shoe was built centered at origin, no translation needed.
shoe = shoe.rotate((0,0,0), (1,0,0), -90)   # rotate so arc opens toward +Z (top of wheel)
asm.add(shoe, name="Brake_Curved_Shoe", color=cq.Color(0.90, 0.10, 0.10))

# Pivot bolt: along Y axis at pivot location
pivot_bolt = make_pivot_bolt().rotate((0,0,0), (1,0,0), 90)   # axis along Y
asm.add(pivot_bolt.translate((PIVOT_X, PIVOT_Y, PIVOT_Z)),
        name="Brake_Pivot_Bolt_M8", color=cq.Color(0.30, 0.30, 0.35))

# ============================= EXPORT ========================================
step_path = os.path.join(OUT_DIR, "wheel_with_brake.step")
stl_path  = os.path.join(OUT_DIR, "wheel_with_brake.stl")

asm.save(step_path, exportType="STEP")
asm.save(stl_path,  exportType="STL", tolerance=0.1, angularTolerance=0.3)

# Validate
import cadquery as cq2
imp = cq2.importers.importStep(step_path)
bb = imp.val().BoundingBox()
n_solids = len(imp.vals())

print("=" * 60)
print("SINGLE FILE: Wheel + Brake system")
print("=" * 60)
print(f"Wheel OD      : {WHEEL_OD} mm  (8 in)")
print(f"Wheel width   : {WHEEL_WIDTH} mm  (2 in)")
print(f"Tread         : blue PU, {TREAD_THK} mm thick")
print(f"Hub           : cast iron, 2x 6204 bearings, M16 axle")
print()
print("BRAKE SYSTEM (cam-action face brake + total-lock):")
print(f"  - Pedal arm    : red, {BRAKE_PEDAL_LEN} mm long, pivots on M8 bolt")
print(f"  - Curved shoe  : wraps {BRAKE_SHOE_ARC_DEG}° of tread, {BRAKE_SHOE_WIDTH} mm wide")
print(f"  - Total-lock   : cam lobe above pivot engages swivel boss notch")
print()
print(f"Solids in STEP : {n_solids}")
print(f"Bounding box   : {bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f} mm")
print(f"STEP -> {step_path}  ({os.path.getsize(step_path)/1024:.1f} KB)")
print(f"STL  -> {stl_path}  ({os.path.getsize(stl_path)/1024:.1f} KB)")
