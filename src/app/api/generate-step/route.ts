/**
 * POST /api/generate-step
 *
 * Body: a PartConfig JSON object (caster | rosette | standard).
 *
 * Spawns the Python cadquery generator (`scripts/generate_step.py`) as a
 * subprocess, waits for it to finish, then streams the generated STEP file
 * back to the client as an attachment.
 *
 * The Python script prints a single JSON status line to stdout:
 *   {"status": "ok", "step_path": "...", "warnings": [...]}
 *   {"status": "error", "message": "..."}
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Python binary + script paths — env-var override for Docker/production,
// falls back to sandbox paths for local dev.
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const GENERATOR = process.env.GENERATOR_PATH || path.join(process.cwd(), "scripts", "generate_step.py");
const WORK_DIR = process.env.WORK_DIR || path.join(process.cwd(), "download");
const TMP_DIR = process.env.TMP_DIR || "/tmp/scaffold-step-gen";

/** Pretty filename for the downloaded STEP file. */
function buildFileName(body: unknown): string {
  const cfg = body as { type?: string; wheel_od?: number; disc_od?: number; tube_length?: number };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  switch (cfg?.type) {
    case "caster":
      return `caster_od${Math.round(cfg.wheel_od ?? 0)}_${stamp}.step`;
    case "rosette":
      return `rosette_od${Math.round(cfg.disc_od ?? 0)}_${stamp}.step`;
    case "standard":
      return `standard_${Math.round((cfg.tube_length ?? 0) / 1000)}m_${stamp}.step`;
    default:
      return `part_${stamp}.step`;
  }
}

interface GenResult {
  status: "ok" | "error";
  step_path?: string;
  message?: string;
  warnings?: string[];
  size_kb?: number;
}

/** Spawn the Python generator and resolve with the parsed JSON status line. */
function runGenerator(configPath: string, outputPath: string): Promise<GenResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [
      GENERATOR,
      "--config",
      configPath,
      "--output",
      outputPath,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      // The Python script always emits a single JSON line on stdout,
      // regardless of success/failure. Try to parse it.
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      let parsed: GenResult | null = null;
      try {
        parsed = JSON.parse(last) as GenResult;
      } catch {
        // ignore — handled below
      }
      if (!parsed) {
        reject(
          new Error(
            `Generator emitted no JSON. Exit code ${code}. stderr: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolve(parsed);
    });
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const cfg = body as { type?: string };
  if (!cfg?.type || !["caster", "rosette", "standard", "tower"].includes(cfg.type)) {
    return NextResponse.json(
      { error: `Unknown part type: ${cfg?.type ?? "(none)"}` },
      { status: 400 },
    );
  }

  // Ensure work + tmp dirs exist
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  // Materialise config + output paths
  const id = randomUUID();
  const configPath = path.join(TMP_DIR, `${id}.json`);
  const outputPath = path.join(WORK_DIR, `${id}.step`);

  await fs.writeFile(configPath, JSON.stringify(body, null, 2), "utf8");

  let result: GenResult;
  try {
    result = await runGenerator(configPath, outputPath);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to spawn Python generator: ${(err as Error).message}` },
      { status: 500 },
    );
  } finally {
    // Clean up the temp config JSON (don't await — best effort)
    void fs.rm(configPath, { force: true });
  }

  if (result.status !== "ok" || !result.step_path) {
    return NextResponse.json(
      {
        error: result.message ?? "Python generator returned an error",
        warnings: result.warnings ?? [],
      },
      { status: 500 },
    );
  }

  // Stream the STEP file back to the client as an attachment.
  try {
    const fileBuffer = await fs.readFile(result.step_path);
    const fileName = buildFileName(body);

    // Best-effort cleanup of the STEP file (don't await).
    void fs.rm(result.step_path, { force: true });

    const etag = `"${createHash("sha1").update(fileBuffer).digest("hex").slice(0, 16)}"`;
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/step; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(fileBuffer.byteLength),
        "Cache-Control": "no-store",
        ETag: etag,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read STEP output: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

/** Simple GET health probe. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    python: PYTHON_BIN,
    generator: GENERATOR,
    work_dir: WORK_DIR,
  });
}
