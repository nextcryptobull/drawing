"""
Validate the generated STEP files and render preview PNGs.
"""
import os
import cadquery as cq
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TCollection import TCollection_ExtendedString

OUT = "/home/z/my-project/download"
PREVIEW = "/home/z/my-project/download/previews"
os.makedirs(PREVIEW, exist_ok=True)

files = [
    "ringlock_rosette.step",
    "ringlock_standard_1m.step",
]

for f in files:
    p = os.path.join(OUT, f)
    # Re-import to validate
    try:
        imp = cq.importers.importStep(p)
        n_solids = len(imp.vals())
        bb = imp.val().BoundingBox()
        print(f"OK  {f}:  solids={n_solids}  bbox=({bb.xlen:.1f} x {bb.ylen:.1f} x {bb.zlen:.1f}) mm")
    except Exception as e:
        print(f"FAIL {f}: {e}")

# Render preview SVGs (cadquery can export SVG natively - fast and no GL needed)
for f in files:
    p = os.path.join(OUT, f)
    imp = cq.importers.importStep(p)
    svg_path = os.path.join(PREVIEW, f.replace(".step", ".svg"))
    cq.exporters.export(imp, svg_path, opt={
        "projectionDir": (1, -1, 0.5),
        "width": 800,
        "height": 600,
        "marginLeft": 20,
        "marginTop": 20,
        "showAxes": False,
        "showHidden": False,
    })
    print(f"SVG -> {svg_path}  ({os.path.getsize(svg_path)/1024:.1f} KB)")
