// drag.js — node drag + click dispatch.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Drag = (function () {
  function attach(el, n) {
    const S = window.CanvasParts.State.get();
    const L = window.CanvasParts.Layout;
    const R = window.CanvasParts.Render;

    el.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest(".wcv-caret")) return;
      ev.stopPropagation();

      const canDrag = !n.isRoot || window.CanvasParts.RootMove.isActive();

      const descendants = L.collectDescendants(S, n.path);
      const startPos = new Map();
      for (const path of descendants) {
        const cur = S.pos.get(path);
        if (cur) startPos.set(path, { x: cur.x, y: cur.y });
      }
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;
      const origDelta = S.manualDelta.get(n.path) || { dx: 0, dy: 0 };
      let attemptedDrag = false;
      let totalDx = 0, totalDy = 0;

      const onMove = (e) => {
        totalDx = (e.clientX - startMouseX) / S.zoom;
        totalDy = (e.clientY - startMouseY) / S.zoom;
        if (!attemptedDrag && (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5)) attemptedDrag = true;
        if (!canDrag) return;
        for (const [path, orig] of startPos.entries()) {
          const cur = S.pos.get(path);
          if (!cur) continue;
          cur.x = orig.x + totalDx;
          cur.y = orig.y + totalDy;
          const el2 = Array.from(S.stage.children).find((c) => c.dataset.path === path);
          if (el2) { el2.style.left = cur.x + "px"; el2.style.top = cur.y + "px"; }
        }
        R.drawEdges();
        // Folder hover highlight during drag
        const dropEl = document.elementFromPoint(e.clientX, e.clientY);
        const folderEl = dropEl && dropEl.closest ? dropEl.closest(".wcv-node") : null;
        const descendants = new Set(L.collectDescendants(S, n.path));
        for (const ch of S.stage.children) {
          const p2 = ch.dataset.path;
          const isFolder = S.nodes.find((x) => x.path === p2 && x.dir);
          const canDrop = folderEl && ch === folderEl && p2 !== n.path && !descendants.has(p2) && isFolder;
          ch.classList.toggle("wcv-drop-folder", canDrop);
        }
      };

      const onUp = (e) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Clear folder hover highlights from this drag
        for (const ch of S.stage.children) ch.classList.remove("wcv-drop-folder");

        if (attemptedDrag) {
          // Was the drop landing on a folder node other than the dragged one?
          const dropEl = document.elementFromPoint(e.clientX, e.clientY);
          const folderEl = dropEl && dropEl.closest ? dropEl.closest(".wcv-node") : null;
          if (folderEl && folderEl !== el) {
            const folderPath = folderEl.dataset.path;
            const folderNode = S.nodes.find((x) => x.path === folderPath);
            // Only re-parent if target is a folder and not a descendant of the
            // dragged node (would create a cycle).
            const descendants = new Set(L.collectDescendants(S, n.path));
            if (folderNode && folderNode.dir && !descendants.has(folderPath)) {
              // Re-parent instead of visual move.
              const target = folderPath === "" ? "" : folderPath;
              if (window.CanvasParts.Reparent) {
                window.CanvasParts.Reparent.reattach(n.path, target);
              }
              return;
            }
          }
          if (!canDrag) return; // root out of move mode: no-op
          S.manualDelta.set(n.path, { dx: origDelta.dx + totalDx, dy: origDelta.dy + totalDy });
          window.CanvasParts.State.persistManualDelta();
        } else {
          if (n.dir) {
            if (S.nodes.some((x) => x.parent === n.path)) window.CanvasParts.Collapse.toggle(n.path);
          } else {
            window.CanvasParts.AI.openDrawer(n, "");
          }
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      ev.preventDefault();
    });
  }

  return { attach };
})();
