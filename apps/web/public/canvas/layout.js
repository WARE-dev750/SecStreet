// layout.js — pure layout math. No DOM.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Layout = (function () {
  const NODE_W = 220, NODE_H = 54;
  const GAP_X = 60, GAP_Y = 14, PAD = 40;

  const DETACHED = "#detached";

  function buildLayout(nodes, collapsed) {
    // Split floating nodes from tree nodes.
    const floating = [];
    const treeNodes = [];
    for (const n of nodes) {
      if (n.parent === DETACHED) floating.push(n);
      else treeNodes.push(n);
    }

    const byParent = new Map();
    for (const n of treeNodes) {
      const p = n.parent || "";
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(n);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)));
    }
    function childrenOf(path) {
      if (collapsed.has(path)) return [];
      return byParent.get(path) || [];
    }
    const heightCache = new Map();
    function height(path) {
      if (heightCache.has(path)) return heightCache.get(path);
      const kids = childrenOf(path);
      if (kids.length === 0) { heightCache.set(path, NODE_H); return NODE_H; }
      let total = 0;
      for (const c of kids) total += height(c.path) + GAP_Y;
      total -= GAP_Y;
      const h = Math.max(NODE_H, total);
      heightCache.set(path, h);
      return h;
    }
    const pos = new Map();
    function place(path, x, y) {
      const h = height(path);
      pos.set(path, { x, y: y + (h - NODE_H) / 2 });
      let cy = y;
      for (const c of childrenOf(path)) {
        const ch = height(c.path);
        place(c.path, x + NODE_W + GAP_X, cy);
        cy += ch + GAP_Y;
      }
    }
    place("", PAD, PAD);
    let maxX = 0, maxY = 0;
    for (const p of pos.values()) {
      if (p.x + NODE_W > maxX) maxX = p.x + NODE_W;
      if (p.y + NODE_H > maxY) maxY = p.y + NODE_H;
    }

    // Place floating nodes in a row below the tree, no parent, no edge.
    if (floating.length) {
      const startY = (maxY || PAD) + 100;
      let fx = PAD;
      let fy = startY;
      const perRow = 5;
      let i = 0;
      for (const f of floating) {
        pos.set(f.path, { x: fx, y: fy });
        i++;
        if (i % perRow === 0) { fx = PAD; fy += NODE_H + GAP_Y * 2; }
        else fx += NODE_W + GAP_X;
      }
      maxX = Math.max(maxX, PAD + perRow * (NODE_W + GAP_X));
      maxY = Math.max(maxY, fy + NODE_H);
    }

    return { pos, width: maxX + PAD, height: maxY + PAD };
  }

  // Apply S.manualDelta ({dx,dy} per node) hierarchically to a fresh pos map.
  function applyManualDeltas(S, pos) {
    if (!S || !S.manualDelta || S.manualDelta.size === 0) return;
    const parentOf = new Map();
    for (const n of S.nodes) parentOf.set(n.path, n.parent || "");
    parentOf.set("", "");
    parentOf.set(DETACHED, DETACHED);
    const cache = new Map();
    function cumDelta(path) {
      if (cache.has(path)) return cache.get(path);
      let dx = 0, dy = 0;
      const own = S.manualDelta.get(path);
      if (own) { dx += own.dx; dy += own.dy; }
      if (path !== "") {
        const p = parentOf.get(path) || "";
        if (p !== path) {
          const pd = cumDelta(p);
          dx += pd.dx; dy += pd.dy;
        }
      }
      const r = { dx, dy };
      cache.set(path, r);
      return r;
    }
    for (const path of [...pos.keys()]) {
      const d = cumDelta(path);
      if (d.dx === 0 && d.dy === 0) continue;
      const p = pos.get(path);
      pos.set(path, { x: p.x + d.dx, y: p.y + d.dy });
    }
  }

  function collectDescendants(S, rootPath) {
    const out = [rootPath];
    const stack = [rootPath];
    while (stack.length) {
      const cur = stack.pop();
      for (const n of S.nodes) {
        if ((n.parent || "") === cur) {
          out.push(n.path);
          if (n.dir) stack.push(n.path);
        }
      }
    }
    return out;
  }

  return { NODE_W, NODE_H, GAP_X, GAP_Y, PAD, DETACHED, buildLayout, applyManualDeltas, collectDescendants };
})();
