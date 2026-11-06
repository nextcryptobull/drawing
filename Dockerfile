# =============================================================================
# Scaffold Parts Configurator — Dockerfile (production, Railway-optimized)
# =============================================================================
# This Dockerfile is what Railway will use (Railpack/Nixpacks are ignored
# when a Dockerfile is present). Forces Node.js + Python + cadquery.
# =============================================================================

# ---- Stage 1: Build the Next.js standalone bundle --------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json ./

# Install Node dependencies with npm (NOT bun — bun causes HTTP binding issues)
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy the rest of the source
COPY . .

# Build Next.js standalone bundle
RUN npm run build

# ---- Stage 2: Production image with Node + Python + cadquery --------------
FROM node:22-slim AS runner

# Install Python 3 + pip + system deps for cadquery (OCP needs OpenGL libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        libgl1 \
        libglib2.0-0 \
        libxrender1 \
        libxext6 \
        libsm6 \
        curl \
        && rm -rf /var/lib/apt/lists/*

# Install cadquery (heavy step, ~200MB)
RUN pip3 install --no-cache-dir --break-system-packages cadquery 2>/dev/null || \
    pip3 install --no-cache-dir cadquery 2>/dev/null

# Verify cadquery works at build time (fail fast if broken)
RUN python3 -c "import cadquery; print('cadquery', cadquery.__version__, 'OK')"

WORKDIR /app

# Copy the standalone build from builder stage
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Python STEP generator scripts
COPY scripts/generate_step.py ./scripts/
COPY scripts/ringlock_rosette.py ./scripts/
COPY scripts/ringlock_standard.py ./scripts/
COPY scripts/ringlock_caster.py ./scripts/

# Create writable directories
RUN mkdir -p /app/db /app/download /tmp/scaffold-step-gen

# Production env vars
# PORT and HOSTNAME are set by the platform (Render=10000, Railway=3000, etc.)
# Next.js standalone reads PORT env var automatically.
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PYTHON_BIN=python3
ENV PYTHONPATH=/app/scripts
ENV GENERATOR_PATH=/app/scripts/generate_step.py
ENV WORK_DIR=/app/download
ENV TMP_DIR=/tmp/scaffold-step-gen

# Expose both common ports (Render uses 10000, others use 3000).
# The actual port is set at runtime via the PORT env var by the platform.
EXPOSE 3000 10000

# Healthcheck: uses $PORT so it works on any platform (Render, Railway, etc.)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf "http://localhost:${PORT:-3000}/" || exit 1

# CRITICAL: Start with Node.js (NOT bun). bun causes HTTP binding issues
# with Next.js standalone — process appears alive but doesn't respond.
# Next.js standalone reads PORT env var to know which port to listen on.
CMD ["node", "server.js"]
