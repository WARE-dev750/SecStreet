// ===== state =====
const state = {
  view: "explorer",
  project: null,
  files: null,
  flatFiles: [],
  tabs: [],
  activeTab: null,
  monaco: null,
  editor: null,
  models: new Map(),
  selectedCap: null,
  rightTab: "inspector",
  caps: [],
  openDirs: new Set(),
  bottomOpen: false,
  bottomTab: "output",
  outputLog: []
};

const $ = (id) => document.getElementById(id);

window.addEventListener("error", (e) => console.error("[secstreet]", e.message, e.filename + ":" + e.lineno));
window.addEventListener("unhandledrejection", (e) => console.error("[secstreet] unhandled:", e.reason));

async function api(path, opts) {
  const r = await fetch(path, opts);
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}

// ===== monaco boot =====
require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
require(["vs/editor/editor.main"], () => {
  monaco.editor.defineTheme("secstreet", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "80868b", fontStyle: "italic" },
      { token: "string", foreground: "188038" },
      { token: "keyword", foreground: "1967d2" },
      { token: "number", foreground: "9334e6" },
      { token: "type", foreground: "b06000" }
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1f1f23",
      "editorLineNumber.foreground": "#dadce0",
      "editorLineNumber.activeForeground": "#1a73e8",
      "editor.selectionBackground": "#e8f0fe",
      "editor.lineHighlightBackground": "#f8f9fa",
      "editorCursor.foreground": "#1a73e8",
      "editorIndentGuide.background": "#f0f0f2",
      "editorIndentGuide.activeBackground": "#dadce0"
    }
  });
  state.monaco = monaco;
  boot();
});

// ===== boot =====
async function boot() {
  try {
    state.project = await api("/api/project");
  } catch (err) {
    document.body.innerHTML = '<div style="padding:40px;font-family:monospace;color:#cf7a68">Failed to load project: ' + err.message + '</div>';
    return;
  }
  $("statusProject").textContent = state.project.name + "@" + state.project.version;
  $("crumb").textContent = state.project.name;
  $("statusPort").textContent = location.host;
  $("statusCaps").textContent = state.project.installed.length + " caps";
  state.caps = state.project.installed;

  await loadTree();
  if (state.files) for (const n of state.files) if (n.type === "dir") state.openDirs.add(n.path);
  await loadAuditCount();
  renderSidebar();
  renderRight();
  renderBottom();
  wireUI();
}

async function loadTree() {
  const data = await api("/api/files");
  state.files = data.tree;
  state.flatFiles = [];
  (function walk(nodes) {
    for (const n of nodes) {
      if (n.type === "file") state.flatFiles.push(n);
      if (n.children) walk(n.children);
    }
  })(state.files);
}

async function loadAuditCount() {
  try {
    const { entries } = await api("/api/audit");
    const ok = entries.filter((e) => e.outcome === "ok").length;
    const err = entries.length - ok;
    $("statusLang").textContent = entries.length ? (ok + " ok · " + err + " err") : "no runs";
  } catch {}
}

// ===== sidebar =====
function renderSidebar() {
  const titles = { explorer: "Explorer", capabilities: "Capabilities", workflows: "Workflows", audit: "Audit", registry: "Registry" };
  $("sidebarTitle").textContent = titles[state.view] || state.view;
  const body = $("sidebarBody");
  if (state.view === "explorer") body.innerHTML = renderTree(state.files, 0);
  else if (state.view === "capabilities") body.innerHTML = renderCapList();
  else if (state.view === "workflows") body.innerHTML = renderWorkflowList();
  else if (state.view === "audit") renderAudit(body);
  else if (state.view === "registry") body.innerHTML = renderRegistryPanel();
  wireSidebar();
}

function renderTree(nodes, depth) {
  depth = depth || 0;
  if (!nodes || !nodes.length) return '<div style="padding:12px;color:var(--cream-3);font-size:12px">no files</div>';
  let html = "";
  for (const n of nodes) {
    const pad = 6 + depth * 10;
    if (n.type === "dir") {
      const isOpen = state.openDirs && state.openDirs.has(n.path);
      const chevCls = "chev" + (isOpen ? " open" : "");
      const folderSvg = isOpen ? window.ICO.folderOpen : window.ICO.folder;
      html += '<div class="tree-row dir" data-path="' + n.path + '" data-dir="1" style="padding-left:' + pad + 'px">';
      html += '<span class="' + chevCls + '">▶</span>';
      html += '<span class="ico">' + folderSvg + '</span>';
      html += '<span class="label">' + n.name + '</span>';
      html += '</div>';
      if (isOpen) {
        html += renderTree(n.children, depth + 1);
      }
    } else {
      const active = state.activeTab === n.path ? " active" : "";
      const ic = iconFor(n.name);
      html += '<div class="tree-row' + active + '" data-path="' + n.path + '" style="padding-left:' + pad + 'px">';
      html += '<span class="chev"></span>';
      html += '<span class="ico ' + ic.cls + '">' + ic.svg + '</span>';
      html += '<span class="label">' + n.name + '</span>';
      html += '</div>';
    }
  }
  return html;
}

function iconFor(name) {
  if (name.endsWith(".json")) return { svg: window.ICO.json, cls: "json" };
  if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs")) return { svg: window.ICO.js, cls: "js" };
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return { svg: window.ICO.ts, cls: "ts" };
  if (name.endsWith(".md")) return { svg: window.ICO.md, cls: "md" };
  if (name.endsWith(".py")) return { svg: window.ICO.py, cls: "py" };
  return { svg: window.ICO.file, cls: "" };
}

function renderCapList() {
  if (!state.caps.length) return '<div style="padding:12px;color:var(--text-3);font-size:12px">no capabilities installed</div>';
  let html = '<div class="cap-list">';
  for (const c of state.caps) {
    const active = state.selectedCap === c.name ? " active" : "";
    html += '<div class="cap-row' + active + '" data-cap="' + c.name + '">';
    html += '<span class="name">' + c.name + ' <span style="color:var(--text-3);font-size:10.5px">@' + c.version + '</span></span>';
    html += '<span class="meta"><span class="badge ' + c.trust + '">' + c.trust + '</span> · ' + c.risk + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function collectWorkflows() {
  const out = [];
  (function walk(nodes, dirPrefix) {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.type === "dir") {
        if (n.name === "workflows") {
          (function collect(children) {
            for (const c of children || []) {
              if (c.type === "file" && c.name.endsWith(".json")) out.push(c.path);
            }
          })(n.children);
        }
        walk(n.children, n.name);
      }
    }
  })(state.files, "");
  return out;
}

function renderWorkflowList() {
  const flows = collectWorkflows();
  if (!flows.length) {
    return '<div style="padding:12px;color:var(--cream-3);font-size:12px">' +
      'No workflows in this project.<br><span style="color:var(--cream-4)">Add JSON files under <code style="font-family:var(--mono);color:var(--cream-3)">workflows/</code>.</span></div>';
  }
  let html = '<div class="cap-list">';
  for (const wf of flows) {
    const name = wf.split("/").pop();
    const active = state.activeTab === wf ? " active" : "";
    html += '<div class="cap-row' + active + '" data-wf="' + wf + '">';
    html += '<span class="name">' + name + '</span>';
    html += '<span class="meta">canvas</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderRegistryPanel() {
  return '<div style="padding:12px;color:var(--text-3);font-size:12px">' +
    '<div style="color:var(--text);margin-bottom:8px;font-size:12.5px">Remote libraries</div>' +
    '<input id="registryUrl" placeholder="http://127.0.0.1:8787" style="width:100%;padding:6px 8px;background:var(--bg-deep);border:1px solid var(--border);color:var(--text);font-size:11.5px;border-radius:3px">' +
    '<button id="registryGo" style="margin-top:6px;width:100%;padding:6px;background:var(--gold);color:var(--bg-deep);font-size:11.5px;font-weight:600;border-radius:3px">Connect</button>' +
    '<div id="registryResults" style="margin-top:10px"></div>' +
    '</div>';
}

async function renderAudit(body) {
  try {
    const { entries } = await api("/api/audit");
    if (!entries.length) { body.innerHTML = '<div style="padding:12px;color:var(--text-3);font-size:12px">no audit entries</div>'; return; }
    let html = "";
    for (const e of entries.slice().reverse()) {
      const cls = e.outcome === "ok" ? "ok" : (e.outcome.startsWith("denied") ? "warn" : "err");
      const when = e.ts.replace("T", " ").slice(11, 19);
      const wf = e.workflow ? " [" + e.workflow + (e.stepId ? ":" + e.stepId : "") + "]" : "";
      html += '<div class="audit-row"><span class="status ' + cls + '">' + e.outcome + '</span><span class="body"><span class="cap">' + e.capability + '</span>' + wf + '<br><span class="when">' + when + ' · ' + e.durationMs + 'ms · exit ' + e.exitCode + '</span></span></div>';
    }
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div style="padding:12px;color:var(--err);font-size:12px">' + err.message + '</div>';
  }
}

// ===== tabs / editor =====
async function openFile(path) {
  const existing = state.tabs.find((t) => t.path === path);
  if (existing) { state.activeTab = path; renderTabs(); activateTab(path); renderRight(); return; }
  try {
    const data = await api("/api/file?path=" + encodeURIComponent(path));
    state.tabs.push({ path, content: data.content, lang: data.language, dirty: false });
    state.activeTab = path;
    renderTabs();
    activateTab(path);
    renderRight();
    renderSidebar();
  } catch (err) {
    alert("Cannot open " + path + ": " + err.message);
  }
}

function closeTab(path, e) {
  if (e) e.stopPropagation();
  const idx = state.tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;
  const model = state.models.get(path);
  if (model) { model.dispose(); state.models.delete(path); }
  state.tabs.splice(idx, 1);
  if (state.activeTab === path) state.activeTab = state.tabs.length ? state.tabs[Math.max(0, idx - 1)].path : null;
  renderTabs();
  if (state.activeTab) activateTab(state.activeTab);
  else showEmpty();
  renderSidebar();
}

function renderTabs() {
  renderBreadcrumb();
  const el = $("tabs");
  if (!state.tabs.length) { el.innerHTML = ""; return; }
  let html = "";
  for (const t of state.tabs) {
    const name = t.path.split("/").pop();
    const active = state.activeTab === t.path ? " active" : "";
    html += '<li class="nav-item"><a class="nav-link' + active + '" data-path="' + t.path + '" href="#">' +
      '<span>' + name + (t.dirty ? " ●" : "") + '</span>' +
      '<i class="bi bi-x tab-close" data-close="' + t.path + '"></i>' +
    '</a></li>';
  }
  el.innerHTML = html;
  el.querySelectorAll(".nav-link").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      const closeEl = e.target.closest("[data-close]");
      if (closeEl) { e.preventDefault(); closeTab(closeEl.dataset.close, e); return; }
      e.preventDefault();
      state.activeTab = tab.dataset.path;
      renderTabs(); activateTab(state.activeTab); renderRight(); renderSidebar();
    });
  });
}


function isWorkflow(path) {
  return path.startsWith("workflows/") && path.endsWith(".json");
}

function mountCanvas(path) {
  $("emptyState").style.display = "none";
  $("editorHost").style.display = "none";
  const ch = $("canvasHost");
  ch.style.display = "flex";
  if (window.Canvas) {
    window.Canvas.mount(ch, path, (dirty) => {
      const t = state.tabs.find((x) => x.path === path);
      if (t) { t.dirty = dirty; renderTabs(); }
    }).catch((err) => {
      ch.innerHTML = '<div class="canvas-error">Canvas failed: ' + err.message + '</div>';
    });
  } else {
    ch.innerHTML = '<div class="canvas-error">canvas.js not loaded</div>';
  }
}

function activateTab(path) {
  const t = state.tabs.find((x) => x.path === path);
  if (!t) { showEmpty(); return; }
  if (isWorkflow(path)) mountCanvas(path);
  else attachEditor(path);
}

function unmountCanvas() {
  if (window.Canvas) window.Canvas.unmount();
  const ch = $("canvasHost");
  if (ch) { ch.innerHTML = ""; ch.style.display = "none"; }
}

function renderBreadcrumb() {
  const el = $("breadcrumb");
  if (!el) return;
  if (!state.activeTab) { el.innerHTML = ""; return; }
  const parts = state.activeTab.split("/");
  let acc = "";
  const crumbs = parts.map((p, i) => {
    acc = acc ? acc + "/" + p : p;
    const last = i === parts.length - 1;
    const ic = last ? iconFor(p) : { svg: window.ICO.folder, cls: "" };
    return '<span class="crumb-part' + (last ? " last" : "") + '" data-path="' + acc + '"><span class="crumb-ico">' + ic.svg + '</span>' + p + '</span>';
  });
  el.innerHTML = crumbs.join('<span class="crumb-sep">›</span>');
  el.querySelectorAll(".crumb-part.last").forEach((c) => c.addEventListener("click", () => openFile(c.dataset.path)));
}

function attachEditor(path) {
  const tab = state.tabs.find((t) => t.path === path);
  if (!tab) return;
  unmountCanvas();
  $("canvasHost").style.display = "none";
  $("editorHost").style.display = "block";
  $("emptyState").style.display = "none";

  if (!state.editor) {
    state.editor = monaco.editor.create($("editorHost"), {
      theme: "secstreet",
      fontSize: 13,
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      renderWhitespace: "selection",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      padding: { top: 12 }
    });
    state.editor.onDidChangeModelContent(() => {
      const active = state.activeTab;
      if (!active) return;
      const t = state.tabs.find((x) => x.path === active);
      if (!t) return;
      const now = state.editor.getValue();
      if (now !== t.content) { t.content = now; t.dirty = true; renderTabs(); }
    });
    state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      if (state.activeTab && state.editor) await saveFile(state.activeTab, state.editor.getValue());
    });
  }

  let model = state.models.get(path);
  if (!model) {
    model = monaco.editor.createModel(tab.content, tab.lang);
    state.models.set(path, model);
  }
  state.editor.setModel(model);
  state.editor.layout();
  setTimeout(() => { if (state.editor) state.editor.layout(); }, 30);
}

async function saveFile(path, content) {
  try {
    await api("/api/file?path=" + encodeURIComponent(path), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    const t = state.tabs.find((t) => t.path === path);
    if (t) { t.content = content; t.dirty = false; renderTabs(); }
  } catch (err) { alert("Save failed: " + err.message); }
}

function showEmpty() {
  $("emptyState").style.display = "grid";
  $("editorHost").style.display = "none";
  const ch = $("canvasHost");
  if (ch) { ch.style.display = "none"; ch.innerHTML = ""; }
  if (window.Canvas) window.Canvas.unmount();
  if (state.editor) state.editor.setModel(null);
}

// ===== bottom panel =====
function pushOutput(line) {
  const ts = new Date().toTimeString().slice(0, 8);
  state.outputLog.push("[" + ts + "] " + line);
  if (state.outputLog.length > 200) state.outputLog.splice(0, state.outputLog.length - 200);
}

async function renderBottom() {
  const body = $("bottomBody");
  if (!body) return;
  if (state.bottomTab === "output") {
    body.innerHTML = state.outputLog.length
      ? '<pre class="bottom-pre">' + escapeHtml(state.outputLog.join("\n")) + '</pre>'
      : '<div class="bottom-empty">Output will appear here when you run a capability.</div>';
    body.scrollTop = body.scrollHeight;
    return;
  }
  if (state.bottomTab === "audit") {
    try {
      const { entries } = await api("/api/audit");
      if (!entries.length) { body.innerHTML = '<div class="bottom-empty">no audit entries</div>'; return; }
      let html = "";
      for (const e of entries.slice().reverse().slice(0, 100)) {
        const cls = e.outcome === "ok" ? "ok" : (e.outcome.startsWith("denied") ? "warn" : "err");
        const when = e.ts.replace("T", " ").slice(11, 19);
        html += '<div class="audit-row"><span class="status ' + cls + '">' + e.outcome + '</span><span class="body"><span class="cap">' + e.capability + '</span><br><span class="when">' + when + ' · ' + e.durationMs + 'ms</span></span></div>';
      }
      body.innerHTML = html;
    } catch (err) { body.innerHTML = '<div class="bottom-empty">' + err.message + '</div>'; }
    return;
  }
  if (state.bottomTab === "problems") {
    body.innerHTML = '<div class="bottom-empty">No problems detected. (Linter integration arrives later.)</div>';
    return;
  }
  if (state.bottomTab === "terminal") {
    body.innerHTML = '<div class="bottom-empty">Terminal arrives in a later paste.</div>';
    return;
  }
}

// ===== right panel =====
function renderRight() {
  const body = $("rightBody");
  if (state.rightTab === "ai") {
    renderAIPanel(body);
    return;
  }
  if (state.rightTab === "library") {
    renderLibraryPanel(body);
    return;
  }
  // inspector
  if (state.selectedCap) {
    renderCapInspector(body);
    return;
  }
  if (state.activeTab) {
    renderFileInspector(body);
    return;
  }
  body.innerHTML = '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:20px 0">Nothing selected.<br>Pick a file or a capability.</div>';
}

async function renderCapInspector(body) {
  try {
    const m = await api("/api/capabilities/" + state.selectedCap);
    body.innerHTML =
      '<h3>' + m.name + ' <span style="color:var(--text-3);font-size:11px">@' + m.version + '</span></h3>' +
      '<div style="color:var(--text-2);font-size:12px;margin-bottom:14px">' + m.description + '</div>' +
      '<div class="kv">' +
        '<span class="k">trust</span><span class="v"><span class="badge ' + m.trust + '">' + m.trust + '</span></span>' +
        '<span class="k">risk</span><span class="v">' + m.risk + '</span>' +
        '<span class="k">language</span><span class="v">' + m.language + '</span>' +
        '<span class="k">permissions</span><span class="v">' + (m.permissions.join(", ") || "none") + '</span>' +
        '<span class="k">maintainer</span><span class="v">' + m.maintainer + '</span>' +
      '</div>' +
      '<div class="section">Input JSON</div>' +
      '<textarea id="capInput">{}</textarea>' +
      '<div class="actions"><button id="capRun">Run</button><button class="ghost" id="capOpen">Open manifest</button></div>' +
      '<div id="capResult"></div>';
    $("capRun").addEventListener("click", async () => {
      let input; try { input = JSON.parse($("capInput").value || "{}"); } catch (e) { $("capResult").innerHTML = '<div class="section">Result</div><pre style="color:var(--err)">invalid JSON</pre>'; return; }
      $("capResult").innerHTML = '<div class="section">Running…</div>';
      try {
        const r = await api("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: m.name, input }) });
        const out = r.ok ? r.stdout : (r.stderr || "failed");
        $("capResult").innerHTML = '<div class="section">Result · ' + r.durationMs + 'ms · exit ' + r.exitCode + '</div><pre' + (r.ok ? '' : ' style="color:var(--err)"') + '>' + escapeHtml(out) + '</pre>';
        pushOutput("run " + m.name + " · exit=" + r.exitCode + " · " + r.durationMs + "ms");
        if (r.ok) pushOutput(r.stdout);
        else pushOutput("stderr: " + (r.stderr || ""));
        loadAuditCount();
        renderBottom();
      } catch (err) { $("capResult").innerHTML = '<div class="section">Error</div><pre style="color:var(--err)">' + escapeHtml(err.message) + '</pre>'; }
    });
    $("capOpen").addEventListener("click", () => openFile("capabilities/" + m.name + "/capability.json"));
  } catch (err) {
    body.innerHTML = '<div style="color:var(--err);font-size:12px">' + err.message + '</div>';
  }
}

function renderFileInspector(body) {
  const tab = state.tabs.find((t) => t.path === state.activeTab);
  if (!tab) return;
  const lines = tab.content.split("\n").length;
  body.innerHTML =
    '<h3>' + tab.path.split("/").pop() + '</h3>' +
    '<div class="kv">' +
      '<span class="k">path</span><span class="v">' + tab.path + '</span>' +
      '<span class="k">language</span><span class="v">' + tab.lang + '</span>' +
      '<span class="k">size</span><span class="v">' + tab.content.length + ' bytes</span>' +
      '<span class="k">lines</span><span class="v">' + lines + '</span>' +
      '<span class="k">dirty</span><span class="v">' + (tab.dirty ? "yes" : "no") + '</span>' +
    '</div>' +
    '<div class="section">Actions</div>' +
    '<div class="actions"><button id="fileSave">Save (Ctrl+S)</button></div>';
  $("fileSave").addEventListener("click", () => {
    if (state.editor && state.activeTab === tab.path) saveFile(tab.path, state.editor.getValue());
  });
}

function renderAIPanel(body) {
  const caps = state.caps;
  if (!caps.length) {
    body.innerHTML = '<div style="color:var(--cream-3);font-size:12px;text-align:center;padding:20px 0">No capabilities installed.</div>';
    return;
  }
  const options = caps.map((c) => '<option value="' + c.name + '">' + c.name + ' @' + c.version + '</option>').join("");
  body.innerHTML =
    '<h3>AI adapter</h3>' +
    '<div class="desc">Generate a bridge capability that transforms a producer output into a consumer input.</div>' +
    '<div class="ai-form">' +
      '<label>Producer</label><select id="aiProducer">' + options + '</select>' +
      '<label>Consumer</label><select id="aiConsumer">' + options + '</select>' +
      '<label>Adapter name (optional)</label><input id="aiName" placeholder="auto" spellcheck="false" />' +
      '<button id="aiGenerate">Generate adapter</button>' +
    '</div>' +
    '<div id="aiResult"></div>';
  $("aiGenerate").addEventListener("click", async () => {
    const producer = $("aiProducer").value;
    const consumer = $("aiConsumer").value;
    const adapterName = $("aiName").value.trim() || undefined;
    $("aiResult").innerHTML = '<div class="section">Generating…</div>';
    try {
      const r = await api("/api/ai/adapter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ producer, consumer, adapterName }),
      });
      if (r.alreadyCompatible) {
        $("aiResult").innerHTML =
          '<div class="section">No adapter needed</div>' +
          '<pre>' + escapeHtml(r.reason) + '</pre>';
        return;
      }
      $("aiResult").innerHTML =
        '<div class="section">Adapter generated</div>' +
        '<div class="kv">' +
          '<span class="k">name</span><span class="v"><code>' + r.adapterName + '</code></span>' +
          '<span class="k">provider</span><span class="v">' + r.provider + ' / ' + r.model + '</span>' +
        '</div>' +
        '<div class="section">Rationale</div>' +
        '<pre>' + escapeHtml(r.rationale) + '</pre>';
      await refreshCaps();
      pushOutput("ai generated " + r.adapterName + " (" + producer + " -> " + consumer + ")");
      renderBottom();
    } catch (err) {
      $("aiResult").innerHTML = '<div class="section">Error</div><pre class="err">' + escapeHtml(err.message) + '</pre>';
    }
  });
}

async function refreshCaps() {
  const p = await api("/api/project");
  state.project = p;
  state.caps = p.installed;
  $("statusCaps").textContent = state.caps.length + " caps";
  const options = state.caps.map((c) => '<option value="' + c.name + '">' + c.name + ' @' + c.version + '</option>').join("");
  const ps = $("aiProducer"); const cs = $("aiConsumer");
  if (ps && cs) {
    const pv = ps.value; const cv = cs.value;
    ps.innerHTML = options; cs.innerHTML = options;
    if (pv) ps.value = pv;
    if (cv) cs.value = cv;
  }
  renderSidebar();
}

// ===== library panel (right sidebar) =====
let libDebounce = null;
let libResults = [];

async function renderLibraryPanel(body) {
  body.innerHTML =
    '<div class="lib-panel">' +
      '<input id="libq" class="form-control form-control-sm" placeholder="Search library" autocomplete="off" spellcheck="false">' +
      '<select id="libLang" class="form-select form-select-sm mt-2">' +
        '<option value="">All languages</option>' +
      '</select>' +
      '<div class="lib-panel-count small text-muted mt-2" id="libCount"></div>' +
      '<div class="lib-panel-list mt-2" id="libList"></div>' +
    '</div>';
  const q = $("libq");
  q.addEventListener("input", () => {
    clearTimeout(libDebounce);
    libDebounce = setTimeout(() => loadLibPanel(q.value), 120);
  });
  $("libLang").addEventListener("change", () => renderLibList());
  await loadLibPanel("");
}

async function loadLibPanel(q) {
  const data = await api("/api/library/search?q=" + encodeURIComponent(q));
  libResults = data.results;
  const langs = Array.from(new Set(libResults.map((r) => r.language))).sort();
  const sel = $("libLang");
  const cur = sel ? sel.value : "";
  if (sel) {
    sel.innerHTML = '<option value="">All languages (' + libResults.length + ')</option>' +
      langs.map((l) => '<option value="' + l + '">' + l + ' (' + libResults.filter((r) => r.language === l).length + ')</option>').join("");
    sel.value = cur;
  }
  renderLibList();
}

function renderLibList() {
  const sel = $("libLang");
  const langFilter = sel ? sel.value : "";
  const list = $("libList");
  if (!list) return;
  const filtered = langFilter ? libResults.filter((r) => r.language === langFilter) : libResults;
  const countEl = $("libCount");
  if (countEl) countEl.textContent = filtered.length + " result" + (filtered.length === 1 ? "" : "s") + (langFilter ? " · " + langFilter : "");
  if (!filtered.length) {
    list.innerHTML = '<div class="text-center text-muted small p-4">no matches</div>';
    return;
  }
  list.innerHTML = filtered.map((r) =>
    '<div class="lib-panel-row" draggable="true" data-name="' + r.name + '" data-lang="' + r.language + '">' +
      '<div class="lib-panel-name">' + r.name + '</div>' +
      '<div class="lib-panel-meta">' +
        '<span class="badge-trust badge-' + trustClass(r.trust) + '">' + r.trust + '</span>' +
        '<span>' + r.language + '</span>' +
        '<span>' + r.risk + '</span>' +
      '</div>' +
    '</div>'
  ).join("");
  list.querySelectorAll(".lib-panel-row").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.name);
      e.dataTransfer.effectAllowed = "copy";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      document.querySelectorAll(".tree-row.drop-target").forEach((r) => r.classList.remove("drop-target"));
    });
    el.addEventListener("click", () => openFileFromLibrary(el.dataset.name));
  });
}

async function openFileFromLibrary(name) {
  const data = await api("/api/library/" + encodeURIComponent(name));
  pushOutput("preview " + name + " (" + data.manifest.language + ", " + data.manifest.entrypoint + ")");
  renderBottom();
}

function trustClass(t) {
  return ["community", "professional", "verified", "restricted"].includes(t) ? t : "community";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== wiring =====
function wireUI() {
  document.querySelectorAll(".rail-btn[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".rail-btn").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      state.view = el.dataset.view;
      const sidebar = $("sidebar");
      if (sidebar) sidebar.classList.remove("hidden");
      renderSidebar();
    });
  });
  const sbToggle = $("sidebarToggle");
  if (sbToggle) sbToggle.addEventListener("click", () => $("sidebar").classList.add("hidden"));
  const rightToggle = $("btnToggleRight");
  if (rightToggle) rightToggle.addEventListener("click", () => $("right").classList.toggle("hidden"));
  document.querySelectorAll(".right-tabs .nav-link").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".right-tabs .nav-link").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      state.rightTab = el.dataset.rtab;
      renderRight();
    });
  });
  const btnPal = $("btnPalette");
  if (btnPal) btnPal.addEventListener("click", openPalette);
  const libBtn = $("btnLibrary");
  if (libBtn) libBtn.addEventListener("click", () => {
    state.rightTab = "library";
    document.querySelectorAll(".right-tabs .nav-link").forEach((x) => {
      x.classList.toggle("active", x.dataset.rtab === "library");
    });
    const right = $("right");
    if (right) right.classList.remove("hidden");
    renderRight();
  });

  // palette
  $("paletteWrap").addEventListener("click", (e) => { if (e.target === $("paletteWrap")) closePalette(); });
  $("paletteInput").addEventListener("input", () => renderPalette($("paletteInput").value));
  $("paletteInput").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePalette();
    if (e.key === "Enter") {
      const sel = document.querySelector(".palette-item.sel");
      if (sel) { closePalette(); openFile(sel.dataset.path); }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = [...document.querySelectorAll(".palette-item")];
      let i = items.findIndex((x) => x.classList.contains("sel"));
      if (i === -1) i = 0; else i += (e.key === "ArrowDown" ? 1 : -1);
      if (i < 0) i = items.length - 1;
      if (i >= items.length) i = 0;
      items.forEach((x) => x.classList.remove("sel"));
      items[i].classList.add("sel");
      e.preventDefault();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); openPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (state.activeTab && isWorkflow(state.activeTab) && window.Canvas) { window.Canvas.save(); } else if (state.activeTab && state.editor) saveFile(state.activeTab, state.editor.getValue()); }
  });

  // bottom panel
  document.querySelectorAll(".bottom-tabs .nav-link").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".bottom-tabs .nav-link").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      state.bottomTab = el.dataset.btab;
      renderBottom();
    });
  });
  const btnBottom = $("btnToggleBottom");
  if (btnBottom) btnBottom.addEventListener("click", () => {
    state.bottomOpen = !state.bottomOpen;
    const shell = document.querySelector(".ide-shell");
    if (shell) shell.classList.toggle("with-bottom", state.bottomOpen);
    setTimeout(() => { if (state.editor) state.editor.layout(); }, 60);
  });
  const bottomClose = $("bottomClose");
  if (bottomClose) bottomClose.addEventListener("click", () => {
    state.bottomOpen = false;
    const shell = document.querySelector(".ide-shell");
    if (shell) shell.classList.remove("with-bottom");
    setTimeout(() => { if (state.editor) state.editor.layout(); }, 60);
  });

  setInterval(loadAuditCount, 10000);
  setInterval(() => { if (state.bottomOpen && state.bottomTab === "audit") renderBottom(); }, 5000);
}

function wireSidebar() {
  $("sidebarBody").querySelectorAll(".tree-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (row.dataset.dir) {
        const p = row.dataset.path;
        if (state.openDirs.has(p)) state.openDirs.delete(p);
        else state.openDirs.add(p);
        renderSidebar();
      } else {
        openFile(row.dataset.path);
      }
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drop-target");
      const name = e.dataTransfer.getData("text/plain");
      if (!name) return;
      const isDir = !!row.dataset.dir;
      const targetPath = isDir ? row.dataset.path : row.dataset.path.split("/").slice(0, -1).join("/");
      try {
        const r = await api("/api/library/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, targetPath })
        });
        if (r.ok) {
          pushOutput("exported " + name + " → " + r.path);
          await loadTree();
          renderSidebar();
          renderBottom();
        }
      } catch (err) { alert("export failed: " + err.message); }
    });
  });
  $("sidebarBody").querySelectorAll(".cap-row[data-wf]").forEach((row) => {
    row.addEventListener("click", () => openFile(row.dataset.wf));
  });
  $("sidebarBody").querySelectorAll(".cap-row[data-cap]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedCap = row.dataset.cap;
      state.rightTab = "inspector";
      document.querySelectorAll(".right-tabs .rt").forEach((x) => x.classList.toggle("active", x.dataset.rtab === "inspector"));
      $("right").classList.remove("hidden");
      renderSidebar();
      renderRight();
    });
  });
  const goBtn = $("registryGo");
  if (goBtn) goBtn.addEventListener("click", async () => {
    const url = $("registryUrl").value.trim();
    if (!url) return;
    $("registryResults").innerHTML = '<div style="color:var(--text-3);font-size:11.5px">loading…</div>';
    try {
      const data = await api("/api/remote/list?url=" + encodeURIComponent(url));
      $("registryResults").innerHTML = data.capabilities.map((c) =>
        '<div class="cap-row"><span class="name">' + c.name + '</span><span class="meta"><span class="badge ' + c.trust + '">' + c.trust + '</span> · ' + c.version + '</span></div>'
      ).join("");
    } catch (err) { $("registryResults").innerHTML = '<div style="color:var(--err);font-size:11.5px">' + err.message + '</div>'; }
  });
}

// ===== command palette =====
function openPalette() {
  $("paletteWrap").classList.add("open");
  $("paletteInput").value = "";
  $("paletteInput").focus();
  renderPalette("");
}
function closePalette() { $("paletteWrap").classList.remove("open"); }
function renderPalette(q) {
  const f = q.toLowerCase();
  const matches = state.flatFiles.filter((x) => !f || x.path.toLowerCase().includes(f)).slice(0, 20);
  const list = $("paletteList");
  if (!matches.length) { list.innerHTML = '<div class="palette-empty">no matches</div>'; return; }
  list.innerHTML = matches.map((m, i) =>
    '<div class="palette-item' + (i === 0 ? " sel" : "") + '" data-path="' + m.path + '"><span>' + m.name + '</span><span class="path">' + m.path + '</span></div>'
  ).join("");
  list.querySelectorAll(".palette-item").forEach((item) => {
    item.addEventListener("click", () => { closePalette(); openFile(item.dataset.path); });
  });
}
