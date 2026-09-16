// state.js — the single source of truth for canvas state + localStorage.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.State = (function () {
  let S = null;

  const KEYS = {
    viewMode: "secstreet.canvas.viewMode",
    collapsed: (mode) => "secstreet.canvas.collapsed." + (mode || "files"),
    panzoom: "secstreet.canvas.panzoom",
    manualDelta: (mode) => "secstreet.canvas.manualDelta." + (mode || "files"),
    legacyManualPos: "secstreet.canvas.manualPos",
    legacyCollapsed: "secstreet.canvas.collapsed"
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function lsRemove(k) { try { localStorage.removeItem(k); } catch {} }

  function loadViewMode() { return lsGet(KEYS.viewMode) || "files"; }
  function saveViewMode(m) { lsSet(KEYS.viewMode, m); }

  function loadCollapsed(viewMode) {
    try {
      const raw = lsGet(KEYS.collapsed(viewMode));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      // Root CAN be collapsed. Its path is "". Empty string is a valid entry
      // and means "root collapsed, hide its direct children". The root node
      // itself always stays visible because buildLayout assigns it a pos.
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }
  function persistCollapsed() {
    if (!S) return;
    lsSet(KEYS.collapsed(S.viewMode), JSON.stringify([...S.collapsed]));
  }

  function loadManualDelta(viewMode) {
    try {
      const raw = lsGet(KEYS.manualDelta(viewMode));
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const m = new Map();
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v.dx === "number" && typeof v.dy === "number") {
            m.set(k, { dx: v.dx, dy: v.dy });
          }
        }
      }
      return m;
    } catch { return new Map(); }
  }
  function persistManualDelta() {
    if (!S) return;
    const obj = {};
    for (const [k, v] of S.manualDelta.entries()) obj[k] = { dx: v.dx, dy: v.dy };
    lsSet(KEYS.manualDelta(S.viewMode), JSON.stringify(obj));
  }
  function pruneManualDelta() {
    if (!S || !S.manualDelta) return;
    const valid = new Set(S.nodes.map((n) => n.path));
    let changed = false;
    for (const key of [...S.manualDelta.keys()]) {
      if (!valid.has(key)) { S.manualDelta.delete(key); changed = true; }
    }
    if (changed) persistManualDelta();
  }

  function loadPanZoom() {
    try {
      const raw = lsGet(KEYS.panzoom);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (typeof d.zoom === "number" && typeof d.panX === "number" && typeof d.panY === "number") return d;
    } catch {}
    return null;
  }
  function persistPanZoom() {
    if (!S) return;
    lsSet(KEYS.panzoom, JSON.stringify({ zoom: S.zoom, panX: S.panX, panY: S.panY }));
  }

  function cleanupLegacy() {
    lsRemove(KEYS.legacyManualPos);
    lsRemove(KEYS.legacyCollapsed);
  }

  function set(s) { S = s; }
  function get() { return S; }

  return {
    KEYS,
    lsGet, lsSet, lsRemove,
    loadViewMode, saveViewMode,
    loadCollapsed, persistCollapsed,
    loadManualDelta, persistManualDelta, pruneManualDelta,
    loadPanZoom, persistPanZoom,
    cleanupLegacy,
    set, get
  };
})();
