// detach.js — detach a node from its folder. Node becomes free-floating.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Detach = (function () {
  function detach(path) {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    const DETACHED = window.CanvasParts.Layout.DETACHED;
    if (S.reparent.get(path) === DETACHED) return; // already
    S.reparent.set(path, DETACHED);
    window.CanvasParts.Reparent.persist();
    window.CanvasParts.Reparent.refresh();
  }
  return { detach };
})();
