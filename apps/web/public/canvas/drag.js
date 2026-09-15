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

      const descendants = L.collectDescendants(S, n.path);
      const startPos = new Map();
      for (const path of descendants) {
        const cur = S.pos.get(path);
        if (cur) startPos.set(path, { x: cur.x, y: cur.y });
      }
      const startMouseX = ev.clientX;
      const startMouseY = ev.clientY;
      const origDelta = S.manualDelta.get(n.path) || { dx: 0, dy: 0 };
      let moved = false;
      let totalDx = 0, totalDy = 0;

      const onMove = (e) => {
        totalDx = (e.clientX - startMouseX) / S.zoom;
        totalDy = (e.clientY - startMouseY) / S.zoom;
        if (!moved && (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5)) moved = true;
        for (const [path, orig] of startPos.entries()) {
          const cur = S.pos.get(path);
          if (!cur) continue;
          cur.x = orig.x + totalDx;
          cur.y = orig.y + totalDy;
          const el2 = Array.from(S.stage.children).find((c) => c.dataset.path === path);
          if (el2) { el2.style.left = cur.x + "px"; el2.style.top = cur.y + "px"; }
        }
        R.drawEdges();
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          S.manualDelta.set(n.path, { dx: origDelta.dx + totalDx, dy: origDelta.dy + totalDy });
          window.CanvasParts.State.persistManualDelta();
        } else {
          if (n.dir) {
            if (S.nodes.some((x) => x.parent === n.path)) window.CanvasParts.Collapse.toggle(n.path);
          } else {
            // Click = preview in AI drawer. Never call openFile here — that
            // would unmount the canvas. Right-click "Open in editor" is the
            // only path to Monaco.
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
