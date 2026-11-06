"""Render CasterHQ 8x2 with complete brake system as annotated PNGs."""
import cadquery as cq
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib.patches import FancyArrowPatch
from mpl_toolkits.mplot3d.proj3d import proj_transform
import os, importlib.util, tempfile, stl, math

OUT_DIR = "/home/z/my-project/download/previews"
TMP = tempfile.mkdtemp(prefix="casterhq_brake_")

spec = importlib.util.spec_from_file_location("cb", "/home/z/my-project/scripts/casterhq_complete_brake.py")
cb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cb)

# Build parts list (mirror assembly construction)
PIVOT_LOC = (cb.PIVOT_OFFSET_X, cb.FORK_GAP / 2.0, cb.PIVOT_OFFSET_Z)
SHOE_PIVOT_LOC = (cb.SHOE_PIVOT_OFFSET_X, cb.FORK_GAP / 2.0, cb.SHOE_PIVOT_OFFSET_Z)
swivel_z = cb.FORK_LEG_LEN

parts = [
    (cb.make_tread(),  "Tread_Blue_PU",   (0.10, 0.30, 0.85)),
    (cb.make_hub(),    "Hub",             (0.20, 0.20, 0.22)),
    (cb.make_bearing().translate((0, -cb.BEARING_WIDTH/2 - 1, 0)),
     "Bearing_outer", (0.80, 0.80, 0.85)),
    (cb.make_bearing().translate((0,  cb.BEARING_WIDTH/2 + 1, 0)),
     "Bearing_inner", (0.80, 0.80, 0.85)),
    (cb.make_axle(),   "Axle",            (0.30, 0.30, 0.35)),
    (cb.make_nut(),    "Nut",             (0.30, 0.30, 0.35)),
    (cb.make_washer(+1), "Washer1",       (0.40, 0.40, 0.45)),
    (cb.make_washer(-1), "Washer2",       (0.40, 0.40, 0.45)),
    (cb.make_fork_leg(+1), "Fork_R",      (0.72, 0.74, 0.78)),
    (cb.make_fork_leg(-1), "Fork_L",      (0.72, 0.74, 0.78)),
    (cb.make_swivel_assembly().translate((cb.SWIVEL_OFFSET, 0, swivel_z)),
     "Swivel",         (0.72, 0.74, 0.78)),
    # BRAKE PARTS - bright orange for high visibility
    (cb.make_brake_pedal().rotate((0,0,0),(0,1,0),cb.PEDAL_ANGLE_DEG).translate(PIVOT_LOC),
     "Pedal",          (0.95, 0.45, 0.10)),
    (cb.make_pivot_bolt().rotate((0,0,0),(1,0,0),90).translate(PIVOT_LOC),
     "PivotBolt",      (0.30, 0.30, 0.35)),
    (cb.make_torsion_spring().rotate((0,0,0),(1,0,0),90).translate(PIVOT_LOC),
     "Spring",         (0.50, 0.50, 0.55)),
    (cb.make_brake_shoe().translate((0, cb.FORK_GAP/2 - cb.SHOE_WIDTH/2 - 2, 0)),
     "Shoe",           (0.95, 0.45, 0.10)),
]
# Linkage arm - rebuild properly
dx = PIVOT_LOC[0] - SHOE_PIVOT_LOC[0]
dz = PIVOT_LOC[2] - SHOE_PIVOT_LOC[2]
link_angle = math.degrees(math.atan2(dz, dx))
link_len = math.sqrt(dx*dx + dz*dz)
link = (cq.Workplane("XZ")
          .center(0,0)
          .rect(link_len, cb.LINK_THK, centered=False)
          .extrude(cb.LINK_W)
          .translate((0, -cb.LINK_W/2, -cb.LINK_THK/2))
          .rotate((0,0,0),(0,1,0),link_angle)
          .translate(SHOE_PIVOT_LOC))
parts.append((link, "Linkage", (0.95, 0.45, 0.10)))
parts.append((cb.make_shoe_pivot_bolt().rotate((0,0,0),(1,0,0),90).translate(SHOE_PIVOT_LOC),
               "ShoePivotBolt", (0.30, 0.30, 0.35)))

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

def render_view(azim, elev, name, callouts=None, title=None, zoom=None, figsize=(14,11)):
    fig = plt.figure(figsize=figsize, dpi=110)
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
callouts1 = [
    (PIVOT_LOC, "1. FOOT PEDAL (orange)\n100mm stamped steel + toe tab + slot",
     (70, -25, 55)),
    ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
     "4. CURVED BRAKE SHOE (orange)\nWraps 40deg of tread",
     (60, 50, 50)),
    ((PIVOT_LOC[0], PIVOT_LOC[1], PIVOT_LOC[2] + 12),
     "2. M8 PIVOT BOLT\n3. TORSION SPRING",
     (-80, -10, 55)),
    (SHOE_PIVOT_LOC, "5. LINKAGE ARM\n6. M6 SHOE PIVOT BOLT",
     (-50, 30, -45)),
    ((0, 0, 0), "WHEEL 8x2 in\nBlue PU + cast iron hub\nM16 axle + nut + 2 washers",
     (-150, -90, 0)),
    ((cb.SWIVEL_OFFSET, 0, swivel_z + cb.TOP_PLATE_THK + cb.SWIVEL_BOSS_LEN + 5),
     "TOP PLATE 4x4.5 in\n12-ball swivel raceway",
     (-50, 30, 35)),
]
render_view(azim=-50, elev=15, name="CasterHQ_with_brake_ANNOTATED.png",
            callouts=callouts1,
            title="CasterHQ HQ4980S-G3-SPR 8x2  +  COMPLETE BRAKE SYSTEM\n"
                  "(6 brake components in orange + yellow labels)")

# ===== VIEW 2: Brake close-up =====
brake_center_x = (PIVOT_LOC[0] + 0) / 2
brake_center_y = PIVOT_LOC[1]
brake_center_z = (PIVOT_LOC[2] + cb.WHEEL_OD/2) / 2
render_view(azim=-65, elev=8, name="CasterHQ_with_brake_CLOSEUP.png",
            zoom=(brake_center_x, brake_center_y, brake_center_z, 110),
            callouts=[
                (PIVOT_LOC, "1. FOOT PEDAL\n(orange, 100mm)", (50, 20, 45)),
                ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
                 "4. CURVED BRAKE SHOE\n(orange, contacts tread)",
                 (35, 35, 45)),
                (PIVOT_LOC, "2. M8 PIVOT BOLT\n3. TORSION SPRING",
                 (60, -35, -10)),
                (SHOE_PIVOT_LOC,
                 "5. LINKAGE ARM\n6. M6 SHOE PIVOT BOLT",
                 (-30, 25, -35)),
            ],
            title="BRAKE SYSTEM CLOSE-UP\n6 components: pedal + pivot bolt + spring + shoe + linkage + shoe pivot")

# ===== VIEW 3: Clean iso =====
render_view(azim=-50, elev=20, name="CasterHQ_with_brake_CLEAN.png",
            title="CasterHQ 8x2 with complete brake - clean iso view")

# ===== VIEW 4: Side view =====
render_view(azim=0, elev=5, name="CasterHQ_with_brake_SIDE.png",
            callouts=[
                (PIVOT_LOC, "BRAKE PEDAL (orange)", (40, 0, 45)),
                ((0, cb.FORK_GAP/2, cb.WHEEL_OD/2 + cb.SHOE_THK),
                 "BRAKE SHOE (orange)", (40, 0, 40)),
            ],
            title="Side view - brake engages tread face")

# ===== VIEW 5: Top view =====
render_view(azim=0, elev=89, name="CasterHQ_with_brake_TOP.png",
            title="Top view - pedal and brake layout visible")

print("\nAll views rendered.")
