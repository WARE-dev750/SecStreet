// ide/index.js — inject IDE styles, attach toolbar + tree context menu.
(function () {
  function injectStyles() {
    if (document.getElementById("ide-styles")) return;
    const s = document.createElement("style");
    s.id = "ide-styles";
    s.textContent = [
      ".ide-prompt-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.32);z-index:5000;display:grid;place-items:center;backdrop-filter:blur(2px)}",
      ".ide-prompt{background:#fff;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.22);min-width:340px;max-width:480px;padding:18px;font-family:inherit;color:#0f172a}",
      ".ide-prompt-title{font-size:13.5px;font-weight:600;margin-bottom:10px;letter-spacing:-.005em}",
      ".ide-prompt-input{width:100%;padding:9px 11px;border:1px solid #d9dbe0;border-radius:6px;font-size:13px;font-family:ui-monospace,monospace;outline:none;box-sizing:border-box;color:#0f172a}",
      ".ide-prompt-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}",
      ".ide-prompt-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}",
      ".ide-prompt-btn{border:1px solid #d9dbe0;background:#fff;color:#334155;font-size:12.5px;font-weight:500;padding:6px 13px;border-radius:6px;cursor:pointer;font-family:inherit}",
      ".ide-prompt-btn:hover{background:#f1f3f4;color:#0f172a}",
      ".ide-prompt-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}",
      ".ide-prompt-btn.primary:hover{background:#1d4ed8}",
      ".ide-context-menu{position:fixed;z-index:5000;background:#fff;border:1px solid #e2e2e6;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:4px;min-width:200px}",
      ".ide-context-item{display:block;width:100%;text-align:left;padding:7px 12px;border:none;background:transparent;border-radius:5px;color:#202124;font-size:12.5px;cursor:pointer;font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ide-context-item:hover{background:#f1f3f4}",
      ".ide-context-item.danger{color:#dc2626}",
      ".ide-context-item.danger:hover{background:#fef2f2}",
      ".ide-context-sep{height:1px;background:#ececef;margin:4px 0}",
      "#btnNewFile,#btnNewFolder{color:#334155}",
      "#btnNewFile:hover,#btnNewFolder:hover{color:#0f172a;background:#f1f3f4}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function boot() {
    if (!document.getElementById("sidebarBody")) return false;
    injectStyles();
    try { window.IDEToolbar.attach(); } catch (e) { console.warn("[ide] toolbar", e); }
    try { window.IDETreeContextMenu.attach(); } catch (e) { console.warn("[ide] ctxmenu", e); }
    return true;
  }

  // app.js is a classic script and may run after us — retry until the sidebar exists.
  let tries = 0;
  function tryBoot() {
    if (boot()) return;
    if (++tries > 50) { console.warn("[ide] sidebar never appeared"); return; }
    setTimeout(tryBoot, 80);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryBoot);
  else tryBoot();
})();
