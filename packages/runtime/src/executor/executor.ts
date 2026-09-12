import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";
import {
  interpreterFor,
  DEFAULT_POLICY,
  type CapabilityRunResult,
  type CapabilityManifest,
  type Policy,
} from "@secstreet/contracts";
import { evaluatePolicy } from "../policy/evaluate.js";

export interface RunOptions {
  capabilityDir: string;
  manifest: CapabilityManifest;
  input: unknown;
  timeoutMs?: number;
  policy?: Policy;
}

export async function runCapability(opts: RunOptions): Promise<CapabilityRunResult> {
  const { capabilityDir, manifest, input, policy = DEFAULT_POLICY } = opts;

  const decision = evaluatePolicy(manifest, policy);
  if (!decision.allowed) {
    return {
      ok: false,
      stdout: "",
      stderr: "policy denied: " + decision.reason,
      exitCode: 3,
      durationMs: 0,
      deniedByPolicy: { reason: decision.reason ?? "denied", disallowed: decision.disallowed },
    };
  }

  const exec = manifest.execution ?? {};
  const timeoutMs = opts.timeoutMs ?? exec.timeoutMs ?? 15000;
  const cwd = exec.cwd ? join(capabilityDir, exec.cwd) : capabilityDir;
  const env = { ...process.env, ...(exec.env ?? {}) };

  const entry = isAbsolute(manifest.entrypoint)
    ? manifest.entrypoint
    : join(capabilityDir, manifest.entrypoint);
  const started = Date.now();
  const spec = interpreterFor(manifest.language);
  const command = manifest.language === "binary" ? entry : spec.command;
  const args = manifest.language === "binary" ? spec.args : [...spec.args, entry];

  return new Promise<CapabilityRunResult>((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let finished = false;
    const timer = setTimeout(() => {
      if (finished) return; finished = true; child.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: stderr + "\n[timeout after " + timeoutMs + "ms]", exitCode: -1, durationMs: Date.now() - started });
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (finished) return; finished = true; clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: String(err), exitCode: -1, durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      if (finished) return; finished = true; clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, exitCode: code ?? -1, durationMs: Date.now() - started });
    });
    child.stdin.write(JSON.stringify(input ?? {}));
    child.stdin.end();
  });
}
