#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// openssl x509 -text -noout output has a stable two-space-indented shape.
// We pull out the handful of fields a security analyst actually cares about.
function parse(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^\s*Version:\s+(.+)$/))) out.version = m[1].trim();
    else if ((m = line.match(/^\s*Serial Number:\s*$/))) {
      // serial continues on next lines until non-hex line
      const parts = [];
      for (let j = i + 1; j < lines.length; j++) {
        const hex = lines[j].match(/^\s*([0-9a-f:]+)\s*$/i);
        if (!hex) break;
        parts.push(hex[1]);
      }
      out.serial = parts.join(":").replace(/:/g, "").trim();
    }
    else if ((m = line.match(/^\s*Signature Algorithm:\s*(.+)$/))) out.signatureAlgorithm = m[1].trim();
    else if ((m = line.match(/^\s*Issuer:\s*(.+)$/))) out.issuer = m[1].trim();
    else if ((m = line.match(/^\s*Not Before:\s*(.+)$/))) out.notBefore = m[1].trim();
    else if ((m = line.match(/^\s*Not After\s*:\s*(.+)$/))) out.notAfter = m[1].trim();
    else if ((m = line.match(/^\s*Subject:\s*(.+)$/))) out.subject = m[1].trim();
    else if ((m = line.match(/^\s*Public Key Algorithm:\s*(.+)$/))) out.publicKeyAlgorithm = m[1].trim();
    else if ((m = line.match(/^\s*Public-Key:\s*\((\d+)\s*bit\)/))) out.publicKeyBits = m[1];
    else if ((m = line.match(/^\s*CA:(\w+)/))) out.isCA = m[1].toUpperCase() === "TRUE";
  }
  return out;
}

function parseSubjectAltNames(text) {
  // Example line: "X509v3 Subject Alternative Name:" followed by "DNS:a.com, DNS:b.com"
  const lines = text.split(/\r?\n/);
  const sans = [];
  for (let i = 0; i < lines.length; i++) {
    if (/X509v3 Subject Alternative Name:/.test(lines[i])) {
      const next = lines[i + 1] || "";
      for (const piece of next.split(/,\s*/)) {
        const p = piece.trim();
        if (!p) continue;
        const idx = p.indexOf(":");
        sans.push(idx >= 0 ? p.slice(idx + 1) : p);
      }
    }
  }
  return sans;
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");

      const r = spawnSync("openssl", ["x509", "-in", path, "-noout", "-text"], {
        encoding: "utf8", timeout: 4000
      });
      if (r.error) throw new Error("openssl failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("openssl exit " + r.status + (err ? ": " + err : ""));
      }

      const parsed = parse(r.stdout);
      const sans = parseSubjectAltNames(r.stdout);

      if (!parsed.subject || !parsed.issuer) {
        throw new Error("no certificate fields found (not a certificate?)");
      }

      process.stdout.write(JSON.stringify({
        path,
        version: parsed.version ?? "",
        serial: parsed.serial ?? "",
        signatureAlgorithm: parsed.signatureAlgorithm ?? "",
        issuer: parsed.issuer,
        notBefore: parsed.notBefore ?? "",
        notAfter: parsed.notAfter ?? "",
        subject: parsed.subject,
        publicKeyAlgorithm: parsed.publicKeyAlgorithm ?? "",
        publicKeyBits: parsed.publicKeyBits ?? "",
        subjectAltNames: sans,
        isCA: parsed.isCA === true,
        raw: r.stdout.trim()
      }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
