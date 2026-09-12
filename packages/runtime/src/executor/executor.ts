import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { interpreterFor, type CapabilityRunResult, type CapabilityManifest } from "@secstreet/contracts";

export interface RunOptions {
  capabilityDir: string;
  manifest: CapabilityManifest;
  input: unknown;
  timeoutMs?: number;
}

export async function runCapability(opts: RunOptions): Promise<CapabilityRunResult> {
  const { capabilityDir, manifest, input, timeoutMs = 15000 } = opts;
  const entryPath = isAbsolute(manifest.entrypoint)
    ? manifest.entrypoint
    : join(capabilityDir, manifest.entrypoint);
  const started = Date.now();

  const spec = interpreterFor(manifest.language);
  const command = manifest.language === "binary" ? entryPath : spec.command;
  const args = manifest.language === "binary" ? spec.args : [...spec.args, entryPath];

  return new Promise<CapabilityRunResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: capabilityDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr + "\n[timeout]", exitCode: -1, durationMs: Date.now() - started });
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: String(err), exitCode: -1, durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, exitCode: code ?? -1, durationMs: Date.now() - started });
    });

    child.stdin.write(JSON.stringify(input ?? {}));
    child.stdin.end();
  });
}
