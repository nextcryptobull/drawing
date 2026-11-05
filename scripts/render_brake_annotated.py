"""
Render wheel + brake as shaded 3D images with brake callouts.
Strategy: export each part as a separate STL (already triangulated),
load STLs into matplotlib Poly3DCollection with proper face colors,
then add text callouts pointing to the brake parts.
"""
import cadquery as cq
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib.patches import FancyArrowPatch
from mpl_toolkits.mplot3d.proj3d import proj_transform
import os
import sys
import importlib.util
import tempfile
import stl   # numpy-stl

OUT_DIR = "/home/z/my-project/download/previews"
TMP = tempfile.mkdtemp(prefix="stlparts_")

# Load build module
spec = importlib.util.spec_from_file_location("wb", "/home/z/my-project/scripts/wheel_with_brake.py")
wb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wb)

# Build parts list
PIVOT_X = wb.BRAKE_PIVOT_OFFSET_X
PIVOT_Y = 0.0
PIVOT_Z = wb.BRAKE_PIVOT_OFFSET_Z

parts = []
parts.append((wb.make_tread(), "Tread_Blue_PU", (0.10, 0.30, 0.85)))
parts.append((wb.make_hub(),   "Hub_Cast_Iron", (0.20, 0.20, 0.22)))

brg = wb.make_bearing()
parts.append((brg.translate((0, -wb.BEARING_WIDTH/2 - 1, 0)), "Bearing_outer", (0.80, 0.80, 0.85)))
parts.append((brg.translate((0,  wb.BEARING_WIDTH/2 + 1, 0)), "Bearing_inner", (0.80, 0.80, 0.85)))

parts.append((wb.make_axle(), "Axle_M16", (0.30, 0.30, 0.35)))
parts.append((wb.make_nut(),  "Nut_M16",  (0.30, 0.30, 0.35)))

pedal, cam, shoe = wb.make_brake_pedal()
pedal = pedal.rotate((0,0,0), (0,0,1), 180).translate((PIVOT_X, PIVOT_Y, PIVOT_Z))
parts.append((pedal, "Brake_Pedal_Arm", (0.90, 0.10, 0.10)))

cam = cam.translate((PIVOT_X, PIVOT_Y, PIVOT_Z))
parts.append((cam, "Brake_TotalLock_Cam", (0.90, 0.10, 0.10)))

shoe = shoe.rotate((0,0,0), (1,0,0), -90)
parts.append((shoe, "Brake_Curved_Shoe", (0.90, 0.10, 0.10)))

pivot_bolt = wb.make_pivot_bolt().rotate((0,0,0), (1,0,0), 90).translate((PIVOT_X, PIVOT_Y, PIVOT_Z))
parts.append((pivot_bolt, "Brake_Pivot_Bolt", (0.30, 0.30, 0.35)))

# Export each part as a separate STL
print(f"Exporting {len(parts)} parts to STL...")
stl_files = []
for wp, name, color in parts:
    p = os.path.join(TMP, f"{name}.stl")
    cq.exporters.export(wp, p, exportType="STL", tolerance=0.1, angularTolerance=0.2)
    stl_files.append((p, name, color))
    print(f"  {name:25s} -> {os.path.getsize(p)/1024:.1f} KB")

# Load each STL into triangle arrays
all_parts_mesh = []
for p, name, color in stl_files:
    mesh = stl.Mesh.from_file(p)
    # mesh.vectors is (N, 3, 3)
    all_parts_mesh.append((mesh.vectors.copy(), name, color))
print(f"Loaded {len(all_parts_mesh)} meshes")

# Bounding box of everything
all_pts = np.concatenate([m.reshape(-1, 3) for m, _, _ in all_parts_mesh], axis=0)
mins = all_pts.min(axis=0); maxs = all_pts.max(axis=0)
extent = (maxs - mins).max() / 2.0 * 1.2
center = (mins + maxs) / 2.0
print(f"BBox: mins={mins}, maxs={maxs}, center={center}, extent={extent}")

# Arrow3D helper for callouts
class Arrow3D(FancyArrowPatch):
    def __init__(self, x, y, z, dx, dy, dz, *args, **kwargs):
        super().__init__((0,0), (0,0), *args, **kwargs)
        self._xyz = (x,y,z); self._dxdydz = (dx,dy,dz)
    def do_3d_projection(self, renderer=None):
        x1,y1,z1 = self._xyz; dx,dy,dz = self._dxdydz
        x2,y2,z2 = (x1+dx, y1+dy, z1+dz)
        xs, ys, zs = proj_transform((x1,x2),(y1,y2),(z1,z2), self.axes.M)
        self.set_positions((xs[0],ys[0]),(xs[1],ys[1]))
        return min(zs)

# ============= VIEW 1: ANNOTATED ISO =============
fig = plt.figure(figsize=(14, 11), dpi=100)
ax = fig.add_subplot(111, projection='3d')
for tris, name, color in all_parts_mesh:
    poly = Poly3DCollection(tris, alpha=0.95)
    poly.set_facecolor(color)
    poly.set_edgecolor(None)
    poly.set_linewidth(0)
    ax.add_collection3d(poly)
ax.set_xlim(center[0]-extent, center[0]+extent)
ax.set_ylim(center[1]-extent, center[1]+extent)
ax.set_zlim(center[2]-extent, center[2]+extent)
ax.set_box_aspect([1, 1, 1])
ax.view_init(elev=15, azim=-55)

# Callouts (anchor_xyz, label, offset_xyz for arrow direction)
callouts = [
    ((PIVOT_X, 0, PIVOT_Z), "BRAKE PEDAL ARM (red, 110mm)\nPivots here on M8 bolt",
     (50, -30, 50)),
    ((0, 0, wb.WHEEL_OD/2 + wb.BRAKE_SHOE_THK/2),
     "CURVED BRAKE SHOE (red)\nPresses on tread when pedal down",
     (-60, 60, 35)),
    ((PIVOT_X, 0, PIVOT_Z + wb.LOCK_CAM_H + 8),
     "TOTAL-LOCK CAM LOBE\nLocks swivel rotation",
     (60, -45, 30)),
    ((0, 0, 0), "WHEEL 8in x 2in\nBlue PU tread\nCast iron hub",
     (-90, 70, -10)),
    ((wb.AXLE_LEN/2 + 10, 0, 0), "M16 AXLE\n(hex head)",
     (40, 30, -40)),
]
for anchor, label, offset in callouts:
    a = Arrow3D(anchor[0], anchor[1], anchor[2],
                offset[0]*0.55, offset[1]*0.55, offset[2]*0.55,
                mutation_scale=18, lw=2.5,
                arrowstyle="-|>", color="black")
    ax.add_artist(a)
    ax.text(anchor[0]+offset[0], anchor[1]+offset[1], anchor[2]+offset[2],
            label, fontsize=10, fontweight='bold',
            color='black',
            bbox=dict(boxstyle='round,pad=0.5', facecolor='yellow',
                      edgecolor='black', alpha=0.95))

ax.set_title("Wheel + Brake System  (8x2 in blue PU, cam-action + total-lock brake)",
             fontsize=14, fontweight='bold', pad=18)
ax.set_axis_off()
out1 = os.path.join(OUT_DIR, "wheel_with_brake_ANNOTATED.png")
plt.savefig(out1, dpi=110, bbox_inches='tight', facecolor='white')
plt.close()
print(f"ANNOTATED -> {out1}  ({os.path.getsize(out1)/1024:.1f} KB)")

# ============= VIEW 2: CLEAN SHADED ISO (no callouts) =============
fig = plt.figure(figsize=(12, 10), dpi=100)
ax = fig.add_subplot(111, projection='3d')
for tris, name, color in all_parts_mesh:
    poly = Poly3DCollection(tris, alpha=0.95)
    poly.set_facecolor(color)
    poly.set_edgecolor(None)
    poly.set_linewidth(0)
    ax.add_collection3d(poly)
ax.set_xlim(center[0]-extent, center[0]+extent)
ax.set_ylim(center[1]-extent, center[1]+extent)
ax.set_zlim(center[2]-extent, center[2]+extent)
ax.set_box_aspect([1, 1, 1])
ax.view_init(elev=20, azim=-35)
ax.set_axis_off()
ax.set_title("Wheel + Brake  (clean shaded iso view - brake on the right)",
             fontsize=13, fontweight='bold', pad=15)
out2 = os.path.join(OUT_DIR, "wheel_with_brake_CLEAN.png")
plt.savefig(out2, dpi=110, bbox_inches='tight', facecolor='white')
plt.close()
print(f"CLEAN    -> {out2}  ({os.path.getsize(out2)/1024:.1f} KB)")

# ============= VIEW 3: TOP DOWN =============
fig = plt.figure(figsize=(12, 10), dpi=100)
ax = fig.add_subplot(111, projection='3d')
for tris, name, color in all_parts_mesh:
    poly = Poly3DCollection(tris, alpha=0.95)
    poly.set_facecolor(color)
    poly.set_edgecolor(None)
    poly.set_linewidth(0)
    ax.add_collection3d(poly)
ax.set_xlim(center[0]-extent, center[0]+extent)
ax.set_ylim(center[1]-extent, center[1]+extent)
ax.set_zlim(center[2]-extent, center[2]+extent)
ax.set_box_aspect([1, 1, 1])
ax.view_init(elev=85, azim=-30)
ax.set_axis_off()
ax.set_title("Wheel + Brake  (TOP VIEW - pedal arm + cam lobe visible)",
             fontsize=13, fontweight='bold', pad=15)
out3 = os.path.join(OUT_DIR, "wheel_with_brake_TOP.png")
plt.savefig(out3, dpi=110, bbox_inches='tight', facecolor='white')
plt.close()
print(f"TOP      -> {out3}  ({os.path.getsize(out3)/1024:.1f} KB)")

# ============= VIEW 4: BRAKE SIDE CLOSE-UP =============
fig = plt.figure(figsize=(12, 10), dpi=100)
ax = fig.add_subplot(111, projection='3d')
for tris, name, color in all_parts_mesh:
    poly = Poly3DCollection(tris, alpha=0.95)
    poly.set_facecolor(color)
    poly.set_edgecolor(None)
    poly.set_linewidth(0)
    ax.add_collection3d(poly)
# Zoom into brake area (pivot at +X side, +Z above axle)
ax.set_xlim(0, PIVOT_X + 80)
ax.set_ylim(-60, 60)
ax.set_zlim(0, PIVOT_Z + 80)
ax.set_box_aspect([1, 1, 1])
ax.view_init(elev=10, azim=-60)
ax.set_axis_off()
ax.set_title("BRAKE SYSTEM close-up\n(red pedal + curved shoe + total-lock cam lobe)",
             fontsize=13, fontweight='bold', pad=15)
out4 = os.path.join(OUT_DIR, "wheel_with_brake_CLOSEUP.png")
plt.savefig(out4, dpi=110, bbox_inches='tight', facecolor='white')
plt.close()
print(f"CLOSEUP  -> {out4}  ({os.path.getsize(out4)/1024:.1f} KB)")
