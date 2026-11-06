# =============================================================================
# Scaffold Parts Configurator — Dockerfile (production)
# =============================================================================
# Two-stage build: Node.js app + Python + cadquery
# =============================================================================

# ---- Stage 1: Build the Next.js standalone bundle --------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Install bun for faster dependency install
RUN npm install -g bun 2>/dev/null || true

# Copy package files first (better layer caching)
COPY package.json bun.lock* package-lock.json* ./

# Install Node dependencies
RUN bun install 2>/dev/null || npm install --no-audit --no-fund

# Copy the rest of the source
COPY . .

# Build Next.js standalone bundle
RUN bun run build 2>/dev/null || npm run build

# ---- Stage 2: Production image with Node + Python + cadquery --------------
FROM python:3.12-slim AS runner

# Install system deps for cadquery (OCP needs OpenGL libs)
# Note: python:3.12-slim already has Python + pip, no need to install separately
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libxrender1 \
        libxext6 \
        libsm6 \
        curl \
        && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 in the Python image
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install cadquery (heavy step, ~200MB)
RUN pip install --no-cache-dir cadquery

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
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PYTHON_BIN=python3
ENV PYTHONPATH=/app/scripts
ENV GENERATOR_PATH=/app/scripts/generate_step.py
ENV WORK_DIR=/app/download
ENV TMP_DIR=/tmp/scaffold-step-gen

EXPOSE 3000

# Healthcheck using curl (lighter than node http)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:3000/ || exit 1

# Start the Next.js server
CMD ["node", "server.js"]
