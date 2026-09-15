// files.js — load project tree, classify files. No DOM.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Files = (function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const extOf = (n) => {
    const i = n.lastIndexOf(".");
    return i === -1 ? "" : n.slice(i).toLowerCase();
  };

  function classify(name, path) {
    const ext = extOf(name);
    const lower = name.toLowerCase();
    if (lower === "capability.json") return "capability";
    if (path.startsWith("workflows/") && ext === ".json") return "workflow";
    if (path.startsWith("tests/") || lower.endsWith(".test.ts") || lower.endsWith(".test.js")) return "test";
    if (ext === ".md" || ext === ".mdx" || ext === ".txt") return "doc";
    if (["package.json","tsconfig.json","wrangler.toml","docker-compose.yml",".gitignore",".env",".env.example"].includes(lower)) return "config";
    if ([".toml",".ini",".yaml",".yml"].includes(ext)) return "config";
    if ([".csv",".log",".ndjson"].includes(ext)) return "data";
    if (ext === ".json") return "data";
    if ([".exe",".dll",".so",".bin",".o",".a"].includes(ext)) return "binary";
    if ([".js",".mjs",".cjs",".ts",".tsx",".jsx",".py",".rs",".go",".c",".cc",".cpp",".h",".hpp",".java",".cs",".rb",".php",".sh",".bash",".zsh",".html",".css"].includes(ext)) return "source";
    return "unknown";
  }

  function subFor(name, path, content, category) {
    const ext = extOf(name);
    if (category === "capability") {
      try { const m = JSON.parse(content); return [m.language, m.trust].filter(Boolean).join(" \u00b7 ") || "manifest"; }
      catch { return "manifest"; }
    }
    if (category === "workflow") {
      try { const w = JSON.parse(content); const n = Array.isArray(w.steps) ? w.steps.length : 0; return n + " step" + (n === 1 ? "" : "s"); }
      catch { return "workflow"; }
    }
    if (category === "source") return content.split("\n").length + " lines";
    if (category === "config") return ext.replace(".", "") || "config";
    if (category === "doc") return content.trim().split(/\s+/).length + " words";
    return ext.replace(".", "") || "file";
  }

  async function loadAll() {
    const r = await fetch("/api/files");
    const data = await r.json();
    const out = [];
    (function walk(nodes, parent) {
      for (const n of nodes || []) {
        if (n.type === "dir") { out.push({ path: n.path, name: n.name, dir: true, parent }); walk(n.children, n.path); }
        else out.push({ path: n.path, name: n.name, dir: false, parent });
      }
    })(data.tree, "");
    const files = out.filter((x) => !x.dir).slice(0, 250);
    let idx = 0;
    await Promise.all(Array.from({ length: 20 }, async () => {
      while (idx < files.length) {
        const f = files[idx++];
        try {
          const r = await fetch("/api/file?path=" + encodeURIComponent(f.path));
          if (r.ok) { const d = await r.json(); f.content = d.content || ""; }
        } catch {}
      }
    }));
    for (const n of out) {
      if (n.dir) { n.category = "folder"; n.sub = ""; }
      else { n.category = classify(n.name, n.path); n.sub = subFor(n.name, n.path, n.content || "", n.category); }
    }
    return out;
  }

  async function loadProject() {
    try {
      const r = await fetch("/api/project");
      if (r.ok) return await r.json();
    } catch {}
    return { name: "workspace" };
  }

  return { esc, extOf, classify, subFor, loadAll, loadProject };
})();
