// reparent.js — detach a node from its folder, reattach it elsewhere.
//
// Data model: S.reparent = Map<path, newParentPath>. Persisted per view.
// Special value "#detached" means "no folder, floating".
// A synthetic "#detached" folder node is added to S.nodes when needed so
// detached items have a place to render.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Reparent = (function () {
  const DETACHED = "#detached";

  function load(viewMode) {
    const key = "secstreet.canvas.reparent." + (viewMode || "files");
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const m = new Map();
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string") m.set(k, v);
        }
      }
      return m;
    } catch { return new Map(); }
  }

  function persist() {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    const key = "secstreet.canvas.reparent." + (S.viewMode || "files");
    const obj = {};
    for (const [k, v] of S.reparent.entries()) obj[k] = v;
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  function prune() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.reparent) return;
    const valid = new Set(S.allNodes.map((n) => n.path));
    let changed = false;
    for (const k of [...S.reparent.keys()]) {
      if (!valid.has(k)) { S.reparent.delete(k); changed = true; }
    }
    if (changed) persist();
  }

  // Apply reparent overrides to a node list. Sets parent = "#detached" on
  // detached nodes. Does NOT inject a fake folder — layout places those
  // nodes as free-floating, with no parent edge.
  function applyOverrides(baseNodes, reparent) {
    return baseNodes.map((n) => {
      const override = reparent.get(n.path);
      if (override !== undefined) return { ...n, parent: override };
      return n;
    });
  }

  function detach(path) {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    S.reparent.set(path, DETACHED);
    persist();
    refresh();
  }

  function reattach(path, targetFolder) {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    S.reparent.set(path, targetFolder || "");
    persist();
    refresh();
  }

  function reset(path) {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    S.reparent.delete(path);
    persist();
    refresh();
  }

  function resetAll() {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    S.reparent.clear();
    persist();
    refresh();
  }

  function isDetached(path) {
    const S = window.CanvasParts.State.get();
    return !!(S && S.reparent && S.reparent.get(path) === DETACHED);
  }

  function count() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.reparent) return 0;
    let n = 0;
    for (const v of S.reparent.values()) if (v === DETACHED) n++;
    return n;
  }

  // Rebuild S.nodes with overrides applied. Called after detach/attach and
  // after any node list reload.
  function refresh() {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    const Skills = window.CanvasParts.Skills;
    const base = S.viewMode === "skills" ? Skills.transformToSkillView(S.allNodes) : S.allNodes;
    S.nodes = applyOverrides(base, S.reparent);
    window.CanvasParts.State.pruneManualDelta();
    window.CanvasParts.Render.rebuild();
  }

  return { DETACHED, load, persist, prune, applyOverrides, detach, reattach, reset, resetAll, isDetached, count, refresh };
})();
