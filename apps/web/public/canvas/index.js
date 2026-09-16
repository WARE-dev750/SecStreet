// index.js — canvas entry point. Mount/unmount. Orchestration only.
(function () {
  let S = null;

  function onDocMouseDown(e) {
    if (S && S.ctxMenu && !S.ctxMenu.contains(e.target)) window.CanvasParts.ContextMenu.hide();
  }



  async function mount(host) {
    const State = window.CanvasParts.State;
    const Files = window.CanvasParts.Files;
    const Skills = window.CanvasParts.Skills;
    const Layout = window.CanvasParts.Layout;
    const Render = window.CanvasParts.Render;
    const Panzoom = window.CanvasParts.Panzoom;

    try { if (S) unmount(); } catch {}
    State.cleanupLegacy();
    Render.injectStyles();

    host.innerHTML = '<div class="wcv-loading">loading workspace\u2026</div>';
    let nodes, project;
    try {
      const [n, p] = await Promise.all([Files.loadAll(), Files.loadProject()]);
      nodes = n; project = p;
    } catch (e) {
      host.innerHTML = '<div class="wcv-loading" style="color:#c5221f">failed to load: ' + Files.esc(e.message) + '</div>';
      return;
    }
    host.innerHTML = "";

    const initialViewMode = State.loadViewMode();
    const savedPanZoom = State.loadPanZoom();

    S = {
      host,
      allNodes: nodes,
      nodes: initialViewMode === "skills" ? Skills.transformToSkillView(nodes) : nodes,
      viewMode: initialViewMode,
      collapsed: State.loadCollapsed(initialViewMode),
      manualDelta: State.loadManualDelta(initialViewMode),
      zoom: savedPanZoom ? savedPanZoom.zoom : 1,
      panX: savedPanZoom ? savedPanZoom.panX : 40,
      panY: savedPanZoom ? savedPanZoom.panY : 40,
      ctxMenu: null,
      listeners: null,
      svg: null, stage: null, viewport: null, wrap: null,
      hudZ: null, aiDrawer: null, aiNode: null,
      rootMoving: false, rootMoveSnapshot: null, rootMoveBar: null,
      reparent: new Map(),
      rootNode: null, pos: null, width: 0, height: 0
    };
    State.set(S);

    S.reparent = window.CanvasParts.Reparent.load(initialViewMode);
    S.nodes = window.CanvasParts.Reparent.applyOverrides(S.nodes, S.reparent);
    S.rootNode = { path: "", name: project.name || "workspace", dir: true, parent: null, category: "folder", sub: "workspace", isRoot: true };

    State.pruneManualDelta();
    window.CanvasParts.Reparent.prune();

    // --- DOM skeleton ---
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
    svg.style.left = (-Render.SVG_OFF) + "px";
    svg.style.top = (-Render.SVG_OFF) + "px";
    svg.setAttribute("width", Render.SVG_W);
    svg.setAttribute("height", Render.SVG_W);
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

    // --- Files/Skills toggle ---
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
      State.saveViewMode(mode);
      S.collapsed = State.loadCollapsed(mode);
      S.manualDelta = State.loadManualDelta(mode);
      S.reparent = window.CanvasParts.Reparent.load(mode);
      S.nodes = mode === "skills" ? Skills.transformToSkillView(S.allNodes) : S.allNodes;
      S.nodes = window.CanvasParts.Reparent.applyOverrides(S.nodes, S.reparent);
      for (const b of toggle.querySelectorAll(".wcv-toggle-btn")) b.classList.toggle("active", b.dataset.mode === mode);
      S.nodes = mode === "skills" ? Skills.transformToSkillView(S.allNodes) : S.allNodes;
      State.pruneManualDelta();
      Render.rebuild();
      Panzoom.fitToView();
    });

    // --- HUD ---
    const hud = document.createElement("div");
    hud.className = "wcv-hud";
    hud.innerHTML =
      '<button class="wcv-hud-btn" data-act="out">\u2212</button>' +
      '<span class="wcv-hud-z" id="wcvZoomLabel">100%</span>' +
      '<button class="wcv-hud-btn" data-act="in">+</button>' +
      '<button class="wcv-hud-btn" data-act="fit" style="width:auto;padding:0 12px;font-size:11px">fit</button>';
    wrap.appendChild(hud);
    S.hudZ = hud.querySelector("#wcvZoomLabel");
    hud.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === "in") Panzoom.zoomIn();
      if (act === "out") Panzoom.zoomOut();
      if (act === "fit") Panzoom.fitToView();
    });

    // --- Initial render ---
    Render.rebuild();
    Panzoom.attach(wrap);
    window.CanvasParts.Upload.attach(wrap);
    document.addEventListener("mousedown", onDocMouseDown);


    const hasSavedState = savedPanZoom || S.manualDelta.size > 0 || S.collapsed.size > 0;
    if (hasSavedState) Render.applyTransform();
    else Panzoom.fitToView();

    void Layout;
  }

  function unmount() {
    const State = window.CanvasParts.State;
    const R = window.CanvasParts.Render;
    window.CanvasParts.ContextMenu.hide();
    if (S && S.listeners) {
      window.removeEventListener("mousemove", S.listeners.onMove);
      window.removeEventListener("mouseup", S.listeners.onUp);
      if (S.wrap) {
        S.wrap.removeEventListener("mousedown", S.listeners.onDown);
        S.wrap.removeEventListener("wheel", S.listeners.onWheel);
      }
    }
    document.removeEventListener("mousedown", onDocMouseDown);
    if (S && S.rootMoving) {
      try { window.CanvasParts.RootMove.exit(true); } catch {}
    }
    if (S && S.aiDrawer) { S.aiDrawer.remove(); S.aiDrawer = null; }
    if (S) State.persistPanZoom();
    if (S && S.host) S.host.innerHTML = "";
    S = null;
    State.set(null);
    void R;
  }

  window.WorkspaceCanvas = { mount, unmount };
})();
