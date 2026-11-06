# Scaffold Parts Configurator

**Accelerate your CAD workflow** — configure ringlock scaffold parts and caster wheels in seconds, export STEP files directly into SolidWorks, Inventor, or Fusion 360.

## The Fastest Path: Run Locally (STEP generation works)

This is the **recommended workflow** for engineers who need STEP files:

### One-time setup (2-3 minutes)

**Mac/Linux:**
```bash
git clone https://github.com/nextcryptobull/drawing.git
cd drawing
./setup.sh
```

**Windows:**
```cmd
git clone https://github.com/nextcryptobull/drawing.git
cd drawing
setup.bat
```

The setup script installs:
- Node.js dependencies
- Python + cadquery (for STEP generation)
- Builds the Next.js app

### Daily workflow (5 seconds to start)

**Mac/Linux:**
```bash
./run.sh
```

**Windows:**
```cmd
run.bat
```

Your browser opens to `http://localhost:3000`. Configure parts, click "Download STEP", and the file lands in your Downloads folder — ready to import into SolidWorks.

Press `Ctrl+C` in the terminal when done.

## What You Can Configure

### Caster Wheels (4 presets)
- 8×2 swivel, blue PU, total-lock brake, top plate
- 10×2.5 swivel, blue PU, face brake, top plate
- 12×3 rigid, red PU, total-lock brake, stem mount
- 12×3 swivel, red PU, total-lock brake, top plate

### Ringlock Rosettes (3 presets)
- Ø122mm standard (8 holes, 10mm thick)
- Ø100mm mini (8 holes, 8mm thick)
- Custom (edit all dimensions)

### Ringlock Standards (5 presets)
- 0.5m, 1m, 1.5m, 2m, 3m lengths
- 48.3mm OD tube, 3.2mm wall
- Rosettes every 500mm (EN 12811)

### Scaffold Towers (3 presets)
- **1×1 · 2m** — Single bay, 4-leg mobile tower, 1 lift
- **2×1 · 4m** — 2-bay work platform, 2 lifts, planks on top
- **2×2 · 6m** — Big access tower, 9 standards, 3 lifts

Each tower exports as ONE STEP file containing all standards, ledgers, braces, base jacks, and planks — ready to drop into a SolidWorks assembly.

## STEP Export Verified

All part types generate valid STEP files (ISO-10303-21 format):

| Part Type | Typical Size | Generation Time |
|---|---|---|
| Caster wheel | 180 KB | ~2 seconds |
| Ringlock rosette | 79 KB | ~1.5 seconds |
| Ringlock standard (1m) | 100 KB | ~2 seconds |
| Scaffold tower (1×1·2m) | 162 KB | ~3 seconds |
| Scaffold tower (2×2·6m) | 500 KB | ~5 seconds |

Open the STEP file in:
- **SolidWorks** → File → Open → select .step → import as solid/part
- **Autodesk Inventor** → File → Open → select .step
- **Fusion 360** → File → Open → select .step
- **FreeCAD** → File → Open → select .step

## Cloud Deployment Options

If you want to share the app with your team via a URL (instead of running locally):

### Option A: Render (RECOMMENDED for cloud STEP generation)

Render supports Dockerfiles and has a free tier. STEP generation works.

1. Go to https://render.com → "New +" → "Web Service"
2. Connect your GitHub repo `nextcryptobull/drawing`
3. Render auto-detects the `Dockerfile`
4. Click "Create Web Service"
5. Wait ~5 minutes (Python + cadquery install)
6. URL: `https://drawing.onrender.com`

**Note:** Free tier sleeps after 15 min idle (first request after sleep takes ~30s to wake). All features work including STEP generation.

### Option B: Google Cloud Run (most generous free tier)

1. Install `gcloud` CLI: https://cloud.google.com/sdk/docs/install
2. In terminal:
   ```bash
   gcloud auth login
   gcloud run deploy drawing \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 1Gi \
     --min-instances 0 \
     --max-instances 3
   ```
3. URL: `https://drawing-xxxx-uc.a.run.app`

Free tier: 2 million requests/month, scales to zero when idle.

### Option C: Railway (works with Dockerfile)

If you already have Railway set up, the latest code uses a Dockerfile that Railway will use directly (ignoring Railpack/Nixpacks).

**Important:** Make sure Railway is set to use the Dockerfile, not Railpack. In Railway → Settings → look for "Builder" or "Build Configuration" → set to "Dockerfile".

## Project Structure

```
drawing/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Main configurator page
│   │   └── api/generate-step/route.ts # STEP generation API
│   ├── components/
│   │   ├── configurator/             # Left panel, right panel, BOM cart
│   │   └── three/                    # 3D meshes (CasterMesh, RosetteMesh, etc.)
│   └── lib/                          # Types, presets, state management
├── scripts/
│   ├── generate_step.py              # Python cadquery STEP generator
│   └── launcher/                     # Standalone launcher scripts
├── Dockerfile                        # For Render/Cloud Run/Railway
├── setup.sh / setup.bat              # One-time setup
├── run.sh / run.bat                  # Start the app
└── dev.sh / dev.bat                  # Development mode
```

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui
- **3D viewer**: Three.js via @react-three/fiber
- **STEP generation**: Python + cadquery
- **State**: Zustand + browser localStorage

## Troubleshooting

### "STEP generation failed" or "Python not available"
The app needs Python + cadquery to generate STEP files. Install them:
```bash
pip install cadquery
```
Then restart with `./run.sh` (or `run.bat` on Windows).

### "Port 3000 is already in use"
```bash
PORT=3001 ./run.sh        # Mac/Linux
set PORT=3001 && run.bat  # Windows
```

### Browser doesn't open automatically
Open your browser manually to `http://localhost:3000`

## License

Internal use. Modify and distribute freely within your organization.
