(function () {
  const NODE_W = 180;
  const NODE_H = 76;

  let S = null;

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  }

  function renderNode(step) {
    const el = document.createElement("div");
    el.className = "cnode";
    el.style.left = step.x + "px";
    el.style.top = step.y + "px";
    el.dataset.stepId = step.id;
    const subtitle = step.from ? ("from " + step.from) : (step.input ? "inline input" : "no input");
    el.innerHTML =
      '<span class="cport cport-in"></span>' +
      '<span class="cport cport-out"></span>' +
      '<div class="cnode-id">' + step.id + '</div>' +
      '<div class="cnode-cap">' + step.capability + '</div>' +
      '<div class="cnode-from">' + subtitle + '</div>';
    return el;
  }

  function createsCycle(steps, fromId, toId) {
    // walk backward from fromId; if we reach toId, adding this edge closes a loop
    const byId = new Map(steps.map((s) => [s.id, s]));
    let cur = byId.get(fromId);
    const seen = new Set();
    while (cur) {
      if (cur.id === toId) return true;
      if (seen.has(cur.id)) return false;
      seen.add(cur.id);
      cur = cur.from ? byId.get(cur.from) : null;
    }
    return false;
  }

  function drawConnections() {
    if (!S || !S.svg) return;
    const stage = S.svg.parentElement;
    if (!stage) return;
    S.svg.setAttribute("width", Math.max(stage.clientWidth, 2000));
    S.svg.setAttribute("height", Math.max(stage.clientHeight, 2000));
    S.svg.innerHTML = "";
    for (const step of S.workflow.steps) {
      if (!step.from) continue;
      const fromStep = S.workflow.steps.find((s) => s.id === step.from);
      if (!fromStep) continue;
      const x1 = fromStep.x + NODE_W;
      const y1 = fromStep.y + NODE_H / 2;
      const x2 = step.x;
      const y2 = step.y + NODE_H / 2;
      const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
      path.setAttribute("class", "cedge");
      S.svg.appendChild(path);
    }
  }

  function onDragMove(e) {
    if (!S || !S.drag) return;
    const d = S.drag;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const step = S.workflow.steps.find((s) => s.id === d.id);
    if (!step) return;
    step.x = Math.max(0, d.origX + dx);
    step.y = Math.max(0, d.origY + dy);
    const el = S.nodeEls.get(d.id);
    if (el) { el.style.left = step.x + "px"; el.style.top = step.y + "px"; }
    drawConnections();
  }

  function onDragEnd() {
    if (!S || !S.drag) return;
    const el = S.nodeEls.get(S.drag.id);
    if (el) el.classList.remove("dragging");
    S.drag = null;
    markDirty(true);
  }

  function markDirty(d) {
    if (!S) return;
    S.dirty = d;
    if (S.onDirty) S.onDirty(d);
  }

  async function save() {
    if (!S || !S.workflow) return;
    const content = JSON.stringify(S.workflow, null, 2) + "\n";
    await api("/api/file?path=" + encodeURIComponent(S.path), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    markDirty(false);
  }

  async function mount(host, path, onDirty) {
    host.innerHTML = "";
    host.classList.add("canvas-host-visible");
    S = {
      host, path, workflow: null, dirty: false, onDirty: onDirty || null,
      drag: null, svg: null, nodeEls: new Map(), pending: null, tempLine: null
    };

    let raw;
    try {
      raw = await api("/api/file?path=" + encodeURIComponent(path));
    } catch (err) {
      host.innerHTML = '<div class="canvas-error">Cannot open ' + path + ": " + err.message + "</div>";
      return;
    }
    try {
      S.workflow = JSON.parse(raw.content);
    } catch (err) {
      host.innerHTML = '<div class="canvas-error">Invalid workflow JSON: ' + err.message + "</div>";
      return;
    }
    if (!Array.isArray(S.workflow.steps)) S.workflow.steps = [];
    S.workflow.steps.forEach((s, i) => {
      if (typeof s.x !== "number") s.x = 40 + i * 240;
      if (typeof s.y !== "number") s.y = 100;
    });

    const shell = document.createElement("div");
    shell.className = "canvas-shell";
    shell.innerHTML =
      '<div class="canvas-toolbar">' +
        '<span class="canvas-name">' + (S.workflow.name || path) + "</span>" +
        '<span class="canvas-count">' + S.workflow.steps.length + " steps</span>" +
        '<span class="canvas-debug" id="cDebug"></span>' +
        '<span class="canvas-spacer"></span>' +
        '<button class="canvas-btn" id="cReset">Reset layout</button>' +
        '<button class="canvas-btn primary" id="cSave">Save</button>' +
      "</div>" +
      '<div class="canvas-stage" id="cStage"></div>';
    host.appendChild(shell);
    const dbg = (msg) => { const el = shell.querySelector("#cDebug"); if (el) el.textContent = msg; };
    window.addEventListener("error", (e) => dbg("ERR: " + e.message));

    const stage = shell.querySelector("#cStage");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "canvas-svg");
    stage.appendChild(svg);
    S.svg = svg;

    let created = 0;
    for (let i = 0; i < S.workflow.steps.length; i++) {
      const step = S.workflow.steps[i];
      if (typeof step.x !== "number" || !isFinite(step.x)) step.x = 40 + i * 240;
      if (typeof step.y !== "number" || !isFinite(step.y)) step.y = 100;
      if (step.x < 0) step.x = 40 + i * 240;
      if (step.y < 0) step.y = 100;
      try {
        const el = renderNode(step);
        stage.appendChild(el);
        S.nodeEls.set(step.id, el);
        created++;
      } catch (err) {
        dbg("render fail on " + step.id + ": " + err.message);
      }
    }
    dbg("rendered " + created + "/" + S.workflow.steps.length + " · stage " + stage.clientWidth + "x" + stage.clientHeight);
    drawConnections();

    // --- drag-to-connect ---
    stage.addEventListener("mousedown", (e) => {
      const outPort = e.target.closest(".cport-out");
      if (!outPort) return;
      const node = outPort.closest(".cnode");
      if (!node) return;
      const fromId = node.dataset.stepId;
      S.pending = { fromId };
      const stageRect = stage.getBoundingClientRect();
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("class", "cedge pending");
      S.svg.appendChild(line);
      S.tempLine = line;
      updateTempLine(e, stageRect);
      e.preventDefault();
      e.stopPropagation();
    });

    function updateTempLine(e, stageRect) {
      if (!S.pending || !S.tempLine) return;
      const fromEl = S.nodeEls.get(S.pending.fromId);
      if (!fromEl) return;
      const fromStep = S.workflow.steps.find((x) => x.id === S.pending.fromId);
      if (!fromStep) return;
      const x1 = fromStep.x + 180;
      const y1 = fromStep.y + 38;
      const x2 = e.clientX - stageRect.left + stage.scrollLeft;
      const y2 = e.clientY - stageRect.top + stage.scrollTop;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      S.tempLine.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
    }

    stage.addEventListener("mousemove", (e) => {
      if (!S.pending) return;
      updateTempLine(e, stage.getBoundingClientRect());
    });

    stage.addEventListener("mouseup", (e) => {
      if (!S.pending) return;
      const target = e.target.closest(".cnode");
      const fromId = S.pending.fromId;
      S.pending = null;
      if (S.tempLine) { S.tempLine.remove(); S.tempLine = null; }
      if (!target) return;
      const toId = target.dataset.stepId;
      if (toId === fromId) return;
      const targetStep = S.workflow.steps.find((x) => x.id === toId);
      if (!targetStep) return;
      // reject if this would create a cycle
      if (createsCycle(S.workflow.steps, fromId, toId)) {
        console.warn("[canvas] refused: would create a cycle");
        return;
      }
      targetStep.from = fromId;
      delete targetStep.input;
      const el = S.nodeEls.get(toId);
      if (el) {
        const sub = el.querySelector(".cnode-from");
        if (sub) sub.textContent = "from " + fromId;
      }
      drawConnections();
      markDirty(true);
    });

    window.addEventListener("mouseup", () => {
      if (S && S.pending) {
        S.pending = null;
        if (S.tempLine) { S.tempLine.remove(); S.tempLine = null; }
      }
    });

    shell.querySelector("#cSave").addEventListener("click", save);
    shell.querySelector("#cReset").addEventListener("click", () => {
      S.workflow.steps.forEach((s, i) => { s.x = 40 + i * 240; s.y = 100; });
      for (const s of S.workflow.steps) {
        const el = S.nodeEls.get(s.id);
        if (el) { el.style.left = s.x + "px"; el.style.top = s.y + "px"; }
      }
      drawConnections();
      markDirty(true);
    });

    stage.addEventListener("mousedown", (e) => {
      const node = e.target.closest(".cnode");
      if (!node) return;
      const id = node.dataset.stepId;
      const step = S.workflow.steps.find((s) => s.id === id);
      if (!step) return;
      S.drag = { id, startX: e.clientX, startY: e.clientY, origX: step.x, origY: step.y };
      node.classList.add("dragging");
      e.preventDefault();
    });

    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function unmount() {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    if (S && S.host) { S.host.classList.remove("canvas-host-visible"); S.host.innerHTML = ""; }
    S = null;
  }

  window.Canvas = { mount, unmount, save: () => save() };
})();
