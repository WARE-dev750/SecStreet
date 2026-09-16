// clipboard.js — one clipboard shared between the IDE tree and the canvas.
window.SecClipboard = (function () {
  let items = [];
  let mode = null; // "copy" | "cut"

  function set(paths, m) {
    items = Array.isArray(paths) ? paths.slice() : [paths];
    mode = m;
  }
  function get() { return { items: items.slice(), mode }; }
  function hasItems() { return items.length > 0; }
  function isCut(path) { return mode === "cut" && items.includes(path); }
  function clear() { items = []; mode = null; }
  return { set, get, hasItems, isCut, clear };
})();
