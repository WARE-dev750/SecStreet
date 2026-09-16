// library-drop.js — accept library-panel capability drops onto the canvas.
//
// The library panel (app.js) sets dragstart data as text/plain with the
// capability name. Files dragged from the OS come through as Files, which
// upload.js already handles. This module filters on text/plain with no
// Files present, and installs the capability into the project.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.LibraryDrop = (function () {

  function isLibraryDrag(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    // If OS files are present, upload.js owns it.
    if (dt.types && Array.from(dt.types).includes("Files")) return false;
    // library panel uses text/plain
    if (!dt.types || !Array.from(dt.types).includes("text/plain")) return false;
    return true;
  }

  async function install(name) {
    const r = await fetch("/api/library/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "install failed");
    return data;
  }

  function attach(wrap) {
    wrap.addEventListener("dragover", (e) => {
      if (!isLibraryDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      wrap.classList.add("wcv-library-dragover");
    });

    wrap.addEventListener("dragleave", (e) => {
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      wrap.classList.remove("wcv-library-dragover");
    });

    wrap.addEventListener("drop", async (e) => {
      if (!isLibraryDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove("wcv-library-dragover");

      const name = e.dataTransfer.getData("text/plain");
      if (!name) return;

      try {
        const data = await install(name);
        console.log("[library-drop] installed", name, data);
        // Refresh canvas so the new files show up under capabilities/
        await window.CanvasParts.Upload.refresh();
      } catch (err) {
        alert("Install failed: " + err.message);
      }
    });
  }

  return { attach };
})();
