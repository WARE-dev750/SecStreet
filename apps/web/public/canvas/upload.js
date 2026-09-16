// upload.js — drop files from the OS onto a folder node (or canvas = root).
// Posts to /api/files/upload, then refreshes the canvas.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Upload = (function () {
  const MAX_BYTES = 1024 * 1024; // 1MB per file for v1 (text only)

  function findDropTarget(e) {
    // If the drop landed on a node, use it (folder → itself, file → parent).
    const el = e.target && e.target.closest ? e.target.closest(".wcv-node") : null;
    if (!el) return "";
    const S = window.CanvasParts.State.get();
    if (!S) return "";
    const path = el.dataset.path || "";
    const node = S.nodes.find((n) => n.path === path);
    if (!node) return "";
    if (node.dir) return node.path;
    // drop on a file → go into its parent folder
    const idx = node.path.lastIndexOf("/");
    return idx === -1 ? "" : node.path.slice(0, idx);
  }

  function highlightTarget(on, target) {
    const S = window.CanvasParts.State.get();
    if (!S || !S.stage) return;
    for (const el of S.stage.children) {
      const path = el.dataset.path || "";
      el.classList.toggle("wcv-drop-target", on && (path === target || (target === "" && path === "")));
    }
  }

  function readFile(file) {
    return new Promise((resolve) => {
      if (file.size > MAX_BYTES) { resolve({ skip: true, name: file.name, reason: "too large" }); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, content: String(reader.result || "") });
      reader.onerror = () => resolve({ skip: true, name: file.name, reason: "read error" });
      reader.readAsText(file);
    });
  }

  async function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const S = window.CanvasParts.State.get();
    if (!S) return;
    highlightTarget(false, "");

    const target = findDropTarget(e);
    const list = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (!list.length) return;

    const read = await Promise.all(list.map(readFile));
    const files = read.filter((f) => !f.skip);
    const skipped = read.filter((f) => f.skip);

    if (!files.length) {
      alert("Nothing to upload. " + skipped.map((s) => s.name + " (" + s.reason + ")").join(", "));
      return;
    }

    try {
      const r = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, files })
      });
      const data = await r.json();
      if (!data.ok) { alert("Upload failed: " + (data.error || "unknown")); return; }
      if (data.written.length) {
        console.log("[upload] wrote:", data.written.join(", "));
      }
      await refresh();
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
  }

  async function refresh() {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    const Files = window.CanvasParts.Files;
    const Skills = window.CanvasParts.Skills;
    const fresh = await Files.loadAll();
    S.allNodes = fresh;
    S.nodes = S.viewMode === "skills" ? Skills.transformToSkillView(fresh) : fresh;
    window.CanvasParts.State.pruneManualDelta();
    window.CanvasParts.Connections.prune();
    window.CanvasParts.Render.rebuild();
  }

  function attach(wrap) {
    let rafId = 0;
    wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const target = findDropTarget(e);
        highlightTarget(true, target);
      });
    });
    wrap.addEventListener("dragleave", (e) => {
      // Only clear if we actually left the wrap
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      highlightTarget(false, "");
    });
    wrap.addEventListener("drop", onDrop);
  }

  return { attach, refresh };
})();
