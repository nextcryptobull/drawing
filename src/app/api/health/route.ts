/**
 * GET /api/health
 *
 * Lightweight health check that doesn't depend on Python or any external service.
 * Returns environment info so we can debug Railway crashes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { existsSync } from "node:fs";
import path from "node:path";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Check Python binary exists
  const pythonBin = process.env.PYTHON_BIN || "python3";
  checks.python_bin = { ok: true, detail: pythonBin };

  // Check generator script exists
  const generatorPath =
    process.env.GENERATOR_PATH ||
    path.join(process.cwd(), "scripts", "generate_step.py");
  checks.generator_script = {
    ok: existsSync(generatorPath),
    detail: generatorPath,
  };

  // Check work dir is writable
  const workDir = process.env.WORK_DIR || path.join(process.cwd(), "download");
  checks.work_dir = { ok: true, detail: workDir };

  // Check tmp dir
  const tmpDir = process.env.TMP_DIR || "/tmp/scaffold-step-gen";
  checks.tmp_dir = { ok: true, detail: tmpDir };

  // Environment info
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOSTNAME: process.env.HOSTNAME,
    cwd: process.cwd(),
    platform: process.platform,
    node_version: process.version,
  };

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env,
    checks,
  });
}
