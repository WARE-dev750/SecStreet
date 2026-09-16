// tree-context-menu.js — right-click menu + keyboard shortcuts on the file tree.
window.IDETreeContextMenu = (function () {
  let current = null;

  function hide() {
    if (current) { current.remove(); current = null; }
  }

  function show(x, y, items) {
    hide();
    const menu = document.createElement("div");
    menu.className = "ide-context-menu";
    for (const it of items) {
      if (it.separator) {
        const sep = document.createElement("div");
        sep.className = "ide-context-sep";
        menu.appendChild(sep);
        continue;
      }
      const row = document.createElement("button");
      row.className = "ide-context-item" + (it.danger ? " danger" : "");
      row.textContent = it.label;
      row.disabled = !!it.disabled;
      if (it.disabled) row.style.opacity = "0.4";
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (it.disabled) return;
        hide();
        try { it.action(); } catch (err) { alert(String(err.message || err)); }
      });
      menu.appendChild(row);
    }
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
    current = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + "px";
  }

  // ---- parent / basename helpers ----
  function parentOf(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i);
  }
  function basenameOf(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? path : path.slice(i + 1);
  }

  // ---- actions ----
  function actionNewFile(parentPath) {
    window.IDEPrompt.show({
      title: "New file" + (parentPath ? " in " + parentPath : ""),
      placeholder: "name.ext",
      confirmLabel: "Create",
      validate: (v) => !v.includes("/") && !v.includes("\\") && !v.startsWith("."),
      onConfirm: async (name) => {
        try {
          const full = await window.IDEFileActions.createFile(parentPath, name);
          if (typeof window.openFile === "function") window.openFile(full);
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
        try { await window.IDEFileActions.createFolder(parentPath, name); }
        catch (e) { alert("Create failed: " + e.message); }
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
        try { await window.IDEFileActions.rename(path, newName); }
        catch (e) { alert("Rename failed: " + e.message); }
      }
    });
  }

  async function actionDelete(path, isDir) {
    if (!confirm("Delete " + path + (isDir ? " and its contents?" : "?"))) return;
    try { await window.IDEFileActions.remove(path); }
    catch (e) { alert("Delete failed: " + e.message); }
  }

  async function actionDuplicate(path) {
    try { await window.IDEFileActions.duplicate(path); }
    catch (e) { alert("Duplicate failed: " + e.message); }
  }

  function actionCopy(path) {
    window.SecClipboard.set([path], "copy");
  }
  function actionCut(path) {
    window.SecClipboard.set([path], "cut");
  }

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
          // Copy: read then write
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
    await window.IDEFileActions.refreshTree();
  }

  function actionCopyPath(path) {
    try { navigator.clipboard.writeText(path); } catch {}
  }

  // ---- attach ----
  function attach() {
    const body = document.getElementById("sidebarBody");
    if (!body || body.dataset.ctxBound === "1") return;
    body.dataset.ctxBound = "1";

    body.addEventListener("contextmenu", (e) => {
      const row = e.target.closest && e.target.closest(".tree-row");
      e.preventDefault();
      e.stopPropagation();
      const clip = window.SecClipboard.get();
      const canPaste = clip.items.length > 0;

      if (!row) {
        show(e.clientX, e.clientY, [
          { label: "New file", action: () => actionNewFile("") },
          { label: "New folder", action: () => actionNewFolder("") },
          { separator: true },
          { label: "Paste", disabled: !canPaste, action: () => actionPaste("") }
        ]);
        return;
      }

      const path = row.dataset.path || "";
      const isDir = row.dataset.dir === "1";
      const name = basenameOf(path);
      const parent = parentOf(path);

      if (isDir) {
        show(e.clientX, e.clientY, [
          { label: "New file in " + name, action: () => actionNewFile(path) },
          { label: "New folder in " + name, action: () => actionNewFolder(path) },
          { separator: true },
          { label: "Cut", action: () => actionCut(path) },
          { label: "Copy", action: () => actionCopy(path) },
          { label: "Paste into " + name, disabled: !canPaste, action: () => actionPaste(path) },
          { separator: true },
          { label: "Rename\u2026", action: () => actionRename(path) },
          { label: "Duplicate", action: () => actionDuplicate(path) },
          { label: "Copy path", action: () => actionCopyPath(path) },
          { separator: true },
          { label: "Delete", danger: true, action: () => actionDelete(path, true) }
        ]);
      } else {
        show(e.clientX, e.clientY, [
          { label: "Open", action: () => { if (typeof window.openFile === "function") window.openFile(path); } },
          { separator: true },
          { label: "Cut", action: () => actionCut(path) },
          { label: "Copy", action: () => actionCopy(path) },
          { label: "Paste into " + (parent || "root"), disabled: !canPaste, action: () => actionPaste(parent) },
          { separator: true },
          { label: "Rename\u2026", action: () => actionRename(path) },
          { label: "Duplicate", action: () => actionDuplicate(path) },
          { label: "Copy path", action: () => actionCopyPath(path) },
          { separator: true },
          { label: "Delete", danger: true, action: () => actionDelete(path, false) }
        ]);
      }
    });

    // Close on outside click / escape
    document.addEventListener("mousedown", (e) => {
      if (current && !current.contains(e.target)) hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });

    // ---- keyboard shortcuts ----
    document.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Only when the file tree has focus or an active tree row exists
      const active = document.querySelector("#sidebarBody .tree-row.active");
      const selectedPath = active ? active.dataset.path : null;
      const isDir = active ? active.dataset.dir === "1" : false;

      if (mod && e.key === "c" && selectedPath) { e.preventDefault(); actionCutOrCopy(selectedPath, "copy"); return; }
      if (mod && e.key === "x" && selectedPath) { e.preventDefault(); actionCutOrCopy(selectedPath, "cut"); return; }
      if (mod && e.key === "v" && selectedPath) {
        e.preventDefault();
        const target = isDir ? selectedPath : parentOf(selectedPath);
        actionPaste(target);
        return;
      }
      if (e.key === "F2" && selectedPath) { e.preventDefault(); actionRename(selectedPath); return; }
      if (e.key === "Delete" && selectedPath) { e.preventDefault(); actionDelete(selectedPath, isDir); return; }
    });

    function actionCutOrCopy(path, mode) {
      if (mode === "cut") actionCut(path);
      else actionCopy(path);
    }
  }

  return { attach, show, hide };
})();
