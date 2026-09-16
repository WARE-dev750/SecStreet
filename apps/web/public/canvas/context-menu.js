// context-menu.js — right-click menu on canvas nodes. Full file ops.
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

  function parentOf(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i);
  }
  function basenameOf(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? path : path.slice(i + 1);
  }

  // File-action bridge: after any file op, refresh canvas node list.
  async function refresh() {
    await window.CanvasParts.Upload.refresh();
  }

  function actionNewFile(parentPath) {
    window.IDEPrompt.show({
      title: "New file" + (parentPath ? " in " + parentPath : ""),
      placeholder: "name.ext",
      confirmLabel: "Create",
      validate: (v) => !v.includes("/") && !v.includes("\\") && !v.startsWith("."),
      onConfirm: async (name) => {
        try {
          await window.IDEFileActions.createFile(parentPath, name);
          await refresh();
        } catch (e) { alert("Create failed: " + e.message); }
      }
    });
  }

  function actionNewFolder(parentPath) {
    window.IDEPrompt.show({
      title: "New folder" + (parentPath ? " in " + parentPath : ""),
      placeholder: "folder-name",
      confirmLabel: "Create",
      validate: (v) => !v.includes("/") && !v.includes("\\") && !v.startsWith("."),
      onConfirm: async (name) => {
        try {
          await window.IDEFileActions.createFolder(parentPath, name);
          await refresh();
        } catch (e) { alert("Create failed: " + e.message); }
      }
    });
  }

  function actionRename(path) {
    window.IDEPrompt.show({
      title: "Rename",
      initial: basenameOf(path),
      confirmLabel: "Rename",
      validate: (v) => !v.includes("/") && !v.includes("\\") && !v.startsWith("."),
      onConfirm: async (newName) => {
        try {
          await window.IDEFileActions.rename(path, newName);
          await refresh();
        } catch (e) { alert("Rename failed: " + e.message); }
      }
    });
  }

  async function actionDelete(path, isDir) {
    if (!confirm("Delete " + path + (isDir ? " and its contents?" : "?"))) return;
    try {
      await window.IDEFileActions.remove(path);
      await refresh();
    } catch (e) { alert("Delete failed: " + e.message); }
  }

  async function actionDuplicate(path) {
    try {
      await window.IDEFileActions.duplicate(path);
      await refresh();
    } catch (e) { alert("Duplicate failed: " + e.message); }
  }

  function actionCopy(path) { window.SecClipboard.set([path], "copy"); }
  function actionCut(path) { window.SecClipboard.set([path], "cut"); }

  async function actionPaste(targetDirPath) {
    const clip = window.SecClipboard.get();
    if (!clip.items.length) return;
    for (const src of clip.items) {
      const name = basenameOf(src);
      const dest = targetDirPath ? targetDirPath + "/" + name : name;
      try {
        if (clip.mode === "cut") {
          await window.IDEFileActions.move(src, dest);
        } else {
          const r = await fetch("/api/file?path=" + encodeURIComponent(src));
          if (!r.ok) continue;
          const data = await r.json();
          const content = typeof data.content === "string" ? data.content : "";
          let finalDest = dest;
          if (src === dest) {
            const dot = name.lastIndexOf(".");
            const newName = dot > 0 ? name.slice(0, dot) + " copy" + name.slice(dot) : name + " copy";
            finalDest = targetDirPath ? targetDirPath + "/" + newName : newName;
          }
          await fetch("/api/file?path=" + encodeURIComponent(finalDest), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content })
          });
        }
      } catch (e) { alert("Paste failed: " + e.message); }
    }
    if (clip.mode === "cut") window.SecClipboard.clear();
    await refresh();
  }

  function actionCopyPath(path) {
    try { navigator.clipboard.writeText(path); } catch {}
  }

  function show(x, y, node) {
    hide();
    const S = window.CanvasParts.State.get();
    const menu = document.createElement("div");
    menu.className = "wcv-menu";
    const items = [];
    const clip = window.SecClipboard.get();
    const canPaste = clip.items.length > 0;

    if (node.isRoot) {
      const moving = window.CanvasParts.RootMove.isActive();
      if (moving) {
        items.push({ label: "Done moving", action: () => window.CanvasParts.RootMove.exit(true) });
        items.push({ label: "Cancel move", action: () => window.CanvasParts.RootMove.exit(false) });
      } else {
        items.push({ label: "Move workspace\u2026", action: () => window.CanvasParts.RootMove.enter() });
      }
      items.push({ label: "Fit to view", action: () => window.CanvasParts.Panzoom.fitToView() });
      items.push({ separator: true });
      items.push({ label: "New file", action: () => actionNewFile("") });
      items.push({ label: "New folder", action: () => actionNewFolder("") });
      items.push({ label: "Paste into root", disabled: !canPaste, action: () => actionPaste("") });
      items.push({ separator: true });
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
      items.push({ label: "New file in " + node.name, action: () => actionNewFile(node.path) });
      items.push({ label: "New folder in " + node.name, action: () => actionNewFolder(node.path) });
      items.push({ separator: true });
      items.push({ label: "Cut", action: () => actionCut(node.path) });
      items.push({ label: "Copy", action: () => actionCopy(node.path) });
      items.push({ label: "Paste into " + node.name, disabled: !canPaste, action: () => actionPaste(node.path) });
      items.push({ separator: true });
      items.push({ label: "Rename\u2026", action: () => actionRename(node.path) });
      items.push({ label: "Duplicate", action: () => actionDuplicate(node.path) });
      items.push({ label: "Copy path", action: () => actionCopyPath(node.path) });
      items.push({ separator: true });
      if (window.CanvasParts.Reparent.isDetached(node.path)) {
        items.push({ label: "Attach to folder\u2026", action: () => window.CanvasParts.Attach.attachViaPicker(node.path) });
      } else {
        items.push({ label: "Detach from folder", action: () => window.CanvasParts.Detach.detach(node.path) });
      }
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
      items.push({ separator: true });
      items.push({ label: "Delete", danger: true, action: () => actionDelete(node.path, true) });
    } else {
      const isDetached = window.CanvasParts.Reparent.isDetached(node.path);
      items.push({ label: "Open preview", action: () => window.CanvasParts.AI.openDrawer(node, "") });
      items.push({ label: "Open in editor", action: () => openInEditor(node.path) });
      items.push({ separator: true });
      items.push({ label: "Cut", action: () => actionCut(node.path) });
      items.push({ label: "Copy", action: () => actionCopy(node.path) });
      items.push({ label: "Paste into " + (parentOf(node.path) || "root"), disabled: !canPaste, action: () => actionPaste(parentOf(node.path)) });
      items.push({ separator: true });
      items.push({ label: "Rename\u2026", action: () => actionRename(node.path) });
      items.push({ label: "Duplicate", action: () => actionDuplicate(node.path) });
      items.push({ label: "Copy path", action: () => actionCopyPath(node.path) });
      items.push({ separator: true });
      if (isDetached) {
        items.push({ label: "Attach to folder\u2026", action: () => window.CanvasParts.Attach.attachViaPicker(node.path) });
      } else {
        items.push({ label: "Detach from folder", action: () => window.CanvasParts.Detach.detach(node.path) });
      }
      items.push({ label: "Reveal in Explorer", action: () => revealInExplorer(node.path) });
      items.push({ separator: true });
      items.push({ label: "Delete", danger: true, action: () => actionDelete(node.path, false) });
    }

    for (const it of items) {
      if (it.separator) {
        const sep = document.createElement("div");
        sep.className = "wcv-menu-sep";
        menu.appendChild(sep);
        continue;
      }
      const row = document.createElement("button");
      row.className = "wcv-menu-item" + (it.danger ? " danger" : "");
      row.textContent = it.label;
      if (it.disabled) { row.disabled = true; row.style.opacity = "0.4"; row.style.cursor = "default"; }
      row.addEventListener("click", () => { if (it.disabled) return; hide(); it.action(); });
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
