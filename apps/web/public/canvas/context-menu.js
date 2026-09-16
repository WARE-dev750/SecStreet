// context-menu.js — right-click menu, per node type.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.ContextMenu = (function () {
  function hide() {
    const S = window.CanvasParts.State.get();
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

  function show(x, y, node) {
    hide();
    const S = window.CanvasParts.State.get();
    const menu = document.createElement("div");
    menu.className = "wcv-menu";
    const items = [];

    if (node.isRoot) {
      const moving = window.CanvasParts.RootMove.isActive();
      if (moving) {
        items.push({ label: "Done moving", action: () => window.CanvasParts.RootMove.exit(true) });
        items.push({ label: "Cancel move", action: () => window.CanvasParts.RootMove.exit(false) });
      } else {
        items.push({ label: "Move workspace\u2026", action: () => window.CanvasParts.RootMove.enter() });
      }
      items.push({ label: "Fit to view", action: () => window.CanvasParts.Panzoom.fitToView() });
      if (S.collapsed.size > 0) {
        items.push({ label: "Open everything", action: () => window.CanvasParts.Collapse.openAll() });
      } else {
        items.push({ label: "Close everything", action: () => window.CanvasParts.Collapse.closeAll() });
      }
      const detachedCount = window.CanvasParts.Reparent ? window.CanvasParts.Reparent.count() : 0;
      if (detachedCount > 0) {
        items.push({ label: "Return all detached (" + detachedCount + ")", action: () => window.CanvasParts.Reparent.resetAll() });
      }
      if (S.manualDelta && S.manualDelta.size > 0) {
        items.push({
          label: "Reset layout positions (" + S.manualDelta.size + ")",
          action: () => {
            S.manualDelta.clear();
            window.CanvasParts.State.persistManualDelta();
            window.CanvasParts.Render.relayout();
            window.CanvasParts.Panzoom.fitToView();
          }
        });
      }
    } else if (node.dir) {
      const hasChildren = S.nodes.some((x) => x.parent === node.path);
      if (hasChildren) {
        if (S.collapsed.has(node.path)) items.push({ label: "Open folder", action: () => window.CanvasParts.Collapse.toggle(node.path) });
        else items.push({ label: "Close folder", action: () => window.CanvasParts.Collapse.toggle(node.path) });
      }
      if (node.isDetached) {
        // Detached pseudo-folder itself — offer to reset everything inside
        items.push({ label: "Return all to original folders", action: () => window.CanvasParts.Reparent.resetAll() });
      } else {
        const isDetached = window.CanvasParts.Reparent.isDetached(node.path);
        if (isDetached) {
          items.push({ label: "Return to original folder", action: () => window.CanvasParts.Reparent.reset(node.path) });
        } else {
          items.push({ label: "Detach from folder", action: () => window.CanvasParts.Reparent.detach(node.path) });
        }
      }
      items.push({ label: "Copy path", action: () => navigator.clipboard.writeText(node.path) });
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
    } else {
      const isDetached = window.CanvasParts.Reparent.isDetached(node.path);
      items.push({ label: "Open preview", action: () => window.CanvasParts.AI.openDrawer(node, "") });
      items.push({ label: "Open in editor", action: () => openInEditor(node.path) });
      items.push({ label: "Explain with AI", action: () => window.CanvasParts.AI.openDrawer(node, "Explain what this file does in one short paragraph. Then list its main functions, exports, or entry points. Be concrete.") });
      if (isDetached) {
        items.push({ label: "Return to original folder", action: () => window.CanvasParts.Reparent.reset(node.path) });
      } else {
        items.push({ label: "Detach from folder", action: () => window.CanvasParts.Reparent.detach(node.path) });
      }
      items.push({ label: "Copy path", action: () => navigator.clipboard.writeText(node.path) });
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
    }

    for (const it of items) {
      const row = document.createElement("button");
      row.className = "wcv-menu-item";
      row.textContent = it.label;
      row.addEventListener("click", () => { hide(); it.action(); });
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

  return { show, hide };
})();
