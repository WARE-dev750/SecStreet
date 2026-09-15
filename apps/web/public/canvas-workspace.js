(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "secstreet.canvas.v1";

  const NODE_W = 180, NODE_H = 52;
  const GAP_X = 36, GAP_Y = 14, PAD = 22, PROJ_GAP = 80;

  const RED  = ["exploit","payload","c2","beacon","implant","shellcode","rat","backdoor","malware","rootkit","keylog","privesc","attack","offensive","redteam","red-team"];
  const BLUE = ["detect","siem","soc","log","auth","alert","hunt","forensic","yara","sigma","rule","incident","defensive","blueteam","blue-team"];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function categoryOf(path) {
    const lower = (path || "").toLowerCase();
    if (RED.some((k) => lower.includes(k))) return "red";
    if (BLUE.some((k) => lower.includes(k))) return "blue";
    return "purple";
  }
  function kindOf(name) {
    if (name.endsWith(".json")) return "json";
    if (name.endsWith(".md")) return "doc";
    if (/\.(js|mjs|cjs|ts|tsx|jsx|py|rs|go|c|cc|cpp|h|hpp|java|cs|rb|php|sh|bash|zsh|html|css)$/.test(name)) return "source";
    if (/\.(exe|dll|so|bin|o|a)$/.test(name)) return "binary";
    if (/\.(yaml|yml|toml|ini|env|cfg|conf)$/.test(name)) return "config";
    return "file";
  }

  const S = { projects: [], zoom: 1, panX: 60, panY: 60, selection: null, nodeEls: new Map() };

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        projects: S.projects.map((p) => ({ id: p.id, name: p.name, files: p.files })),
        zoom: S.zoom, panX: S.panX, panY: S.panY,
      }));
    } catch {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      S.projects = (data.projects || []).map((p) => ({ ...p, tree: null, layout: null, x: 0, y: 0 }));
      S.zoom = data.zoom ?? 1;
      S.panX = data.panX ?? 60;
      S.panY = data.panY ?? 60;
    } catch {}
  }

  function buildTree(files) {
    const root = { name: "root", path: "", type: "dir", children: [] };
    const byPath = new Map([["", root]]);
    const sorted = [...files].sort((a, b) => a.path.split("/").length - b.path.split("/").length);
    for (const f of sorted) {
      const parts = f.path.split("/").filter(Boolean);
      let parent = root, cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? cur + "/" + parts[i] : parts[i];
        let node = byPath.get(cur);
        if (!node) { node = { name: parts[i], path: cur, type: "dir", children: [] }; parent.children.push(node); byPath.set(cur, node); }
        parent = node;
      }
      const leaf = { name: parts[parts.length - 1], path: f.path, type: "file", content: f.content, size: f.size };
      parent.children.push(leaf);
      byPath.set(f.path, leaf);
    }
    function sortRec(n) {
      n.children.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));
      for (const c of n.children) if (c.type === "dir") sortRec(c);
    }
    sortRec(root);
    return root;
  }

  function layoutTree(root) {
    const positions = new Map();
    let y = PAD;
    function place(node, depth) {
      positions.set(node.path, { x: PAD + depth * (NODE_W + GAP_X), y });
      y += NODE_H + GAP_Y;
      if (node.type === "dir") for (const c of node.children) place(c, depth + 1);
    }
    for (const c of root.children) place(c, 1);
    let maxX = 0, maxY = 0;
    for (const p of positions.values()) { maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H); }
    return { positions, width: Math.max(maxX + PAD, 260), height: Math.max(maxY + PAD, 120) };
  }

  function renderAll() {
    const world = $("canvasWorld");
    world.innerHTML = "";
    S.nodeEls.clear();
    let projX = 0, projY = 0, rowH = 0;
    const MAX_ROW = 2600;
    for (const proj of S.projects) {
      if (!proj.layout) {
        proj.tree = buildTree(proj.files);
        proj.layout = layoutTree(proj.tree);
      }
      proj.x = projX; proj.y = projY;
      renderProject(proj);
      projX += proj.layout.width + PROJ_GAP;
      rowH = Math.max(rowH, proj.layout.height);
      if (projX > MAX_ROW) { projX = 0; projY += rowH + PROJ_GAP; rowH = 0; }
    }
    updateHud();
    applyTransform();
    $("canvasHint").style.display = S.projects.length ? "none" : "block";
    save();
  }

  function renderProject(proj) {
    const world = $("canvasWorld");
    const tile = document.createElement("div");
    tile.className = "canvas-project";
    tile.style.left = proj.x + "px";
    tile.style.top = proj.y + "px";
    tile.style.width = proj.layout.width + "px";
    tile.style.height = proj.layout.height + "px";
    tile.innerHTML =
      '<div class="project-label">' + esc(proj.name) + '</div>' +
      '<div class="project-sub">' + proj.files.length + ' file' + (proj.files.length === 1 ? '' : 's') + '</div>';
    world.appendChild(tile);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "project-edges");
    svg.setAttribute("width", proj.layout.width);
    svg.setAttribute("height", proj.layout.height);
    tile.appendChild(svg);

    function drawEdges(node) {
      const np = proj.layout.positions.get(node.path);
      if (!np) return;
      for (const c of node.children || []) {
        const cp = proj.layout.positions.get(c.path);
        if (!cp) continue;
        const x1 = np.x + NODE_W, y1 = np.y + NODE_H / 2;
        const x2 = cp.x, y2 = cp.y + NODE_H / 2;
        const dx = Math.max(20, Math.abs(x2 - x1) * 0.5);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "rgba(255,255,255,0.08)");
        path.setAttribute("stroke-width", "1");
        svg.appendChild(path);
        if (c.type === "dir") drawEdges(c);
      }
    }
    for (const c of proj.tree.children) drawEdges(c);

    function renderNode(node) {
      const np = proj.layout.positions.get(node.path);
      if (!np) return;
      const el = document.createElement("div");
      el.className = "cnv-node kind-" + (node.type === "dir" ? "dir" : kindOf(node.name)) + " cat-" + categoryOf(node.path || node.name);
      el.style.left = np.x + "px";
      el.style.top = np.y + "px";
      el.style.width = NODE_W + "px";
      el.dataset.project = proj.id;
      el.dataset.path = node.path;
      const ext = node.type === "file" && node.name.lastIndexOf(".") > 0 ? node.name.slice(node.name.lastIndexOf(".")) : "";
      const base = ext ? node.name.slice(0, node.name.length - ext.length) : node.name;
      el.innerHTML =
        '<div class="cnv-name">' + esc(base) + (ext ? '<span class="cnv-ext">' + esc(ext) + '</span>' : '') + '</div>' +
        '<div class="cnv-sub">' + (node.type === "dir" ? "folder" : kindOf(node.name)) + '</div>';
      el.addEventListener("click", (e) => { e.stopPropagation(); selectNode(proj, node); });
      tile.appendChild(el);
      S.nodeEls.set(proj.id + "::" + node.path, el);
      for (const c of node.children || []) renderNode(c);
    }
    for (const c of proj.tree.children) renderNode(c);
  }

  function updateHud() {
    let total = 0;
    for (const p of S.projects) total += p.files.length;
    $("hudProjects").textContent = S.projects.length + " project" + (S.projects.length === 1 ? "" : "s");
    $("hudNodes").textContent = total + " file" + (total === 1 ? "" : "s");
    $("hudZoom").textContent = Math.round(S.zoom * 100) + "%";
  }
  function applyTransform() {
    $("canvasWorld").style.transform = "translate(" + S.panX + "px," + S.panY + "px) scale(" + S.zoom + ")";
  }

  function attachPanZoom() {
    const surface = $("canvasSurface");
    let panning = false, sx = 0, sy = 0, opx = 0, opy = 0;
    surface.addEventListener("mousedown", (e) => {
      if (e.target.closest(".cnv-node") || e.target.closest(".canvas-project")) return;
      panning = true; sx = e.clientX; sy = e.clientY; opx = S.panX; opy = S.panY;
      surface.classList.add("panning");
    });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      S.panX = opx + (e.clientX - sx);
      S.panY = opy + (e.clientY - sy);
      applyTransform();
    });
    window.addEventListener("mouseup", () => { if (panning) { panning = false; surface.classList.remove("panning"); save(); } });
    surface.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = surface.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const oz = S.zoom;
      const nz = Math.max(0.15, Math.min(3, oz * (e.deltaY < 0 ? 1.12 : 1/1.12)));
      S.panX = mx - (mx - S.panX) * (nz / oz);
      S.panY = my - (my - S.panY) * (nz / oz);
      S.zoom = nz;
      applyTransform(); updateHud(); save();
    }, { passive: false });
  }

  function fitAll() {
    if (!S.projects.length) return;
    const rect = $("canvasSurface").getBoundingClientRect();
    let maxX = 0, maxY = 0;
    for (const p of S.projects) { maxX = Math.max(maxX, p.x + p.layout.width); maxY = Math.max(maxY, p.y + p.layout.height); }
    const z = Math.min((rect.width - 80) / maxX, (rect.height - 80) / maxY, 1.2);
    S.zoom = Math.max(0.15, z);
    S.panX = (rect.width - maxX * S.zoom) / 2;
    S.panY = (rect.height - maxY * S.zoom) / 2;
    applyTransform(); updateHud(); save();
  }

  function selectNode(proj, node) {
    S.selection = { projId: proj.id, path: node.path, node };
    for (const [k, el] of S.nodeEls.entries()) el.classList.toggle("selected", k === proj.id + "::" + node.path);
    openDrawer(node);
  }

  function openDrawer(node) {
    $("drawer").classList.add("open");
    $("drawerPath").textContent = node.path || node.name;
    const cat = categoryOf(node.path || node.name);
    const meta = [
      '<span class="meta-chip">' + (node.type === "dir" ? "folder" : kindOf(node.name)) + '</span>',
      '<span class="meta-chip cat-' + cat + '">' + cat + '</span>',
    ];
    if (node.size != null) meta.push('<span class="meta-chip">' + node.size + ' bytes</span>');
    if (node.type === "dir") meta.push('<span class="meta-chip">' + (node.children ? node.children.length : 0) + ' items</span>');
    $("drawerMeta").innerHTML = meta.join("");
    const body = $("drawerBody");
    if (node.type === "file" && typeof node.content === "string") {
      body.innerHTML = '<pre class="drawer-code">' + esc(node.content) + '</pre>';
    } else if (node.type === "dir") {
      body.innerHTML = '<div class="drawer-empty">Folder. Click a file to view its contents.</div>';
    } else {
      body.innerHTML = '<div class="drawer-empty">No preview.</div>';
    }
    $("aiOutput").textContent = "";
    $("aiInput").value = "";
  }

  function closeDrawer() {
    $("drawer").classList.remove("open");
    S.selection = null;
    for (const el of S.nodeEls.values()) el.classList.remove("selected");
  }

  async function askAI(prompt) {
    const out = $("aiOutput");
    out.textContent = "…";
    const node = S.selection && S.selection.node;
    const context = node && node.type === "file" ? node.content : undefined;
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, context }),
      });
      const data = await r.json();
      out.textContent = data.ok ? data.answer : (data.error || "AI unavailable");
    } catch (err) {
      out.textContent = "AI unavailable (no server): " + err.message;
    }
  }

  async function readEntry(entry, base) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      const content = await file.text();
      return [{ path: (base ? base + "/" : "") + entry.name, content, size: file.size }];
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      while (true) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        all.push(...batch);
      }
      const out = [];
      for (const child of all) out.push(...await readEntry(child, (base ? base + "/" : "") + entry.name));
      return out;
    }
    return [];
  }

  async function processEntries(entries) {
    for (const en of entries) {
      const files = await readEntry(en, "");
      if (!files.length) continue;
      const id = "p" + Math.random().toString(36).slice(2, 10);
      S.projects.push({ id, name: en.name, files, tree: null, layout: null, x: 0, y: 0 });
    }
    renderAll();
    setTimeout(fitAll, 60);
  }

  function handleDrop(e) {
    e.preventDefault();
    $("dropzone").classList.remove("active");
    const items = e.dataTransfer && e.dataTransfer.items;
    if (!items || !items.length) return;
    const entries = [];
    for (const it of items) {
      const en = it.webkitGetAsEntry && it.webkitGetAsEntry();
      if (en) entries.push(en);
    }
    if (entries.length) processEntries(entries);
  }

  function boot() {
    load();
    renderAll();
    attachPanZoom();
    $("drawerClose").addEventListener("click", closeDrawer);
    $("aiAsk").addEventListener("click", () => { const v = $("aiInput").value.trim(); if (v) askAI(v); });
    $("aiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = $("aiInput").value.trim(); if (v) askAI(v); } });
    $("aiExplain").addEventListener("click", () => askAI("Explain what this file does in one short paragraph. Then list its main functions, exports, or entry points."));
    $("hudZoomIn").addEventListener("click", () => { S.zoom = Math.min(3, S.zoom * 1.2); applyTransform(); updateHud(); save(); });
    $("hudZoomOut").addEventListener("click", () => { S.zoom = Math.max(0.15, S.zoom / 1.2); applyTransform(); updateHud(); save(); });
    $("hudFit").addEventListener("click", fitAll);
    $("hudClear").addEventListener("click", () => {
      if (!confirm("Remove all projects from the canvas?")) return;
      S.projects = [];
      closeDrawer();
      renderAll();
    });
    document.addEventListener("dragover", (e) => { e.preventDefault(); $("dropzone").classList.add("active"); });
    document.addEventListener("dragleave", (e) => { if (e.relatedTarget === null) $("dropzone").classList.remove("active"); });
    document.addEventListener("drop", handleDrop);
  }

  boot();
})();
