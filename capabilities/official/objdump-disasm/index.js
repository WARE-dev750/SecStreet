#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const SECTION_RE = /^Disassembly of section (\S+):/;
const INSTRUCTION_RE = /^\s*[0-9a-fA-F]+:\s+(?:[0-9a-fA-F]{2}\s+)+\s*([a-z][a-z0-9.]*)\s/;

function parseDisasm(text) {
  const out = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const sm = SECTION_RE.exec(line);
    if (sm) {
      current = { name: sm[1], instructionCount: 0, mnemonics: [] };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const im = INSTRUCTION_RE.exec(line);
    if (!im) continue;
    current.instructionCount += 1;
    current.mnemonics.push(im[1]);
  }
  return out;
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path, section } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      if (section !== undefined && (typeof section !== "string" || section.startsWith("-"))) {
        throw new Error("input.section must be a non-empty string not starting with '-'");
      }

      const args = section ? ["-d", "-j", section, "--", path] : ["-d", "--", path];
      const r = spawnSync("objdump", args, { encoding: "utf8", timeout: 25000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) throw new Error("objdump failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("objdump exit " + r.status + (err ? ": " + err : ""));
      }

      const sections = parseDisasm(r.stdout);
      if (sections.length === 0) throw new Error("no disassembly found (not an executable ELF file?)");

      process.stdout.write(JSON.stringify({ path, sections }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
