// SecStreet Library page logic.
// Owns the search input, results list, capability detail, Monaco editor,
// and the install button. Nothing else. Styles live in library.css,
// markup lives in library.html.

(function () {
  const $ = (id) => document.getElementById(id);
  let editor = null;
  let current = null;
  let debounce = null;
  let categoryFilter = "all";
  let allResults = [];

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  }

  function trustClass(t) {
    return ["community", "professional", "verified", "restricted"].includes(t) ? t : "community";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let staticIndex = null;
  let hasApi = null;

  async function detectApi() {
    if (hasApi !== null) return hasApi;
    try {
      const r = await fetch("/api/library");
      const ct = r.headers.get("content-type") || "";
      if (!r.ok || !ct.includes("application/json")) {
        hasApi = false;
      } else {
        // also verify it parses as the expected shape
        const data = await r.clone().json();
        hasApi = typeof data === "object" && data !== null;
      }
    } catch {
      hasApi = false;
    }
    return hasApi;
  }

  async function loadStaticIndex() {
    if (staticIndex) return staticIndex;
    const r = await fetch("/capabilities.json");
    if (!r.ok) throw new Error("capabilities.json not available");
    const raw = await r.json();
    staticIndex = raw.map((entry) => {
      const m = entry.manifest || entry;
      return {
        name: m.name,
        version: m.version,
        description: m.description,
        language: m.language,
        trust: m.trust,
        risk: m.risk,
        permissions: m.permissions || [],
        tags: m.tags || [],
        category: m.category || "neutral",
        score: 1,
        matchedOn: [],
        __static: entry,
      };
    });
    return staticIndex;
  }

  function scoreStatic(cap, q) {
    if (!q) return 1;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    let score = 0;
    const name = cap.name.toLowerCase();
    const desc = cap.description.toLowerCase();
    const tags = (cap.tags || []).map((t) => t.toLowerCase());
    for (const t of tokens) {
      if (name === t) score += 100;
      else if (name.startsWith(t)) score += 60;
      else if (name.includes(t)) score += 30;
      if (tags.includes(t)) score += 40;
      else if (tags.some((tag) => tag.includes(t))) score += 15;
      if (desc.includes(t)) score += 10;
      if ((cap.language || "").toLowerCase().includes(t)) score += 8;
      if ((cap.trust || "").toLowerCase().includes(t)) score += 6;
      if ((cap.risk || "").toLowerCase().includes(t)) score += 4;
    }
    return score;
  }

  async function load(q) {
    let results;
    const useApi = await detectApi();
    if (useApi) {
      const data = await api("/api/library/search?q=" + encodeURIComponent(q));
      results = data.results;
    } else {
      const all = await loadStaticIndex();
      results = all.map((c) => ({ ...c, score: scoreStatic(c, q) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    }
    const data = { results };
    const filtered = categoryFilter === "all"
      ? allResults
      : allResults.filter((r) => (r.category || "neutral") === categoryFilter);
    $("count").textContent = filtered.length + " result" + (filtered.length === 1 ? "" : "s");
    if (!filtered.length) {
      $("list").innerHTML = '<div class="lib-empty">no matches</div>';
      return;
    }
    $("list").innerHTML = filtered.map((r) =>
      '<div class="lib-row category-' + (r.category || "neutral") + '" data-name="' + r.name + '" data-category="' + (r.category || "neutral") + '">' +
        '<div class="lname">' + r.name + '</div>' +
        '<div class="ldesc">' + escapeHtml(r.description) + '</div>' +
        '<div class="lmeta">' +
          '<span class="badge-trust badge-' + trustClass(r.trust) + '">' + r.trust + '</span>' +
          '<span class="lm-dot">·</span>' +
          '<span>' + r.risk + '</span>' +
          '<span class="lm-dot">·</span>' +
          '<span>' + r.language + '</span>' +
          (r.score && r.score > 1 ? '<span class="lscore">' + r.score + '</span>' : '') +
        '</div>' +
      '</div>'
    ).join("");
    for (const el of document.querySelectorAll(".lib-row")) {
      el.addEventListener("click", () => selectCap(el.dataset.name));
    }
    if (current && !filtered.find((r) => r.name === current)) current = null;
  }

  async function selectCap(name) {
    current = name;
    for (const el of document.querySelectorAll(".lib-row")) {
      el.classList.toggle("active", el.dataset.name === name);
    }
    let data;
    const useApi = await detectApi();
    if (useApi) {
      data = await api("/api/library/" + encodeURIComponent(name));
    } else {
      const all = await loadStaticIndex();
      const found = all.find((c) => c.name === name);
      if (!found) { alert("capability not found: " + name); return; }
      data = {
        manifest: found.__static.manifest,
        inputSchema: found.__static.inputSchema,
        outputSchema: found.__static.outputSchema,
        entrypointCode: found.__static.entrypointCode || "",
      };
    }
    const m = data.manifest;
    const perms = (m.permissions || []).join(", ") || "none";
    const tags = (m.tags || []).join(", ") || "—";
    $("detail").innerHTML =
      '<div class="lib-detail">' +
        '<div class="dcrumb"><a href="/">SecStreet</a> <span class="mx-1">/</span> library <span class="mx-1">/</span> ' + m.name + '</div>' +
        '<div class="lib-title-row">' +
          '<h1>' + m.name + ' <span class="ver">@' + m.version + '</span></h1>' +
          '<span class="cat-tag ' + (m.category || "neutral") + '">' + (m.category || "neutral") + '</span>' +
          '<button id="installBtn" class="btn-install"><i class="bi bi-download me-1"></i>Install</button>' +
        '</div>' +
        '<div class="lib-install-msg" id="installMsg"></div>' +
        '<div class="ddesc">' + escapeHtml(m.description) + '</div>' +
        '<div class="kv">' +
          '<span class="k">trust</span><span class="v"><span class="badge-trust badge-' + trustClass(m.trust) + '">' + m.trust + '</span></span>' +
          '<span class="k">risk</span><span class="v">' + m.risk + '</span>' +
          '<span class="k">language</span><span class="v">' + m.language + '</span>' +
          '<span class="k">permissions</span><span class="v">' + perms + '</span>' +
          '<span class="k">tags</span><span class="v">' + tags + '</span>' +
          '<span class="k">maintainer</span><span class="v">' + m.maintainer + '</span>' +
          '<span class="k">license</span><span class="v">' + (m.provenance && m.provenance.license ? m.provenance.license : "unknown") + '</span>' +
        '</div>' +
        '<div class="section">Input schema</div>' +
        '<pre>' + escapeHtml(JSON.stringify(data.inputSchema, null, 2)) + '</pre>' +
        '<div class="section">Output schema</div>' +
        '<pre>' + escapeHtml(JSON.stringify(data.outputSchema, null, 2)) + '</pre>' +
        '<div class="section">Entrypoint · ' + m.entrypoint + '</div>' +
        '<div class="lib-code" id="code"></div>' +
      '</div>';

    $("installBtn").addEventListener("click", async () => {
      const btn = $("installBtn");
      const msg = $("installMsg");
      btn.disabled = true;
      btn.textContent = "Installing…";
      msg.textContent = "";
      msg.style.color = "var(--cream-3)";
      try {
        const r = await api("/api/library/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: m.name })
        });
        if (r.ok) {
          btn.textContent = "Installed";
          btn.classList.add("installed");
          msg.style.color = "var(--ok)";
          msg.textContent = "installed " + r.name + "@" + r.version + " into your project";
        } else {
          btn.disabled = false;
          btn.textContent = "Install to project";
          msg.style.color = "var(--err)";
          msg.textContent = r.error || "install failed";
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Install to project";
        msg.style.color = "var(--err)";
        msg.textContent = err.message;
      }
    });

    if (editor) { editor.dispose(); editor = null; }
    editor = monaco.editor.create($("code"), {
      value: data.entrypointCode || "(no code)",
      language: "javascript",
      theme: "secstreet-light",
      fontSize: 12.5,
      fontFamily: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      readOnly: true,
      padding: { top: 10 },
      tabSize: 2
    });
  }

  function wireChips() {
    for (const btn of document.querySelectorAll(".chip[data-cat]")) {
      btn.addEventListener("click", () => {
        for (const b of document.querySelectorAll(".chip[data-cat]")) b.classList.toggle("active", b === btn);
        categoryFilter = btn.dataset.cat;
        load($("q").value);
      });
    }
  }

  require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    monaco.editor.defineTheme("secstreet-light", {
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
        "editorCursor.foreground": "#1a73e8"
      }
    });
    wireChips();
    load("");
  });

  $("q").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => load(e.target.value), 120);
  });
})();
