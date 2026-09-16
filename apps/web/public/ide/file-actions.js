// file-actions.js — create / rename / delete / duplicate files and folders.
window.IDEFileActions = (function () {
  async function post(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "request failed");
    return data;
  }

  async function refreshTree() {
    // These are globals from app.js.
    if (typeof window.loadTree === "function") await window.loadTree();
    if (typeof window.renderSidebar === "function") window.renderSidebar();
  }

  function joinPath(parent, name) {
    const p = (parent || "").replace(/\/+$/, "");
    return p ? p + "/" + name : name;
  }

  async function createFolder(parentPath, name) {
    const full = joinPath(parentPath, name);
    await post("/api/files/mkdir", { path: full });
    await refreshTree();
    return full;
  }

  async function createFile(parentPath, name, content = "") {
    const full = joinPath(parentPath, name);
    const r = await fetch("/api/file?path=" + encodeURIComponent(full), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!r.ok) throw new Error("create failed: HTTP " + r.status);
    await refreshTree();
    return full;
  }

  async function rename(path, newName) {
    await post("/api/files/rename", { path, newName });
    await refreshTree();
    // New path
    const idx = path.lastIndexOf("/");
    const parent = idx === -1 ? "" : path.slice(0, idx);
    return joinPath(parent, newName);
  }

  async function remove(path) {
    await post("/api/files/delete", { path });
    await refreshTree();
  }

  async function duplicate(path) {
    // Read, then write with " copy" suffix before extension.
    const r = await fetch("/api/file?path=" + encodeURIComponent(path));
    if (!r.ok) throw new Error("read failed: HTTP " + r.status);
    const data = await r.json();
    const content = typeof data.content === "string" ? data.content : "";
    const idx = path.lastIndexOf("/");
    const parent = idx === -1 ? "" : path.slice(0, idx);
    const name = idx === -1 ? path : path.slice(idx + 1);
    const dot = name.lastIndexOf(".");
    const newName = dot > 0 ? name.slice(0, dot) + " copy" + name.slice(dot) : name + " copy";
    const full = joinPath(parent, newName);
    const w = await fetch("/api/file?path=" + encodeURIComponent(full), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!w.ok) throw new Error("write failed: HTTP " + w.status);
    await refreshTree();
    return full;
  }

  async function move(from, to) {
    if (from === to) return to;
    await post("/api/files/move", { from, to });
    await refreshTree();
    return to;
  }

  return { createFolder, createFile, rename, remove, duplicate, move, refreshTree, joinPath };
})();
