// attach.js — attach a node to a folder.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Attach = (function () {

  function doAttach(path, folderPath) {
    const S = window.CanvasParts.State.get();
    if (!S) return;
    S.reparent.set(path, folderPath || "");
    window.CanvasParts.Reparent.persist();
    window.CanvasParts.Reparent.refresh();
  }

  // Called from drag-and-drop. Attaches immediately, no confirmation.
  function attachWithConfirm(path, folderPath) {
    doAttach(path, folderPath);
  }

  // Called from right-click "Attach to folder…". Opens the folder picker.
  function attachViaPicker(path) {
    window.CanvasParts.FolderPicker.show((folderPath) => {
      doAttach(path, folderPath);
    });
  }

  return { attachWithConfirm, attachViaPicker, doAttach };
})();
