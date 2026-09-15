// ai.js — AI drawer: preview, ask, explain.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.AI = (function () {
  function ensureDrawer() {
    const S = window.CanvasParts.State.get();
    if (S.aiDrawer) return S.aiDrawer;
    const F = window.CanvasParts.Files;
    const d = document.createElement("div");
    d.className = "wcv-ai-drawer";
    d.innerHTML =
      '<div class="wcv-ai-head">' +
        '<div class="wcv-ai-path" id="wcvAiPath">\u2014</div>' +
        '<button class="wcv-ai-close" id="wcvAiClose" title="Close">\u00d7</button>' +
      '</div>' +
      '<div class="wcv-ai-meta" id="wcvAiMeta"></div>' +
      '<pre class="wcv-ai-code" id="wcvAiCode"></pre>' +
      '<div class="wcv-ai-actions">' +
        '<input id="wcvAiInput" placeholder="Ask about this file\u2026" autocomplete="off">' +
        '<button id="wcvAiAsk">Ask</button>' +
      '</div>' +
      '<div class="wcv-ai-msg" id="wcvAiMsg"></div>' +
      '<pre class="wcv-ai-out" id="wcvAiOut"></pre>';
    S.wrap.appendChild(d);
    S.aiDrawer = d;
    d.querySelector("#wcvAiClose").addEventListener("click", closeDrawer);
    d.querySelector("#wcvAiAsk").addEventListener("click", () => {
      const v = d.querySelector("#wcvAiInput").value.trim();
      if (v) askAi(v);
    });
    d.querySelector("#wcvAiInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const v = d.querySelector("#wcvAiInput").value.trim(); if (v) askAi(v); }
    });
    void F;
    return d;
  }

  function openDrawer(node, initialPrompt) {
    const S = window.CanvasParts.State.get();
    const F = window.CanvasParts.Files;
    const d = ensureDrawer();
    S.aiNode = node;
    d.querySelector("#wcvAiPath").textContent = node.path;
    const ext = node.name && node.name.lastIndexOf(".") > 0 ? node.name.slice(node.name.lastIndexOf(".")) : "";
    const chips = [];
    if (node.category) chips.push('<span class="wcv-ai-chip">' + F.esc(node.category) + '</span>');
    if (ext) chips.push('<span class="wcv-ai-chip">' + F.esc(ext.replace(".", "")) + '</span>');
    if (typeof node.content === "string") chips.push('<span class="wcv-ai-chip">' + node.content.length + ' bytes</span>');
    d.querySelector("#wcvAiMeta").innerHTML = chips.join("");
    d.querySelector("#wcvAiCode").textContent = typeof node.content === "string" ? node.content : "(no preview)";
    d.querySelector("#wcvAiInput").value = "";
    d.querySelector("#wcvAiOut").textContent = "";
    d.querySelector("#wcvAiMsg").textContent = "";
    d.classList.add("open");
    if (initialPrompt) {
      d.querySelector("#wcvAiInput").value = initialPrompt;
      askAi(initialPrompt);
    } else {
      setTimeout(() => d.querySelector("#wcvAiInput").focus(), 120);
    }
  }

  function closeDrawer() {
    const S = window.CanvasParts.State.get();
    if (S && S.aiDrawer) S.aiDrawer.classList.remove("open");
  }

  async function askAi(prompt) {
    const S = window.CanvasParts.State.get();
    if (!S || !S.aiNode) return;
    const d = S.aiDrawer;
    const out = d.querySelector("#wcvAiOut");
    const msg = d.querySelector("#wcvAiMsg");
    out.textContent = "\u2026";
    msg.textContent = "";
    const context = typeof S.aiNode.content === "string"
      ? (S.aiNode.content.length > 16000 ? S.aiNode.content.slice(0, 16000) + "\n\n[truncated]" : S.aiNode.content)
      : undefined;
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, context })
      });
      const data = await r.json();
      if (data.ok) {
        out.textContent = data.answer;
        if (data.provider || data.model) msg.textContent = (data.provider || "") + (data.model ? " / " + data.model : "");
      } else {
        out.textContent = "";
        msg.textContent = data.error || "AI unavailable";
      }
    } catch (err) {
      out.textContent = "";
      msg.textContent = "AI unavailable: " + err.message;
    }
  }

  return { ensureDrawer, openDrawer, closeDrawer, askAi };
})();
