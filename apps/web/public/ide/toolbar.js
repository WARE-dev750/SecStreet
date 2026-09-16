// toolbar.js — inject file-operation buttons into the existing topbar.
window.IDEToolbar = (function () {

  function btn(id, icon, label, onClick) {
    const b = document.createElement("button");
    b.className = "topbar-btn";
    b.id = id;
    b.title = label;
    b.innerHTML = '<i class="bi ' + icon + '" aria-hidden="true"></i><span>' + label + '</span>';
    b.addEventListener("click", onClick);
    return b;
  }

  function attach() {
    const nav = document.querySelector(".topbar-actions") || document.querySelector(".navbar .ms-auto");
    if (!nav) return;
    if (document.getElementById("btnNewFile")) return;

    // Where's the explorer root? Use "" (project root) as default target.
    const newFile = btn("btnNewFile", "bi-file-earmark-plus", "New file", () => {
      const selected = currentExplorerDir();
      openNewFileIn(selected);
    });
    const newFolder = btn("btnNewFolder", "bi-folder-plus", "New folder", () => {
      const selected = currentExplorerDir();
      openNewFolderIn(selected);
    });

    nav.insertBefore(newFolder, nav.firstChild);
    nav.insertBefore(newFile, nav.firstChild);
  }

  // If a tree-row folder is selected, use its path; else root.
  function currentExplorerDir() {
    try {
      const active = document.querySelector("#sidebarBody .tree-row.active");
      if (active && active.dataset.dir === "1") return active.dataset.path || "";
      if (active && active.dataset.dir !== "1") {
        const p = active.dataset.path || "";
        const i = p.lastIndexOf("/");
        return i === -1 ? "" : p.slice(0, i);
      }
    } catch {}
    return "";
  }

  function openNewFileIn(parentPath) {
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

  function openNewFolderIn(parentPath) {
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

  return { attach };
})();
