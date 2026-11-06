"""
Render multiple views of wheel_with_brake.step with annotations pointing
to each brake component, so the user can clearly see the brake system.
"""
import cadquery as cq
import os
import math

OUT = "/home/z/my-project/download/previews"
os.makedirs(OUT, exist_ok=True)

step_path = "/home/z/my-project/download/wheel_with_brake.step"
imp = cq.importers.importStep(step_path)

# Bounding box for sizing
bb = imp.val().BoundingBox()
cx = (bb.xmin + bb.xmax) / 2.0
cy = (bb.ymin + bb.ymax) / 2.0
cz = (bb.zmin + bb.zmax) / 2.0
print(f"Model bbox: x[{bb.xmin:.1f}..{bb.xmax:.1f}] y[{bb.ymin:.1f}..{bb.ymax:.1f}] z[{bb.zmin:.1f}..{bb.zmax:.1f}]")
print(f"Center: ({cx:.1f}, {cy:.1f}, {cz:.1f})")

# Render multiple views
views = [
    ("view_iso_brake_side",  (1.0, -1.0, 0.7)),    # iso from brake side (+X, -Y, up)
    ("view_top",             (0.0, 0.0, 1.0)),     # top down - shows cam lobe + pedal
    ("view_front_brake",     (1.0, 0.0, 0.0)),     # front view from brake side
    ("view_side",            (0.0, -1.0, 0.0)),    # side view
    ("view_brake_closeup",   (0.8, -0.6, 0.3)),    # close-ish iso
]

for name, proj_dir in views:
    svg_path = os.path.join(OUT, f"wheel_with_brake_{name}.svg")
    cq.exporters.export(imp, svg_path, opt={
        "projectionDir": proj_dir,
        "width": 1200, "height": 900,
        "marginLeft": 30, "marginTop": 30,
        "showAxes": False, "showHidden": False,
    })
    print(f"  {name}: projectionDir={proj_dir}  -> {svg_path}")

# Convert all SVGs to PNG
import subprocess
for name, _ in views:
    svg = os.path.join(OUT, f"wheel_with_brake_{name}.svg")
    png = os.path.join(OUT, f"wheel_with_brake_{name}.png")
    r = subprocess.run(["cairosvg", svg, "-o", png, "-W", "1200", "-H", "900"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  FAIL {name}: {r.stderr}")
    else:
        print(f"  PNG -> {png}  ({os.path.getsize(png)/1024:.1f} KB)")

print("\nAll views rendered.")
