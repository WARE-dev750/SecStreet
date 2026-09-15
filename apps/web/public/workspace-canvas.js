(function () {
  const NODE_W = 200, NODE_H = 62, GAP_X = 32, GAP_Y = 18;
  let S = null;

  const KIND = {
    capability:"capability", workflow:"workflow", source:"source",
    config:"config", data:"data", binary:"binary", doc:"doc",
    test:"test", folder:"folder", unknown:"unknown"
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const extOf = (n) => { const i = n.lastIndexOf("."); return i === -1 ? "" : n.slice(i).toLowerCase(); };

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
      try { const m = JSON.parse(content); return [m.language, m.trust, (m.permissions||[]).join(",")].filter(Boolean).join(" · ") || "manifest"; }
      catch { return "manifest"; }
    }
    if (category === "workflow") {
      try { const w = JSON.parse(content); const n = Array.isArray(w.steps) ? w.steps.length : 0; return n + " step" + (n === 1 ? "" : "s"); }
      catch { return "workflow"; }
    }
    if (category === "source") {
      const lines = content.split("\n").length;
      const skills = [];
      if (/spawn|child_process|subprocess/.test(content)) skills.push("shells out");
      if (/fetch\(|requests\.|http\./.test(content)) skills.push("network");
      if (/readFile|open\(/.test(content)) skills.push("file I/O");
      if (/JSON\.parse|json\.loads/.test(content)) skills.push("parses json");
      if (/regex|\.match\(/.test(content)) skills.push("regex");
      return lines + " lines" + (skills.length ? " · " + skills.slice(0,2).join(", ") : "");
    }
    if (category === "config") return ext.replace(".", "") || "config";
    if (category === "doc") { const w = content.trim().split(/\s+/).length; return w + " words"; }
    return ext.replace(".", "") || "file";
  }

  async function loadAll() {
    const r = await fetch("/api/files");
    const data = await r.json();
    const out = [];
    (function walk(nodes, parent) {
      for (const n of nodes || []) {
        if (n.type === "dir") { out.push({ path:n.path, name:n.name, dir:true, parent }); walk(n.children, n.path); }
        else out.push({ path:n.path, name:n.name, dir:false, parent });
      }
    })(data.tree, "");
    const files = out.filter((x) => !x.dir).slice(0, 250);
    let idx = 0;
    await Promise.all(Array.from({ length: 20 }, async () => {
      while (idx < files.length) {
        const f = files[idx++];
        try { const r = await fetch("/api/file?path=" + encodeURIComponent(f.path)); if (r.ok) { const d = await r.json(); f.content = d.content || ""; } } catch {}
      }
    }));
    for (const n of out) {
      if (n.dir) { n.category = "folder"; n.sub = ""; }
      else { n.category = classify(n.name, n.path); n.sub = subFor(n.name, n.path, n.content || "", n.category); }
    }
    return out;
  }

  function layoutTree(nodes) {
    const byParent = new Map();
    for (const n of nodes) { const p = n.parent || ""; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(n); }
    const pos = new Map();
    let y = 24;
    (function place(parent, depth) {
      for (const c of byParent.get(parent) || []) {
        pos.set(c.path, { x: 24 + depth * (NODE_W + GAP_X), y });
        y += NODE_H + GAP_Y;
        if (c.dir) place(c.path, depth + 1);
      }
    })("", 0);
    return pos;
  }

  function redrawEdges(svg, nodes, pos) {
    svg.innerHTML = "";
    for (const n of nodes) {
      if (!n.parent) continue;
      const p = pos.get(n.parent), c = pos.get(n.path);
      if (!p || !c) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const x1 = p.x + NODE_W, y1 = p.y + NODE_H/2;
      const x2 = c.x, y2 = c.y + NODE_H/2;
      const dx = Math.max(20, Math.abs(x2-x1)*0.5);
      path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1+dx) + " " + y1 + ", " + (x2-dx) + " " + y2 + ", " + x2 + " " + y2);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(0,0,0,0.10)");
      path.setAttribute("stroke-width", "1.2");
      svg.appendChild(path);
    }
  }

  function render(nodes, pos, host) {
    const wrap = document.createElement("div");
    wrap.className = "wcv-wrap";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "wcv-edges");
    const stage = document.createElement("div");
    stage.className = "wcv-nodes";
    wrap.appendChild(svg); wrap.appendChild(stage); host.appendChild(wrap);

    let mx=0, my=0;
    for (const p of pos.values()) { mx = Math.max(mx, p.x+NODE_W+40); my = Math.max(my, p.y+NODE_H+40); }
    stage.style.width = mx+"px"; stage.style.height = my+"px";
    svg.setAttribute("viewBox", "0 0 "+mx+" "+my);
    svg.setAttribute("width", mx); svg.setAttribute("height", my);
    redrawEdges(svg, nodes, pos);

    for (const n of nodes) {
      const p = pos.get(n.path); if (!p) continue;
      const el = document.createElement("div");
      el.className = "wcv-node k-" + (n.category || "unknown");
      el.style.left = p.x+"px"; el.style.top = p.y+"px"; el.style.width = NODE_W+"px";
      let nameHtml;
      if (n.dir) nameHtml = esc(n.name) + "/";
      else {
        const ext = extOf(n.name);
        if (ext) { const base = n.name.slice(0, n.name.length - ext.length); nameHtml = esc(base) + '<span class="ext">' + esc(ext) + "</span>"; }
        else nameHtml = esc(n.name);
      }
      el.innerHTML = '<div class="wcv-name">' + nameHtml + '</div>' +
        '<div class="wcv-sub"><span class="wcv-badge k-' + n.category + '">' + (KIND[n.category] || "unknown") + '</span>' +
        (n.sub ? '<span class="wcv-meta">' + esc(n.sub) + '</span>' : '') + '</div>';
      el.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        const s = pos.get(n.path); if (!s) return;
        const sx = ev.clientX, sy = ev.clientY, ox = s.x, oy = s.y;
        el.classList.add("dragging");
        const onMove = (e) => {
          s.x = Math.max(0, ox + e.clientX - sx);
          s.y = Math.max(0, oy + e.clientY - sy);
          el.style.left = s.x+"px"; el.style.top = s.y+"px";
          redrawEdges(svg, nodes, pos);
        };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); el.classList.remove("dragging"); };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
        ev.preventDefault();
      });
      stage.appendChild(el);
    }
  }

  async function mount(host) {
    host.innerHTML = '<div class="wcv-loading">loading workspace…</div>';
    const nodes = await loadAll();
    const pos = layoutTree(nodes);
    host.innerHTML = "";
    render(nodes, pos, host);
  }
  function unmount() { S = null; }
  window.WorkspaceCanvas = { mount, unmount };
})();
