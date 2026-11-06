"""
Render complete caster with brake system as annotated PNGs.
"""
import cadquery as cq
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib.patches import FancyArrowPatch
from mpl_toolkits.mplot3d.proj3d import proj_transform
import os, sys, importlib.util, tempfile, stl

OUT_DIR = "/home/z/my-project/download/previews"
TMP = tempfile.mkdtemp(prefix="brake_complete_")

spec = importlib.util.spec_from_file_location("cb", "/home/z/my-project/scripts/caster_12x3_complete_with_brake.py")
cb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cb)

# Replicate parts list (mirror assembly construction)
PIVOT_LOC = (cb.PIVOT_OFFSET_X, cb.FORK_GAP / 2.0, cb.PIVOT_OFFSET_Z)
SHOE_PIVOT_LOC = (cb.SHOE_PIVOT_OFFSET_X, cb.FORK_GAP / 2.0, cb.SHOE_PIVOT_OFFSET_Z)
stem_z = cb.FORK_LEG_LEN + cb.TOP_COLLAR_LEN

parts = [
    (cb.make_tread(),  "Tread_Red_PU",           (0.85, 0.10, 0.10)),
    (cb.make_hub(),    "Hub_Cast_Al_6spoke",     (0.70, 0.72, 0.75)),
    (cb.make_bearing().translate((0, -cb.BEARING_WIDTH/2 - 1, 0)),
     "Bearing_outer", (0.80, 0.80, 0.85)),
    (cb.make_bearing().translate((0,  cb.BEARING_WIDTH/2 + 1, 0)),
     "Bearing_inner", (0.80, 0.80, 0.85)),
    (cb.make_axle(),   "Axle_M12",               (0.30, 0.30, 0.35)),
    (cb.make_nut(),    "Nut_M12",                (0.30, 0.30, 0.35)),
    (cb.make_washer(), "Washer",                 (0.40, 0.40, 0.45)),
    (cb.make_fork_leg(+1), "Fork_R",             (0.72, 0.74, 0.78)),
    (cb.make_fork_leg(-1), "Fork_L",             (0.72, 0.74, 0.78)),
    (cb.make_top_collar(), "Top_Collar",         (0.72, 0.74, 0.78)),
    (cb.make_stem().translate((cb.FORK_OFFSET_X, 0, stem_z)),
     "Stem",            (0.72, 0.74, 0.78)),
    (cb.make_grip_ring().translate((cb.FORK_OFFSET_X, 0, stem_z)),
     "GripRing_Red",    (0.85, 0.10, 0.10)),
    # BRAKE PARTS (orange/red for high visibility)
    (cb.make_brake_pedal().rotate((0,0,0),(0,1,0),cb.PEDAL_ANGLE_DEG).translate(PIVOT_LOC),
     "Brake_Pedal",     (0.95, 0.45, 0.10)),     # bright orange
    (cb.make_pivot_bolt().rotate((0,0,0),(1,0,0),90).translate(PIVOT_LOC),
     "Brake_Pivot_Bolt",(0.30, 0.30, 0.35)),
    (cb.make_torsion_spring().rotate((0,0,0),(1,0,0),90).translate(PIVOT_LOC),
     "Brake_Spring",    (0.50, 0.50, 0.55)),
    (cb.make_brake_shoe().translate((0, cb.FORK_GAP/2 - cb.SHOE_WIDTH/2 - 2, 0)),
     "Brake_Shoe",      (0.95, 0.45, 0.10)),
    (cb.make_linkage_arm()
       if False else  # rebuild link inline below
       (cq.Workplane("XZ")
          .center(0,0)
          .rect(cb.LINK_LEN, cb.LINK_THK, centered=False)
          .extrude(cb.LINK_W)
          .translate((0, -cb.LINK_W/2, -cb.LINK_THK/2))
          .rotate((0,0,0),(0,1,0),0)),
     "Link_raw",        (0.55, 0.55, 0.58)),
    (cb.make_shoe_pivot_bolt().rotate((0,0,0),(1,0,0),90).translate(SHOE_PIVOT_LOC),
     "Shoe_Pivot_Bolt", (0.30, 0.30, 0.35)),
]
# Replace link with proper rotated+scaled version
import math
dx = PIVOT_LOC[0] - SHOE_PIVOT_LOC[0]
dz = PIVOT_LOC[2] - SHOE_PIVOT_LOC[2]
link_angle = math.degrees(math.atan2(dz, dx))
link_len_actual = math.sqrt(dx*dx + dz*dz)
link = (cq.Workplane("XZ")
          .center(0,0)
          .rect(link_len_actual, cb.LINK_THK, centered=False)
          .extrude(cb.LINK_W)
          .translate((0, -cb.LINK_W/2, -cb.LINK_THK/2))
          .rotate((0,0,0),(0,1,0),link_angle)
          .translate(SHOE_PIVOT_LOC))
parts[16] = (link, "Brake_Linkage", (0.95, 0.45, 0.10))

# Export STLs and load
print(f"Exporting {len(parts)} parts to STL...")
meshes = []
for wp, name, color in parts:
    p = os.path.join(TMP, f"{name}.stl")
    cq.exporters.export(wp, p, exportType="STL", tolerance=0.2, angularTolerance=0.5)
    m = stl.Mesh.from_file(p)
    meshes.append((m.vectors.copy(), name, color))

# Bounding box
all_pts = np.concatenate([m.reshape(-1, 3) for m, _, _ in meshes], axis=0)
mins = all_pts.min(axis=0); maxs = all_pts.max(axis=0)
extent = (maxs - mins).max() / 2.0 * 1.1
center = (mins + maxs) / 2.0
print(f"BBox: x[{mins[0]:.0f}..{maxs[0]:.0f}] y[{mins[1]:.0f}..{maxs[1]:.0f}] z[{mins[2]:.0f}..{maxs[2]:.0f}]")

# Arrow helper
class Arrow3D(FancyArrowPatch):
    def __init__(self, x, y, z, dx, dy, dz, *a, **k):
        super().__init__((0,0),(0,0), *a, **k)
        self._xyz=(x,y,z); self._dxdydz=(dx,dy,dz)
    def do_3d_projection(self, renderer=None):
        x1,y1,z1=self._xyz; dx,dy,dz=self._dxdydz
        x2,y2,z2=x1+dx,y1+dy,z1+dz
        xs,ys,zs=proj_transform((x1,x2),(y1,y2),(z1,z2), self.axes.M)
        self.set_positions((xs[0],ys[0]),(xs[1],ys[1]))
        return min(zs)

def render_view(azim, elev, name, callouts=None, title=None, zoom=None):
    fig = plt.figure(figsize=(14, 11), dpi=110)
    ax = fig.add_subplot(111, projection='3d')
    for tris, _, color in meshes:
        poly = Poly3DCollection(tris, alpha=0.96)
        poly.set_facecolor(color)
        poly.set_edgecolor(None); poly.set_linewidth(0)
        ax.add_collection3d(poly)
    if zoom:
        cx, cy, cz, ext = zoom
        ax.set_xlim(cx-ext, cx+ext); ax.set_ylim(cy-ext, cy+ext); ax.set_zlim(cz-ext, cz+ext)
    else:
        ax.set_xlim(center[0]-extent, center[0]+extent)
        ax.set_ylim(center[1]-extent, center[1]+extent)
        ax.set_zlim(center[2]-extent, center[2]+extent)
    ax.set_box_aspect([1, 1, 1])
    ax.view_init(elev=elev, azim=azim)
    if callouts:
        for anchor, label, offset in callouts:
            a = Arrow3D(anchor[0], anchor[1], anchor[2],
                        offset[0]*0.6, offset[1]*0.6, offset[2]*0.6,
                        mutation_scale=18, lw=2.5,
                        arrowstyle="-|>", color="black")
            ax.add_artist(a)
            ax.text(anchor[0]+offset[0], anchor[1]+offset[1], anchor[2]+offset[2],
                    label, fontsize=10, fontweight='bold',
                    bbox=dict(boxstyle='round,pad=0.5', facecolor='yellow',
                              edgecolor='black', alpha=0.95))
    ax.set_axis_off()
    if title: ax.set_title(title, fontsize=14, fontweight='bold', pad=18)
    out = os.path.join(OUT_DIR, name)
    plt.savefig(out, dpi=110, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"  {name}  ({os.path.getsize(out)/1024:.1f} KB)")

# ===== VIEW 1: Annotated iso from brake side =====
brake_callouts = [
    (PIVOT_LOC, "1. FOOT PEDAL (orange)\n110mm stamped steel",
     (80, -30, 60)),
    ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
     "4. CURVED BRAKE SHOE (orange)\nWraps 50deg of tread",
     (60, 60, 60)),
    ((PIVOT_LOC[0], PIVOT_LOC[1], PIVOT_LOC[2] + 15),
     "2. M8 PIVOT BOLT\n3. TORSION SPRING",
     (-100, -10, 60)),
    (SHOE_PIVOT_LOC, "5. LINKAGE ARM\n6. M6 SHOE PIVOT",
     (-50, 30, -50)),
    ((0, 0, 0), "WHEEL 12x3 in\nred PU + 6-spoke Al hub",
     (-160, -100, 0)),
    ((cb.FORK_OFFSET_X, 0, stem_z + 30),
     "STEM Ø25mm + red grip ring\nØ8mm pin hole",
     (-50, 30, 40)),
]
render_view(azim=-50, elev=15, name="complete_brake_ANNOTATED.png",
            callouts=brake_callouts,
            title="COMPLETE 12x3 CASTER WITH FULL BRAKE SYSTEM\n"
                  "(6 brake parts in orange + yellow labels)")

# ===== VIEW 2: Clean iso, no callouts =====
render_view(azim=-50, elev=20, name="complete_brake_CLEAN.png",
            title="12x3 caster with complete brake - clean iso view")

# ===== VIEW 3: Brake close-up =====
brake_center = ((PIVOT_LOC[0] + 0) / 2, PIVOT_LOC[1], (PIVOT_LOC[2] + cb.WHEEL_OD/2) / 2)
render_view(azim=-60, elev=10, name="complete_brake_CLOSEUP.png",
            zoom=(brake_center[0], brake_center[1], brake_center[2], 130),
            callouts=[
                (PIVOT_LOC, "1. FOOT PEDAL\n(orange, 110mm)", (60, 20, 50)),
                ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
                 "4. CURVED BRAKE SHOE\n(orange, contacts tread)",
                 (40, 40, 50)),
                (PIVOT_LOC, "2. M8 PIVOT BOLT\n3. TORSION SPRING",
                 (60, -40, -10)),
                (SHOE_PIVOT_LOC,
                 "5. LINKAGE ARM\n6. M6 SHOE PIVOT BOLT",
                 (-30, 30, -40)),
            ],
            title="BRAKE SYSTEM CLOSE-UP\n(6 components: pedal, bolt, spring, shoe, link, shoe pivot)")

# ===== VIEW 4: Top down =====
render_view(azim=0, elev=89, name="complete_brake_TOP.png",
            title="Top view - pedal and brake layout visible")

# ===== VIEW 5: Side view showing brake engagement =====
render_view(azim=0, elev=5, name="complete_brake_SIDE.png",
            callouts=[
                (PIVOT_LOC, "BRAKE PEDAL\n(orange)",
                 (50, 0, 50)),
                ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
                 "BRAKE SHOE\ncontacts tread",
                 (40, 0, 40)),
            ],
            title="Side view - brake engages tread")
print("\nAll views rendered.")
