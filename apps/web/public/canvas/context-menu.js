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
      items.push({ label: "Fit to view", action: () => window.CanvasParts.Panzoom.fitToView() });
      if (S.collapsed.size > 0) {
        items.push({ label: "Open everything", action: () => window.CanvasParts.Collapse.openAll() });
      } else {
        items.push({ label: "Close everything", action: () => window.CanvasParts.Collapse.closeAll() });
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
      items.push({ label: "Copy path", action: () => navigator.clipboard.writeText(node.path) });
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
    } else {
      items.push({ label: "Preview in drawer", action: () => window.CanvasParts.AI.openDrawer(node, "") });
      items.push({ label: "Open in editor", action: () => openInEditor(node.path) });
      items.push({ label: "Explain with AI", action: () => window.CanvasParts.AI.openDrawer(node, "Explain what this file does in one short paragraph. Then list its main functions, exports, or entry points. Be concrete.") });
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
