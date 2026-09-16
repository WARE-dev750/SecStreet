// prompt.js — small text-entry modal (used by rename, new file, new folder).
window.IDEPrompt = (function () {
  let current = null;

  function hide() {
    if (current) { current.remove(); current = null; }
  }

  function show(opts) {
    hide();
    const backdrop = document.createElement("div");
    backdrop.className = "ide-prompt-backdrop";
    const dialog = document.createElement("div");
    dialog.className = "ide-prompt";
    dialog.innerHTML =
      '<div class="ide-prompt-title">' + (opts.title || "Enter name") + '</div>' +
      '<input class="ide-prompt-input" type="text" placeholder="' + (opts.placeholder || "") + '" value="' + (opts.initial || "").replace(/"/g, "&quot;") + '">' +
      '<div class="ide-prompt-actions">' +
        '<button class="ide-prompt-btn" data-act="cancel">Cancel</button>' +
        '<button class="ide-prompt-btn primary" data-act="confirm">' + (opts.confirmLabel || "OK") + '</button>' +
      '</div>';
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    current = backdrop;

    const input = dialog.querySelector(".ide-prompt-input");
    setTimeout(() => { input.focus(); if (opts.initial) input.select(); }, 50);

    function confirm() {
      const v = input.value.trim();
      if (!v) return;
      if (opts.validate && !opts.validate(v)) return;
      hide();
      opts.onConfirm(v);
    }
    function cancel() { hide(); if (opts.onCancel) opts.onCancel(); }

    dialog.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (act === "confirm") confirm();
      if (act === "cancel") cancel();
    });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cancel(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirm(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  return { show, hide };
})();
