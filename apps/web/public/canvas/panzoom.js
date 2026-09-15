// panzoom.js — pan, zoom, HUD, fit-to-view.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Panzoom = (function () {
  function attach(wrap) {
    const S = window.CanvasParts.State.get();
    const R = window.CanvasParts.Render;

    let panning = false, sx = 0, sy = 0, opx = 0, opy = 0;
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".wcv-node") || e.target.closest(".wcv-hud") || e.target.closest(".wcv-menu") || e.target.closest(".wcv-toggle") || e.target.closest(".wcv-ai-drawer")) return;
      panning = true; sx = e.clientX; sy = e.clientY; opx = S.panX; opy = S.panY;
      wrap.classList.add("panning");
    };
    const onMove = (e) => {
      if (!panning) return;
      S.panX = opx + (e.clientX - sx);
      S.panY = opy + (e.clientY - sy);
      R.applyTransform();
    };
    const onUp = () => { if (panning) { panning = false; wrap.classList.remove("panning"); } };
    const onWheel = (e) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const oldZ = S.zoom;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZ = Math.max(0.1, Math.min(3, oldZ * factor));
      S.panX = mx - (mx - S.panX) * (newZ / oldZ);
      S.panY = my - (my - S.panY) * (newZ / oldZ);
      S.zoom = newZ;
      R.applyTransform();
    };
    wrap.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    S.listeners = { onMove, onUp, onDown, onWheel };
  }

  function zoomIn() { const S = window.CanvasParts.State.get(); S.zoom = Math.min(3, S.zoom * 1.2); window.CanvasParts.Render.applyTransform(); }
  function zoomOut() { const S = window.CanvasParts.State.get(); S.zoom = Math.max(0.1, S.zoom / 1.2); window.CanvasParts.Render.applyTransform(); }

  function fitToView() {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    const L = window.CanvasParts.Layout;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of S.pos.values()) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + L.NODE_W > maxX) maxX = p.x + L.NODE_W;
      if (p.y + L.NODE_H > maxY) maxY = p.y + L.NODE_H;
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = L.NODE_W; maxY = L.NODE_H; }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const rect = S.wrap.getBoundingClientRect();
    const z = Math.min((rect.width - 120) / w, (rect.height - 120) / h, 1.1);
    S.zoom = Math.max(0.1, z);
    S.panX = (rect.width - w * S.zoom) / 2 - minX * S.zoom;
    S.panY = (rect.height - h * S.zoom) / 2 - minY * S.zoom;
    window.CanvasParts.Render.applyTransform();
  }

  return { attach, zoomIn, zoomOut, fitToView };
})();
