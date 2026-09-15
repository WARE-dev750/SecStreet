(function () {
  const NODE_W = 220, NODE_H = 54;
  const GAP_X = 60, GAP_Y = 14, PAD = 40;
  const SVG_OFF = 20000;
  const SVG_W = 50000;

  let S = null;

  const KIND = {
    capability:"capability", workflow:"workflow", source:"source",
    config:"config", data:"data", binary:"binary", doc:"doc",
    test:"test", folder:"folder", unknown:"unknown"
  };

  // ---- Skill vocabulary ----
  // Each rule: a display name + keywords scored against filename, path, and
  // file content (first 4KB). Highest-scoring rule wins. Tune freely.
  const SKILL_RULES = [
    { skill: "PE Parsing",            keys: ["pe_", "pe-", "peheader", "pe-header", "pefile", "portable-executable", "coff", "dos_header", ".exe", ".dll"] },
    { skill: "ELF Parsing",           keys: ["elf_", "elf-", "elfheader", "elf-header", "readelf"] },
    { skill: "Mach-O Parsing",        keys: ["macho", "mach-o", "mach_o", "otool"] },
    { skill: "Disassembly",           keys: ["disasm", "objdump", "disassemble", "capstone", "mnemonic"] },
    { skill: "Hex / Binary Dump",     keys: ["hexdump", "xxd", "hex_", "binary", "binutils"] },
    { skill: "Strings / Extraction",  keys: ["strings-", "strings_", "extract", "extractstr"] },
    { skill: "Cryptography",          keys: ["crypto", "cipher", "aes", "rsa", "sha1", "sha256", "sha512", "md5", "hmac", "openssl", "x509", "certificate", "cert.pem"] },
    { skill: "Network",               keys: ["socket", "tcp", "udp", "dns", "tls", "ssl", "packet", "pcap", "capture", "net_", "network", "port"] },
    { skill: "Authentication",        keys: ["auth", "login", "logon", "credential", "passwd", "password", "session", "jwt", "token"] },
    { skill: "Log Parsing",           keys: ["syslog", "auditlog", "auth-log", "journal", "logparse", "parse-auth", "log-parser"] },
    { skill: "Detection & Rules",     keys: ["detect", "yara", "sigma", "ioc", "alert", "threat", "rule_", "/rules/", "indicator"] },
    { skill: "Process & System",      keys: ["process", "proc_", "uname", "kernel", "sysinfo", "ps_", "system"] },
    { skill: "Filesystem",            keys: ["filesystem", "fs_", "disk", "mount", "file_", "file-", "identify-file"] },
    { skill: "Hashing",               keys: ["hash", "digest", "sha256sum", "hash-file"] },
    { skill: "Workflow",              keys: ["workflow", "pipeline", "chain", "compose", "orchestrat", "steps"] },
    { skill: "Configuration",         keys: ["capability.json", "package.json", "tsconfig", "config", "wrangler", ".env", ".yaml", ".yml", ".toml", ".gitignore"] },
    { skill: "Documentation",         keys: ["readme", ".md", "/docs/", "/doc/"] },
    { skill: "Tests",                 keys: [".test.", ".spec.", "/tests/", "test_"] },
    { skill: "Build & Tooling",       keys: ["makefile", "cmake", "dockerfile", "deploy", "build.", "scripts/"] },
  ];

  function classifySkill(file) {
    if (file.dir) return null;
    const name = (file.name || "").toLowerCase();
    const pathLower = (file.path || "").toLowerCase();
    const contentLower = file.content ? file.content.slice(0, 4000).toLowerCase() : "";
    let best = null, bestScore = 0;
    for (const rule of SKILL_RULES) {
      let score = 0;
      for (const key of rule.keys) {
        if (name.includes(key)) score += 10;
        else if (pathLower.includes(key)) score += 5;
        if (contentLower && contentLower.includes(key)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = rule.skill; }
    }
    return bestScore > 0 ? best : "Other";
  }

  function dominantCategory(files) {
    let red = 0, blue = 0, purple = 0;
    for (const f of files) {
      const hay = ((f.name || "") + " " + (f.path || "")).toLowerCase();
      if (/exploit|payload|c2|beacon|implant|shellcode|malware|backdoor|rootkit|red|offensive/.test(hay)) red++;
      else if (/detect|siem|soc|yara|sigma|alert|hunt|forensic|blue|defensive/.test(hay)) blue++;
      else purple++;
    }
    if (red > blue && red > purple) return "red";
    if (blue >= red && blue >= purple) return "blue";
    return "purple";
  }

  // Turn the flat file list into a skill-grouped list.
  // Skill folders are synthetic nodes with path "#skill:<name>".
  function transformToSkillView(files) {
    const buckets = new Map();
    for (const f of files) {
      if (f.dir) continue;
      const skill = classifySkill(f);
      if (!buckets.has(skill)) buckets.set(skill, []);
      buckets.get(skill).push(f);
    }
    const out = [];
    const names = [...buckets.keys()].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    for (const skill of names) {
      const group = buckets.get(skill);
      const skillPath = "#skill:" + skill;
      out.push({
        path: skillPath,
        name: skill,
        dir: true,
        parent: "",
        category: "skill",
        catClass: dominantCategory(group),
        sub: group.length + " file" + (group.length === 1 ? "" : "s"),
        isSkill: true,
      });
      for (const f of group) out.push({ ...f, parent: skillPath });
    }
    return out;
  }

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
      try { const m = JSON.parse(content); return [m.language, m.trust].filter(Boolean).join(" · ") || "manifest"; }
      catch { return "manifest"; }
    }
    if (category === "workflow") {
      try { const w = JSON.parse(content); const n = Array.isArray(w.steps) ? w.steps.length : 0; return n + " step" + (n === 1 ? "" : "s"); }
      catch { return "workflow"; }
    }
    if (category === "source") {
      const lines = content.split("\n").length;
      return lines + " lines";
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

  async function loadProject() {
    try {
      const r = await fetch("/api/project");
      if (r.ok) return await r.json();
    } catch {}
    return { name: "workspace" };
  }

  // ---- Layout ----
  // Recursive: a folder's height = sum of its children heights + gaps.
  // Collapsed folders have only NODE_H height regardless of contents.
  function buildLayout(nodes, collapsed) {
    const byParent = new Map();
    for (const n of nodes) {
      const p = n.parent || "";
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(n);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)));
    }

    function childrenOf(path) {
      if (collapsed.has(path)) return [];
      return byParent.get(path) || [];
    }

    const heightCache = new Map();
    function height(path) {
      if (heightCache.has(path)) return heightCache.get(path);
      const kids = childrenOf(path);
      if (kids.length === 0) { heightCache.set(path, NODE_H); return NODE_H; }
      let total = 0;
      for (const c of kids) total += height(c.path) + GAP_Y;
      total -= GAP_Y;
      const h = Math.max(NODE_H, total);
      heightCache.set(path, h);
      return h;
    }

    const pos = new Map();
    function place(path, x, y) {
      const h = height(path);
      pos.set(path, { x, y: y + (h - NODE_H) / 2 });
      let cy = y;
      for (const c of childrenOf(path)) {
        const ch = height(c.path);
        place(c.path, x + NODE_W + GAP_X, cy);
        cy += ch + GAP_Y;
      }
    }
    place("", PAD, PAD);

    let maxX = 0, maxY = 0;
    for (const p of pos.values()) {
      if (p.x + NODE_W > maxX) maxX = p.x + NODE_W;
      if (p.y + NODE_H > maxY) maxY = p.y + NODE_H;
    }
    return { pos, width: maxX + PAD, height: maxY + PAD };
  }

  function drawEdges() {
    if (!S || !S.svg) return;
    S.svg.innerHTML = "";
    for (const n of S.nodes) {
      const parentPos = S.pos.get(n.parent || "");
      const selfPos = S.pos.get(n.path);
      if (!parentPos || !selfPos) continue;
      const x1 = parentPos.x + NODE_W + SVG_OFF;
      const y1 = parentPos.y + NODE_H / 2 + SVG_OFF;
      const x2 = selfPos.x + SVG_OFF;
      const y2 = selfPos.y + NODE_H / 2 + SVG_OFF;
      const dx = Math.max(30, Math.abs(x2 - x1) * 0.5);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(100,116,139,0.45)");
      path.setAttribute("stroke-width", "1.5");
      S.svg.appendChild(path);
    }
  }

  function relayout() {
    const { pos, width, height } = buildLayout(S.nodes, S.collapsed);
    S.pos = pos;
    S.width = width;
    S.height = height;
    S.stage.style.width = width + "px";
    S.stage.style.height = height + "px";
    S.viewport.style.width = width + "px";
    S.viewport.style.height = height + "px";

    for (const el of S.stage.children) {
      const p = el.dataset.path;
      const np = S.pos.get(p);
      if (!np) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.left = np.x + "px";
      el.style.top = np.y + "px";
      const caret = el.querySelector(".wcv-caret");
      if (caret) caret.textContent = S.collapsed.has(p) ? "\u25b6" : "\u25bc";
    }
    drawEdges();
    try { localStorage.setItem("secstreet.canvas.collapsed", JSON.stringify([...S.collapsed])); } catch {}
  }

  function toggleCollapse(path) {
    if (S.collapsed.has(path)) S.collapsed.delete(path);
    else S.collapsed.add(path);
    relayout();
  }

  function renderNodeEl(n, p) {
    const el = document.createElement("div");
    const catClass = n.catClass ? " cat-" + n.catClass : "";
    el.className = "wcv-node k-" + (n.category || "unknown") + (n.isRoot ? " is-root" : "") + catClass;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.style.width = NODE_W + "px";
    el.style.position = "absolute";
    el.dataset.path = n.path;

    let nameHtml;
    if (n.dir) nameHtml = esc(n.name) + (n.isRoot ? "" : "/");
    else {
      const ext = extOf(n.name);
      if (ext) {
        const base = n.name.slice(0, n.name.length - ext.length);
        nameHtml = esc(base) + '<span class="ext">' + esc(ext) + '</span>';
      } else nameHtml = esc(n.name);
    }

    const hasChildren = S.nodes.some((x) => x.parent === n.path);
    const collapsed = S.collapsed.has(n.path);
    const isEmpty = n.dir && !hasChildren;
    // Skill folders are always treated as folders for collapse/expand.

    // Every folder gets a caret. Empty folders get a greyed, non-interactive one.
    const caretHtml = n.dir
      ? '<span class="wcv-caret' + (isEmpty ? " wcv-caret-empty" : "") + '">' + (collapsed ? "\u25b6" : "\u25bc") + '</span>'
      : '';

    el.innerHTML =
      caretHtml +
      '<div class="wcv-name">' + nameHtml + '</div>' +
      '<div class="wcv-sub"><span class="wcv-badge k-' + n.category + '">' + (n.isRoot ? "workspace" : (KIND[n.category] || "unknown")) + '</span>' +
      (n.sub ? '<span class="wcv-meta">' + esc(n.sub) + '</span>' : '') + '</div>';

    if (n.dir) el.classList.add("has-caret");

    const caretEl = el.querySelector(".wcv-caret");
    if (caretEl && !isEmpty) {
      caretEl.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
      caretEl.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleCollapse(n.path);
      });
    }

    // Drag
    el.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest(".wcv-caret")) return;
      ev.stopPropagation();
      const live = S.pos.get(n.path);
      if (!live) return;
      const startX = ev.clientX, startY = ev.clientY;
      const origX = live.x, origY = live.y;
      let moved = false;
      const onMove = (e) => {
        const dx = (e.clientX - startX) / S.zoom;
        const dy = (e.clientY - startY) / S.zoom;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
        live.x = origX + dx;
        live.y = origY + dy;
        el.style.left = live.x + "px";
        el.style.top = live.y + "px";
        drawEdges();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!moved) {
          // Click, not drag
          if (n.dir) {
            if (n.isRoot) fitToView();
            else if (S.nodes.some((x) => x.parent === n.path)) toggleCollapse(n.path);
          } else {
            try { if (typeof openFile === "function") openFile(n.path); } catch (err) { console.warn(err); }
          }
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      ev.preventDefault();
    });

    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showContextMenu(ev.clientX, ev.clientY, n);
    });

    return el;
  }

  function applyTransform() {
    if (!S || !S.viewport) return;
    S.viewport.style.transform = "translate(" + S.panX + "px," + S.panY + "px) scale(" + S.zoom + ")";
    if (S.hudZ) S.hudZ.textContent = Math.round(S.zoom * 100) + "%";
  }

  function fitToView() {
    if (!S) return;
    const rect = S.wrap.getBoundingClientRect();
    const z = Math.min((rect.width - 120) / S.width, (rect.height - 120) / S.height, 1.1);
    S.zoom = Math.max(0.25, z);
    S.panX = (rect.width - S.width * S.zoom) / 2;
    S.panY = (rect.height - S.height * S.zoom) / 2;
    applyTransform();
  }

  function attachPanZoom() {
    const wrap = S.wrap;
    let panning = false, sx = 0, sy = 0, opx = 0, opy = 0;
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".wcv-node") || e.target.closest(".wcv-hud") || e.target.closest(".wcv-menu")) return;
      panning = true; sx = e.clientX; sy = e.clientY; opx = S.panX; opy = S.panY;
      wrap.classList.add("panning");
    };
    const onMove = (e) => {
      if (!panning || !S) return;
      S.panX = opx + (e.clientX - sx);
      S.panY = opy + (e.clientY - sy);
      applyTransform();
    };
    const onUp = () => { if (panning) { panning = false; if (S) wrap.classList.remove("panning"); } };
    const onWheel = (e) => {
      if (!S) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const oldZ = S.zoom;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZ = Math.max(0.15, Math.min(3, oldZ * factor));
      S.panX = mx - (mx - S.panX) * (newZ / oldZ);
      S.panY = my - (my - S.panY) * (newZ / oldZ);
      S.zoom = newZ;
      applyTransform();
    };
    wrap.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    S.listeners = { onMove, onUp, onDown, onWheel };
  }

  function showContextMenu(x, y, node) {
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "wcv-menu";
    const items = [];
    if (node.isRoot) {
      items.push({ label: "Fit to view", action: () => fitToView() });
      items.push({ label: "Expand all", action: () => { S.collapsed.clear(); relayout(); } });
      items.push({ label: "Collapse all", action: () => {
        for (const n of S.nodes) if (n.dir && S.nodes.some((x) => x.parent === n.path)) S.collapsed.add(n.path);
        relayout();
      }});
    } else if (node.dir) {
      const hasChildren = S.nodes.some((x) => x.parent === node.path);
      if (hasChildren) {
        if (S.collapsed.has(node.path)) items.push({ label: "Open folder", action: () => toggleCollapse(node.path) });
        else items.push({ label: "Close folder", action: () => toggleCollapse(node.path) });
      }
      items.push({ label: "Copy path", action: () => navigator.clipboard.writeText(node.path) });
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
    } else {
      items.push({ label: "Open in editor", action: () => openInEditor(node.path) });
      items.push({ label: "Explain with AI", action: () => openAiDrawer(node, "Explain what this file does in one short paragraph. Then list its main functions, exports, or entry points. Be concrete.") });
      items.push({ label: "Ask about this file…", action: () => openAiDrawer(node, "") });
      items.push({ label: "Copy path", action: () => navigator.clipboard.writeText(node.path) });
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
    }
    for (const it of items) {
      const row = document.createElement("button");
      row.className = "wcv-menu-item";
      row.textContent = it.label;
      row.addEventListener("click", () => { hideContextMenu(); it.action(); });
      menu.appendChild(row);
    }
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
    S.ctxMenu = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + "px";
  }

  function hideContextMenu() {
    if (S && S.ctxMenu) { S.ctxMenu.remove(); S.ctxMenu = null; }
  }

  function openInEditor(path) {
    try { if (typeof openFile === "function") openFile(path); } catch (e) { console.warn(e); }
  }

  function revealInExplorer(path) {
    const btn = document.querySelector('.rail-btn[data-view="explorer"]');
    if (btn) btn.click();
    try {
      const parts = path.split("/");
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? cur + "/" + parts[i] : parts[i];
        state.openDirs.add(cur);
      }
      renderSidebar();
    } catch (e) { console.warn(e); }
  }

  function ensureAiDrawer() {
    if (S.aiDrawer) return S.aiDrawer;
    const d = document.createElement("div");
    d.className = "wcv-ai-drawer";
    d.innerHTML =
      '<div class="wcv-ai-head">' +
        '<div class="wcv-ai-path" id="wcvAiPath">—</div>' +
        '<button class="wcv-ai-close" id="wcvAiClose" title="Close">\u00d7</button>' +
      '</div>' +
      '<div class="wcv-ai-meta" id="wcvAiMeta"></div>' +
      '<pre class="wcv-ai-code" id="wcvAiCode"></pre>' +
      '<div class="wcv-ai-actions">' +
        '<input id="wcvAiInput" placeholder="Ask about this file\u2026" autocomplete="off">' +
        '<button id="wcvAiAsk">Ask</button>' +
      '</div>' +
      '<div class="wcv-ai-msg" id="wcvAiMsg"></div>' +
      '<pre class="wcv-ai-out" id="wcvAiOut"></pre>';
    S.wrap.appendChild(d);
    S.aiDrawer = d;
    d.querySelector("#wcvAiClose").addEventListener("click", closeAiDrawer);
    d.querySelector("#wcvAiAsk").addEventListener("click", () => {
      const v = d.querySelector("#wcvAiInput").value.trim();
      if (v) askAi(v);
    });
    d.querySelector("#wcvAiInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = d.querySelector("#wcvAiInput").value.trim();
        if (v) askAi(v);
      }
    });
    return d;
  }

  function openAiDrawer(node, initialPrompt) {
    const d = ensureAiDrawer();
    S.aiNode = node;
    d.querySelector("#wcvAiPath").textContent = node.path;
    const ext = node.name && node.name.lastIndexOf(".") > 0 ? node.name.slice(node.name.lastIndexOf(".")) : "";
    const chips = [];
    if (node.category) chips.push('<span class="wcv-ai-chip">' + esc(node.category) + '</span>');
    if (ext) chips.push('<span class="wcv-ai-chip">' + esc(ext.replace(".", "")) + '</span>');
    if (typeof node.content === "string") chips.push('<span class="wcv-ai-chip">' + node.content.length + ' bytes</span>');
    d.querySelector("#wcvAiMeta").innerHTML = chips.join("");
    const code = d.querySelector("#wcvAiCode");
    code.textContent = typeof node.content === "string" ? node.content : "(no preview)";
    const input = d.querySelector("#wcvAiInput");
    input.value = "";
    d.querySelector("#wcvAiOut").textContent = "";
    d.querySelector("#wcvAiMsg").textContent = "";
    d.classList.add("open");
    if (initialPrompt) {
      input.value = initialPrompt;
      askAi(initialPrompt);
    } else {
      setTimeout(() => input.focus(), 120);
    }
  }

  function closeAiDrawer() {
    if (S && S.aiDrawer) S.aiDrawer.classList.remove("open");
  }

  async function askAi(prompt) {
    if (!S || !S.aiNode) return;
    const d = S.aiDrawer;
    const out = d.querySelector("#wcvAiOut");
    const msg = d.querySelector("#wcvAiMsg");
    out.textContent = "\u2026";
    msg.textContent = "";
    const context = typeof S.aiNode.content === "string"
      ? (S.aiNode.content.length > 16000 ? S.aiNode.content.slice(0, 16000) + "\n\n[truncated]" : S.aiNode.content)
      : undefined;
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, context }),
      });
      const data = await r.json();
      if (data.ok) {
        out.textContent = data.answer;
        if (data.provider || data.model) msg.textContent = (data.provider || "") + (data.model ? " / " + data.model : "");
      } else {
        out.textContent = "";
        msg.textContent = data.error || "AI unavailable";
      }
    } catch (err) {
      out.textContent = "";
      msg.textContent = "AI unavailable: " + err.message;
    }
  }

  function injectStyles() {
    if (document.getElementById("wcv-styles")) return;
    const s = document.createElement("style");
    s.id = "wcv-styles";
    s.textContent = [
      ".wcv-wrap{position:absolute;inset:0;overflow:hidden;cursor:grab;background:#fff;background-image:linear-gradient(rgba(0,0,0,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.035) 1px,transparent 1px);background-size:24px 24px}",
      ".wcv-wrap.panning{cursor:grabbing}",
      ".wcv-viewport{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}",
      ".wcv-node{position:absolute;padding:10px 14px;background:#fff;border:1px solid #e2e2e6;border-left:3px solid #94a3b8;border-radius:8px;cursor:pointer;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:box-shadow .12s}",
      ".wcv-node:hover{box-shadow:0 4px 12px rgba(0,0,0,.08)}",
      ".wcv-node.has-caret{padding-left:30px}",
      ".wcv-node.is-root{background:#eef2ff;border-left:3px solid #6366f1}",
      ".wcv-node.is-root .wcv-badge{background:rgba(99,102,241,.14);color:#4f46e5}",
      ".wcv-node.k-capability{border-left-color:#2563eb}",
      ".wcv-node.k-workflow{border-left-color:#7c3aed}",
      ".wcv-node.k-source{border-left-color:#059669}",
      ".wcv-node.k-config{border-left-color:#d97706}",
      ".wcv-node.k-data{border-left-color:#0891b2}",
      ".wcv-node.k-binary{border-left-color:#dc2626}",
      ".wcv-node.k-doc{border-left-color:#64748b}",
      ".wcv-node.k-test{border-left-color:#14b8a6}",
      ".wcv-node.k-folder{background:#f7f8fa;border-left-color:#d5d8de}",
      ".wcv-node.k-unknown{border-left-color:#94a3b8}",
      ".wcv-node.k-skill{background:#f8fafc;border-left-color:#6366f1;font-weight:500}",
      ".wcv-node.k-skill.cat-red{border-left-color:#dc2626;background:#fef2f2}",
      ".wcv-node.k-skill.cat-blue{border-left-color:#2563eb;background:#eff6ff}",
      ".wcv-node.k-skill.cat-purple{border-left-color:#7c3aed;background:#f5f3ff}",
      ".wcv-node.k-skill .wcv-badge{background:rgba(99,102,241,.14);color:#4f46e5}",
      ".wcv-node.k-skill.cat-red .wcv-badge{background:rgba(220,38,38,.12);color:#dc2626}",
      ".wcv-node.k-skill.cat-blue .wcv-badge{background:rgba(37,99,235,.12);color:#2563eb}",
      ".wcv-node.k-skill.cat-purple .wcv-badge{background:rgba(124,58,237,.12);color:#7c3aed}",
      ".wcv-ai-drawer{position:absolute;top:0;right:0;bottom:0;width:460px;max-width:45vw;background:#fff;border-left:1px solid #e2e2e6;transform:translateX(100%);transition:transform .2s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column;z-index:20;box-shadow:-8px 0 32px rgba(0,0,0,.06)}",
      ".wcv-ai-drawer.open{transform:translateX(0)}",
      ".wcv-ai-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e2e2e6;gap:10px}",
      ".wcv-ai-path{font-family:ui-monospace,monospace;font-size:12px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".wcv-ai-close{background:transparent;border:none;color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;padding:0 4px}",
      ".wcv-ai-close:hover{color:#0f172a}",
      ".wcv-ai-meta{padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid #f1f3f4}",
      ".wcv-ai-chip{font-family:ui-monospace,monospace;font-size:10px;color:#64748b;background:#f8fafc;border:1px solid #e2e2e6;padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.06em}",
      ".wcv-ai-code{flex:1;overflow:auto;margin:0;padding:14px 16px;font-family:ui-monospace,monospace;font-size:11.5px;color:#334155;background:#fafafa;white-space:pre;line-height:1.55;border:none}",
      ".wcv-ai-actions{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e2e2e6;background:#fff}",
      ".wcv-ai-actions input{flex:1;background:#fff;border:1px solid #d9dbe0;color:#14161a;font-family:ui-monospace,monospace;font-size:12px;padding:8px 10px;border-radius:6px;outline:none}",
      ".wcv-ai-actions input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}",
      ".wcv-ai-actions button{background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}",
      ".wcv-ai-actions button:hover{background:#1d4ed8}",
      ".wcv-ai-msg{padding:6px 16px 0;font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8;min-height:16px}",
      ".wcv-ai-out{max-height:180px;overflow:auto;margin:6px 16px 14px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:11.5px;color:#334155;background:#f8fafc;border:1px solid #e2e2e6;border-radius:6px;white-space:pre-wrap;word-break:break-word}",
      ".wcv-ai-out:empty{display:none}",
      ".wcv-toggle{position:absolute;top:14px;left:14px;display:flex;background:#fff;border:1px solid #e2e2e6;border-radius:8px;padding:2px;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,.06)}",
      ".wcv-toggle-btn{border:none;background:transparent;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:500;color:#64748b;cursor:pointer;font-family:inherit}",
      ".wcv-toggle-btn:hover{color:#0f172a}",
      ".wcv-toggle-btn.active{background:#0f172a;color:#fff}",
      ".wcv-caret{position:absolute;left:8px;top:50%;transform:translateY(-50%);width:16px;height:16px;display:grid;place-items:center;font-size:10px;color:#64748b;cursor:pointer;line-height:1}",
      ".wcv-caret:hover{color:#0f172a}",
      ".wcv-caret.wcv-caret-empty{color:#cbd5e1;cursor:default}",
      ".wcv-caret.wcv-caret-empty:hover{color:#cbd5e1}",
      ".wcv-name{font-family:ui-monospace,monospace;font-size:12px;font-weight:600;color:#14161a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}",
      ".wcv-name .ext{color:#9aa0a6;font-weight:400}",
      ".wcv-sub{display:flex;align-items:center;gap:6px;font-family:ui-monospace,monospace;font-size:10.5px;color:#6b7280}",
      ".wcv-badge{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border-radius:3px}",
      ".wcv-badge.k-capability{background:rgba(37,99,235,.12);color:#2563eb}",
      ".wcv-badge.k-workflow{background:rgba(124,58,237,.12);color:#7c3aed}",
      ".wcv-badge.k-source{background:rgba(5,150,105,.12);color:#059669}",
      ".wcv-badge.k-config{background:rgba(217,119,6,.12);color:#d97706}",
      ".wcv-badge.k-data{background:rgba(8,145,178,.12);color:#0891b2}",
      ".wcv-badge.k-binary{background:rgba(220,38,38,.12);color:#dc2626}",
      ".wcv-badge.k-doc{background:rgba(100,116,139,.12);color:#64748b}",
      ".wcv-badge.k-test{background:rgba(20,184,166,.12);color:#14b8a6}",
      ".wcv-badge.k-folder{background:rgba(148,163,184,.15);color:#64748b}",
      ".wcv-badge.k-unknown{background:rgba(148,163,184,.15);color:#64748b}",
      ".wcv-meta{color:#9aa0a6}",
      ".wcv-hud{position:absolute;bottom:14px;right:14px;display:flex;gap:6px;z-index:10;align-items:center}",
      ".wcv-hud-btn{background:#fff;border:1px solid #e2e2e6;border-radius:6px;min-width:30px;height:30px;font-size:14px;cursor:pointer;display:grid;place-items:center;color:#5f6368;font-family:inherit}",
      ".wcv-hud-btn:hover{background:#f1f3f4;color:#202124}",
      ".wcv-hud-z{background:#fff;border:1px solid #e2e2e6;border-radius:6px;padding:0 10px;font-family:ui-monospace,monospace;font-size:11px;height:30px;display:grid;place-items:center;color:#5f6368;min-width:52px}",
      ".wcv-menu{position:fixed;z-index:2000;background:#fff;border:1px solid #e2e2e6;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:4px;min-width:190px}",
      ".wcv-menu-item{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;border-radius:5px;color:#202124;font-size:12.5px;cursor:pointer;font-family:inherit}",
      ".wcv-menu-item:hover{background:#f1f3f4}",
      ".wcv-loading{padding:60px;text-align:center;color:#9aa0a6;font-family:ui-monospace,monospace;font-size:13px}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function loadViewMode() {
    try { return localStorage.getItem("secstreet.canvas.viewMode") || "files"; }
    catch { return "files"; }
  }
  function saveViewMode(mode) {
    try { localStorage.setItem("secstreet.canvas.viewMode", mode); } catch {}
  }

  function loadCollapsed() {
    try {
      const raw = localStorage.getItem("secstreet.canvas.collapsed");
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }

  async function mount(host) {
    injectStyles();
    host.innerHTML = '<div class="wcv-loading">loading workspace…</div>';
    let nodes, project;
    try {
      const [n, p] = await Promise.all([loadAll(), loadProject()]);
      nodes = n; project = p;
    } catch (e) {
      host.innerHTML = '<div class="wcv-loading" style="color:#c5221f">failed to load: ' + esc(e.message) + '</div>';
      return;
    }
    host.innerHTML = "";

    const rootNode = { path: "", name: project.name || "workspace", dir: true, parent: null, category: "folder", sub: "workspace", isRoot: true };
    const all = [rootNode, ...nodes];

    S = {
      host,
      allNodes: nodes,
      nodes: nodes,
      viewMode: loadViewMode(),
      collapsed: loadCollapsed(),
      zoom: 1, panX: 40, panY: 40,
      ctxMenu: null, listeners: null, svg: null, stage: null, viewport: null
    };
    if (S.viewMode === "skills") S.nodes = transformToSkillView(S.allNodes);

    const wrap = document.createElement("div");
    wrap.className = "wcv-wrap";
    host.appendChild(wrap);
    S.wrap = wrap;

    const viewport = document.createElement("div");
    viewport.className = "wcv-viewport";
    wrap.appendChild(viewport);
    S.viewport = viewport;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.position = "absolute";
    svg.style.left = (-SVG_OFF) + "px";
    svg.style.top = (-SVG_OFF) + "px";
    svg.setAttribute("width", SVG_W);
    svg.setAttribute("height", SVG_W);
    svg.style.pointerEvents = "none";
    svg.style.overflow = "visible";
    viewport.appendChild(svg);
    S.svg = svg;

    const stage = document.createElement("div");
    stage.style.position = "absolute";
    stage.style.left = "0";
    stage.style.top = "0";
    viewport.appendChild(stage);
    S.stage = stage;

    // Initial layout
    const { pos, width, height } = buildLayout(nodes, S.collapsed);
    S.pos = pos;
    S.width = width;
    S.height = height;
    stage.style.width = width + "px";
    stage.style.height = height + "px";
    viewport.style.width = width + "px";
    viewport.style.height = height + "px";

    S.renderAll = function () {
      // Rebuild the whole node set (used on view switch).
      while (S.stage.firstChild) S.stage.removeChild(S.stage.firstChild);
      const withRoot = [rootNode, ...S.nodes];
      const lay = buildLayout(S.nodes, S.collapsed);
      S.pos = lay.pos;
      S.width = lay.width;
      S.height = lay.height;
      S.stage.style.width = lay.width + "px";
      S.stage.style.height = lay.height + "px";
      S.viewport.style.width = lay.width + "px";
      S.viewport.style.height = lay.height + "px";
      for (const n of withRoot) {
        const p = lay.pos.get(n.path) || { x: 0, y: 0 };
        S.stage.appendChild(renderNodeEl(n, p));
      }
      drawEdges();
    };

    for (const n of all) {
      const p = pos.get(n.path) || { x: 0, y: 0 };
      stage.appendChild(renderNodeEl(n, p));
    }
    relayout();

    const toggle = document.createElement("div");
    toggle.className = "wcv-toggle";
    toggle.innerHTML =
      '<button class="wcv-toggle-btn' + (S.viewMode === "files" ? " active" : "") + '" data-mode="files">Files</button>' +
      '<button class="wcv-toggle-btn' + (S.viewMode === "skills" ? " active" : "") + '" data-mode="skills">Skills</button>';
    wrap.appendChild(toggle);
    toggle.addEventListener("click", (e) => {
      const mode = e.target.dataset.mode;
      if (!mode || mode === S.viewMode) return;
      S.viewMode = mode;
      saveViewMode(mode);
      for (const b of toggle.querySelectorAll(".wcv-toggle-btn")) {
        b.classList.toggle("active", b.dataset.mode === mode);
      }
      S.nodes = mode === "skills" ? transformToSkillView(S.allNodes) : S.allNodes;
      S.renderAll();
      fitToView();
    });

    const hud = document.createElement("div");
    hud.className = "wcv-hud";
    hud.innerHTML =
      '<button class="wcv-hud-btn" data-act="out">−</button>' +
      '<span class="wcv-hud-z" id="wcvZoomLabel">100%</span>' +
      '<button class="wcv-hud-btn" data-act="in">+</button>' +
      '<button class="wcv-hud-btn" data-act="fit" style="width:auto;padding:0 12px;font-size:11px">fit</button>';
    wrap.appendChild(hud);
    S.hudZ = hud.querySelector("#wcvZoomLabel");
    hud.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (!act || !S) return;
      if (act === "in") { S.zoom = Math.min(3, S.zoom * 1.2); applyTransform(); }
      if (act === "out") { S.zoom = Math.max(0.15, S.zoom / 1.2); applyTransform(); }
      if (act === "fit") fitToView();
    });

    attachPanZoom();
    document.addEventListener("mousedown", onDocMouseDown);
    fitToView();
  }

  function onDocMouseDown(e) {
    if (S && S.ctxMenu && !S.ctxMenu.contains(e.target)) hideContextMenu();
  }

  function unmount() {
    hideContextMenu();
    if (S && S.listeners) {
      window.removeEventListener("mousemove", S.listeners.onMove);
      window.removeEventListener("mouseup", S.listeners.onUp);
      if (S.wrap) {
        S.wrap.removeEventListener("mousedown", S.listeners.onDown);
        S.wrap.removeEventListener("wheel", S.listeners.onWheel);
      }
    }
    document.removeEventListener("mousedown", onDocMouseDown);
    if (S && S.aiDrawer) { S.aiDrawer.remove(); S.aiDrawer = null; }
    if (S && S.host) S.host.innerHTML = "";
    S = null;
  }

  window.WorkspaceCanvas = { mount, unmount };
})();
