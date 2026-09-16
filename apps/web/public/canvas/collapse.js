// collapse.js — expand/collapse of one folder at a time.
//
// Collapse changes WHICH nodes are visible. That means the set of DOM
// elements needed changes. So this module calls Render.rebuild(), never
// Render.relayout(). relayout only repositions existing elements; it
// cannot create the elements that become visible when a folder opens.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Collapse = (function () {
  function toggle(path) {
    const S = window.CanvasParts.State.get();
    if (S.collapsed.has(path)) S.collapsed.delete(path);
    else S.collapsed.add(path);
    window.CanvasParts.State.persistCollapsed();
    window.CanvasParts.Render.rebuild();
  }

  function closeAll() {
    const S = window.CanvasParts.State.get();
    S.collapsed.clear();
    for (const n of S.nodes) {
      if (n.dir && S.nodes.some((x) => x.parent === n.path)) S.collapsed.add(n.path);
    }
    window.CanvasParts.State.persistCollapsed();
    window.CanvasParts.Render.rebuild();
  }

  function openAll() {
    const S = window.CanvasParts.State.get();
    S.collapsed.clear();
    window.CanvasParts.State.persistCollapsed();
    window.CanvasParts.Render.rebuild();
  }

  return { toggle, closeAll, openAll };
})();
