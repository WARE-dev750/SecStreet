// root-move.js — opt-in Move mode for the root workspace node.
// Owns: enter, exit (commit or cancel), Done/Cancel bar, root node highlight.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.RootMove = (function () {

  function isActive() {
    const S = window.CanvasParts.State.get();
    return !!(S && S.rootMoving);
  }

  function enter() {
    const S = window.CanvasParts.State.get();
    if (!S || S.rootMoving) return;
    S.rootMoving = true;
    // Snapshot the current root delta so Cancel restores it exactly.
    const cur = S.manualDelta.get("");
    S.rootMoveSnapshot = cur ? { dx: cur.dx, dy: cur.dy } : null;
    showBar();
    markRoot();
  }

  function exit(commit) {
    const S = window.CanvasParts.State.get();
    if (!S || !S.rootMoving) return;
    if (!commit) {
      if (S.rootMoveSnapshot) S.manualDelta.set("", S.rootMoveSnapshot);
      else S.manualDelta.delete("");
      window.CanvasParts.State.persistManualDelta();
      window.CanvasParts.Render.relayout();
    }
    S.rootMoving = false;
    S.rootMoveSnapshot = null;
    hideBar();
    unmarkRoot();
  }

  function markRoot() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.stage) return;
    const root = S.stage.querySelector(".wcv-node.is-root");
    if (root) root.classList.add("wcv-move-active");
  }
  function unmarkRoot() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.stage) return;
    const root = S.stage.querySelector(".wcv-node.is-root");
    if (root) root.classList.remove("wcv-move-active");
  }

  function showBar() {
    const S = window.CanvasParts.State.get();
    if (!S || !S.wrap) return;
    if (S.rootMoveBar) return;
    const bar = document.createElement("div");
    bar.className = "wcv-move-bar";
    bar.innerHTML =
      '<span class="wcv-move-dot"></span>' +
      '<span class="wcv-move-label">Moving workspace</span>' +
      '<button class="wcv-move-btn" data-act="cancel">Cancel</button>' +
      '<button class="wcv-move-btn primary" data-act="done">Done</button>';
    S.wrap.appendChild(bar);
    S.rootMoveBar = bar;
    bar.addEventListener("click", (e) => {
      const act = e.target.dataset.act;
      if (act === "done") exit(true);
      if (act === "cancel") exit(false);
    });
  }

  function hideBar() {
    const S = window.CanvasParts.State.get();
    if (S && S.rootMoveBar) { S.rootMoveBar.remove(); S.rootMoveBar = null; }
  }

  return { isActive, enter, exit };
})();
