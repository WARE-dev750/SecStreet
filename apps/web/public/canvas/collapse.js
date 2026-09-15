// collapse.js — expand/collapse of one folder at a time.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Collapse = (function () {
  function toggle(path) {
    const S = window.CanvasParts.State.get();
    if (S.collapsed.has(path)) S.collapsed.delete(path);
    else S.collapsed.add(path);
    window.CanvasParts.Render.relayout();
  }

  function closeAll() {
    const S = window.CanvasParts.State.get();
    S.collapsed.clear();
    for (const n of S.nodes) {
      if (n.dir && S.nodes.some((x) => x.parent === n.path)) S.collapsed.add(n.path);
    }
    window.CanvasParts.State.persistCollapsed();
    window.CanvasParts.Render.relayout();
  }

  function openAll() {
    const S = window.CanvasParts.State.get();
    S.collapsed.clear();
    window.CanvasParts.State.persistCollapsed();
    window.CanvasParts.Render.relayout();
  }

  return { toggle, closeAll, openAll };
})();
