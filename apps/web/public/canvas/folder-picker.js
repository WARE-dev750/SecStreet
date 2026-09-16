// folder-picker.js — modal listing all folders. Calls onPick(folderPath).
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.FolderPicker = (function () {
  let current = null;

  function hide() {
    if (current) { current.remove(); current = null; }
  }

  function show(onPick) {
    hide();
    const S = window.CanvasParts.State.get();
    const F = window.CanvasParts.Files;
    const folders = S.nodes.filter((n) => n.dir).sort((a, b) => a.path.localeCompare(b.path));
    // Root is a valid target too
    const entries = [{ path: "", name: "(project root)" }].concat(folders.map((f) => ({ path: f.path, name: f.name })));

    const backdrop = document.createElement("div");
    backdrop.className = "wcv-modal-backdrop";
    const dialog = document.createElement("div");
    dialog.className = "wcv-modal wcv-folder-picker";
    dialog.innerHTML =
      '<div class="wcv-modal-title">Attach to folder</div>' +
      '<input class="wcv-folder-search" id="wcvFolderSearch" placeholder="Filter folders\u2026" autocomplete="off">' +
      '<div class="wcv-folder-list" id="wcvFolderList"></div>' +
      '<div class="wcv-modal-actions"><button class="wcv-modal-btn" data-act="cancel">Cancel</button></div>';
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    current = backdrop;

    const list = dialog.querySelector("#wcvFolderList");
    const search = dialog.querySelector("#wcvFolderSearch");
    function render(q) {
      const lq = (q || "").toLowerCase();
      const filtered = entries.filter((e) => !lq || e.name.toLowerCase().includes(lq) || e.path.toLowerCase().includes(lq));
      list.innerHTML = filtered.length
        ? filtered.map((e) =>
            '<button class="wcv-folder-row" data-path="' + F.esc(e.path) + '">' +
              '<span class="wcv-folder-name">' + F.esc(e.name) + '</span>' +
              (e.path ? '<span class="wcv-folder-path">' + F.esc(e.path) + '</span>' : '') +
            '</button>'
          ).join("")
        : '<div class="wcv-folder-empty">No matches</div>';
      for (const row of list.querySelectorAll(".wcv-folder-row")) {
        row.addEventListener("click", () => {
          const path = row.dataset.path;
          hide();
          onPick(path);
        });
      }
    }
    render("");
    search.addEventListener("input", () => render(search.value));
    setTimeout(() => search.focus(), 80);

    dialog.addEventListener("click", (e) => {
      if (e.target.dataset.act === "cancel") hide();
    });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) hide(); });
    window.addEventListener("keydown", function onKey(e) {
      if (!current) { window.removeEventListener("keydown", onKey); return; }
      if (e.key === "Escape") { hide(); window.removeEventListener("keydown", onKey); }
    });
  }

  return { show, hide };
})();
