// render.js — DOM rendering. Consumes layout results. Does not compute layout.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Render = (function () {
  const SVG_OFF = 20000;
  const SVG_W = 50000;

  const KIND = {
    capability: "capability", workflow: "workflow", source: "source",
    config: "config", data: "data", binary: "binary", doc: "doc",
    test: "test", folder: "folder", skill: "skill", unknown: "unknown"
  };

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
      ".wcv-badge.k-skill{background:rgba(99,102,241,.14);color:#4f46e5}",
      ".wcv-badge.k-unknown{background:rgba(148,163,184,.15);color:#64748b}",
      ".wcv-meta{color:#9aa0a6}",
      ".wcv-node.k-capability{border-left-color:#2563eb}",
      ".wcv-node.k-workflow{border-left-color:#7c3aed}",
      ".wcv-node.k-source{border-left-color:#059669}",
      ".wcv-node.k-config{border-left-color:#d97706}",
      ".wcv-node.k-data{border-left-color:#0891b2}",
      ".wcv-node.k-binary{border-left-color:#dc2626}",
      ".wcv-node.k-doc{border-left-color:#64748b}",
      ".wcv-node.k-test{border-left-color:#14b8a6}",
      ".wcv-node.k-folder{background:#f7f8fa;border-left-color:#d5d8de}",
      ".wcv-node.k-skill{background:#f8fafc;border-left-color:#6366f1}",
      ".wcv-node.k-skill.cat-red{border-left-color:#dc2626;background:#fef2f2}",
      ".wcv-node.k-skill.cat-blue{border-left-color:#2563eb;background:#eff6ff}",
      ".wcv-node.k-skill.cat-purple{border-left-color:#7c3aed;background:#f5f3ff}",
      ".wcv-node.k-skill.cat-red .wcv-badge{background:rgba(220,38,38,.12);color:#dc2626}",
      ".wcv-node.k-skill.cat-blue .wcv-badge{background:rgba(37,99,235,.12);color:#2563eb}",
      ".wcv-node.k-skill.cat-purple .wcv-badge{background:rgba(124,58,237,.12);color:#7c3aed}",
      ".wcv-node.k-unknown{border-left-color:#94a3b8}",
      ".wcv-node.k-detached{background:#fffbeb;border-left-color:#d97706}",
      ".wcv-node.k-detached .wcv-badge{background:rgba(217,119,6,.12);color:#d97706}",
      ".wcv-node.wcv-drop-target{outline:2px dashed #2563eb;outline-offset:2px;background:#eff6ff}",
      ".wcv-node.wcv-drop-folder{outline:2px solid #2563eb;outline-offset:2px;background:#eff6ff}",
      ".wcv-toggle{position:absolute;top:14px;left:14px;display:flex;background:#fff;border:1px solid #e2e2e6;border-radius:8px;padding:2px;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,.06)}",
      ".wcv-toggle-btn{border:none;background:transparent;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:500;color:#64748b;cursor:pointer;font-family:inherit}",
      ".wcv-toggle-btn:hover{color:#0f172a}",
      ".wcv-toggle-btn.active{background:#0f172a;color:#fff}",
      ".wcv-hud{position:absolute;bottom:14px;right:14px;display:flex;gap:6px;z-index:10;align-items:center}",
      ".wcv-hud-btn{background:#fff;border:1px solid #e2e2e6;border-radius:6px;min-width:30px;height:30px;font-size:14px;cursor:pointer;display:grid;place-items:center;color:#5f6368;font-family:inherit}",
      ".wcv-hud-btn:hover{background:#f1f3f4;color:#202124}",
      ".wcv-hud-z{background:#fff;border:1px solid #e2e2e6;border-radius:6px;padding:0 10px;font-family:ui-monospace,monospace;font-size:11px;height:30px;display:grid;place-items:center;color:#5f6368;min-width:52px}",
      ".wcv-menu{position:fixed;z-index:2000;background:#fff;border:1px solid #e2e2e6;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:4px;min-width:190px}",
      ".wcv-menu-item{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;border-radius:5px;color:#202124;font-size:12.5px;cursor:pointer;font-family:inherit}",
      ".wcv-menu-item:hover{background:#f1f3f4}",
      ".wcv-menu-item.danger{color:#dc2626}",
      ".wcv-menu-item.danger:hover{background:#fef2f2}",
      ".wcv-menu-sep{height:1px;background:#ececef;margin:4px 0}",
      ".wcv-loading{padding:60px;text-align:center;color:#9aa0a6;font-family:ui-monospace,monospace;font-size:13px}",
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
      ".wcv-node.is-root.wcv-move-active{border:2px dashed #2563eb;border-left:3px solid #2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.12);cursor:grab}",
      ".wcv-move-bar{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e2e6;border-radius:10px;padding:8px 12px 8px 14px;box-shadow:0 8px 32px rgba(0,0,0,.10);z-index:30;font-family:inherit}",
      ".wcv-move-dot{width:8px;height:8px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}",
      ".wcv-move-label{font-size:12.5px;color:#0f172a;font-weight:500}",
      ".wcv-move-btn{border:1px solid #d9dbe0;background:#fff;color:#334155;font-size:12px;font-weight:500;padding:5px 12px;border-radius:6px;cursor:pointer;font-family:inherit}",
      ".wcv-move-btn:hover{background:#f1f3f4;color:#0f172a}",
      ".wcv-move-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}",
      ".wcv-move-btn.primary:hover{background:#1d4ed8}",
      ".wcv-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:4000;display:grid;place-items:center;backdrop-filter:blur(2px)}",
      ".wcv-modal{background:#fff;border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.25);min-width:360px;max-width:520px;padding:20px;font-family:inherit;color:#0f172a}",
      ".wcv-modal-title{font-size:14.5px;font-weight:600;margin-bottom:8px;letter-spacing:-.005em}",
      ".wcv-modal-body{font-size:13px;color:#334155;line-height:1.55;margin-bottom:16px;word-break:break-word}",
      ".wcv-modal-body b{color:#0f172a;font-weight:600;font-family:ui-monospace,monospace;font-size:12.5px}",
      ".wcv-modal-remember{display:flex;gap:8px;align-items:center;font-size:12px;color:#475569;margin-bottom:16px;cursor:pointer;user-select:none}",
      ".wcv-modal-remember input{margin:0;cursor:pointer}",
      ".wcv-modal-actions{display:flex;gap:8px;justify-content:flex-end}",
      ".wcv-modal-btn{border:1px solid #d9dbe0;background:#fff;color:#334155;font-size:12.5px;font-weight:500;padding:7px 14px;border-radius:6px;cursor:pointer;font-family:inherit}",
      ".wcv-modal-btn:hover{background:#f1f3f4;color:#0f172a}",
      ".wcv-modal-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}",
      ".wcv-modal-btn.primary:hover{background:#1d4ed8}",
      ".wcv-folder-picker{min-width:420px;max-width:560px;display:flex;flex-direction:column;gap:10px;max-height:70vh}",
      ".wcv-folder-search{width:100%;border:1px solid #d9dbe0;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none}",
      ".wcv-folder-search:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}",
      ".wcv-folder-list{flex:1;overflow:auto;border:1px solid #e2e2e6;border-radius:8px;min-height:180px}",
      ".wcv-folder-row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;text-align:left;padding:9px 12px;background:transparent;border:none;border-bottom:1px solid #f1f3f4;cursor:pointer;font-family:inherit}",
      ".wcv-folder-row:last-child{border-bottom:none}",
      ".wcv-folder-row:hover{background:#f1f3f4}",
      ".wcv-folder-name{font-size:13px;color:#0f172a;font-weight:500}",
      ".wcv-folder-path{font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".wcv-folder-empty{padding:24px;text-align:center;color:#94a3b8;font-size:12.5px}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function drawEdges() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.svg) return;
    S.svg.innerHTML = "";
    const DETACHED = window.CanvasParts.Layout.DETACHED;
    for (const n of S.nodes) {
      if (n.parent === DETACHED) continue; // floating, no edge
      const parentPos = S.pos.get(n.parent || "");
      const selfPos = S.pos.get(n.path);
      if (!parentPos || !selfPos) continue;
      const x1 = parentPos.x + window.CanvasParts.Layout.NODE_W + SVG_OFF;
      const y1 = parentPos.y + window.CanvasParts.Layout.NODE_H / 2 + SVG_OFF;
      const x2 = selfPos.x + SVG_OFF;
      const y2 = selfPos.y + window.CanvasParts.Layout.NODE_H / 2 + SVG_OFF;
      const dx = Math.max(30, Math.abs(x2 - x1) * 0.5);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(100,116,139,0.45)");
      path.setAttribute("stroke-width", "1.5");
      S.svg.appendChild(path);
    }
  }

  function applyTransform() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.viewport) return;
    S.viewport.style.transform = "translate(" + S.panX + "px," + S.panY + "px) scale(" + S.zoom + ")";
    if (S.hudZ) S.hudZ.textContent = Math.round(S.zoom * 100) + "%";
    window.CanvasParts.State.persistPanZoom();
  }

  function renderNodeEl(n, p) {
    const S = window.CanvasParts.State.get();
    const F = window.CanvasParts.Files;
    const el = document.createElement("div");
    const catClass = n.catClass ? " cat-" + n.catClass : "";
    const detachedClass = n.isDetached ? " k-detached" : "";
    el.className = "wcv-node k-" + (n.category || "unknown") + (n.isRoot ? " is-root" : "") + catClass + detachedClass;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.style.width = window.CanvasParts.Layout.NODE_W + "px";
    el.style.position = "absolute";
    el.dataset.path = n.path;

    let nameHtml;
    if (n.dir) nameHtml = F.esc(n.name) + (n.isRoot ? "" : "/");
    else {
      const ext = F.extOf(n.name);
      if (ext) {
        const base = n.name.slice(0, n.name.length - ext.length);
        nameHtml = F.esc(base) + '<span class="ext">' + F.esc(ext) + '</span>';
      } else nameHtml = F.esc(n.name);
    }

    const hasChildren = S.nodes.some((x) => x.parent === n.path);
    const collapsed = S.collapsed.has(n.path);
    const isEmpty = n.dir && !hasChildren;

    const caretHtml = n.dir
      ? '<span class="wcv-caret' + (isEmpty ? " wcv-caret-empty" : "") + '">' + (collapsed ? "\u25b6" : "\u25bc") + '</span>'
      : '';

    el.innerHTML =
      caretHtml +
      '<div class="wcv-name">' + nameHtml + '</div>' +
      '<div class="wcv-sub"><span class="wcv-badge k-' + n.category + '">' +
      (n.isRoot ? "workspace" : (KIND[n.category] || "unknown")) + '</span>' +
      (n.sub ? '<span class="wcv-meta">' + F.esc(n.sub) + '</span>' : '') + '</div>';

    if (n.dir) el.classList.add("has-caret");

    const caretEl = el.querySelector(".wcv-caret");
    if (caretEl && !isEmpty) {
      caretEl.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
      caretEl.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.CanvasParts.Collapse.toggle(n.path);
      });
    }

    window.CanvasParts.Drag.attach(el, n);

    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.CanvasParts.ContextMenu.show(ev.clientX, ev.clientY, n);
    });

    return el;
  }

  function relayout() {
    const S = window.CanvasParts.State.get();
    const L = window.CanvasParts.Layout;
    const { pos, width, height } = L.buildLayout(S.nodes, S.collapsed);
    L.applyManualDeltas(S, pos);
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
    window.CanvasParts.State.persistCollapsed();
  }

  function rebuild() {
    const S = window.CanvasParts.State.get();
    const L = window.CanvasParts.Layout;
    while (S.stage.firstChild) S.stage.removeChild(S.stage.firstChild);
    const withRoot = [S.rootNode, ...S.nodes];
    const lay = L.buildLayout(S.nodes, S.collapsed);
    L.applyManualDeltas(S, lay.pos);
    S.pos = lay.pos;
    S.width = lay.width;
    S.height = lay.height;
    S.stage.style.width = lay.width + "px";
    S.stage.style.height = lay.height + "px";
    S.viewport.style.width = lay.width + "px";
    S.viewport.style.height = lay.height + "px";
    for (const n of withRoot) {
      const p = lay.pos.get(n.path);
      if (!p) continue;
      S.stage.appendChild(renderNodeEl(n, p));
    }
    drawEdges();
  }

  return { injectStyles, drawEdges, applyTransform, renderNodeEl, relayout, rebuild, SVG_OFF, SVG_W };
})();
