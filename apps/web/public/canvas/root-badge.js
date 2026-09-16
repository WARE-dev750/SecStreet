// root-badge.js — circular donut showing red/blue/purple composition
// of the project. Anchored to the root node's top-right corner.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.RootBadge = (function () {
  const PREF_KEY = "secstreet.canvas.pref.rootBadge";

  const RED_RE = /exploit|payload|c2|beacon|implant|shellcode|malware|backdoor|rootkit|redteam|red-team|offensive|attack|privesc|trojan|worm|ransom|keylog|inject|hook|meterpreter|mimikatz|cobalt/i;
  const BLUE_RE = /detect|siem|soc\b|yara|sigma|alert|hunt|forensic|defend|blue-?team|mitigat|patch|monitor|audit|incident|hardening|log-?parser|parse-auth|auth-?log|ioc|threat|security-?scan/i;

  function isOn() {
    try {
      const v = localStorage.getItem(PREF_KEY);
      if (v === null) return true;
      return v === "1";
    } catch { return true; }
  }
  function setOn(v) { try { localStorage.setItem(PREF_KEY, v ? "1" : "0"); } catch {} }
  function toggle() { setOn(!isOn()); }

  function classifyFile(f) {
    const hay = ((f.name || "") + " " + (f.path || "") + " " + ((f.content || "").slice(0, 2000))).toLowerCase();
    if (RED_RE.test(hay)) return "red";
    if (BLUE_RE.test(hay)) return "blue";
    return "purple";
  }

  function computePercentages() {
    const S = window.CanvasParts.State.get();
    if (!S) return null;
    const seen = new Set();
    let r = 0, b = 0, p = 0;
    for (const n of S.allNodes || []) {
      if (n.dir) continue;
      if (n.category === "binary") continue;
      if (seen.has(n.path)) continue;
      seen.add(n.path);
      const c = classifyFile(n);
      if (c === "red") r++;
      else if (c === "blue") b++;
      else p++;
    }
    const total = r + b + p;
    if (total === 0) return null;
    const raw = [100 * r / total, 100 * b / total, 100 * p / total];
    const floors = raw.map(Math.floor);
    let remainder = 100 - floors.reduce((a, x) => a + x, 0);
    const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floors[order[k].i]++;
    return { red: floors[0], blue: floors[1], purple: floors[2], counts: { red: r, blue: b, purple: p, total } };
  }

  // SVG donut. r=14, C = 2*pi*14 ≈ 87.96
  function renderHtml() {
    const pct = computePercentages();
    if (!pct) return "";
    const C = 2 * Math.PI * 14;
    const redArc = C * (pct.red / 100);
    const blueArc = C * (pct.blue / 100);
    const purpleArc = C * (pct.purple / 100);
    const redOffset = 0;
    const blueOffset = -redArc;
    const purpleOffset = -(redArc + blueArc);

    // dominant segment for center text
    const dom = pct.red >= pct.blue && pct.red >= pct.purple ? "red"
              : pct.blue >= pct.purple ? "blue" : "purple";
    const domPct = pct[dom];
    const domColor = dom === "red" ? "#dc2626" : dom === "blue" ? "#2563eb" : "#7c3aed";

    const tip = pct.counts.total + " files · "
      + pct.counts.red + " offensive · "
      + pct.counts.blue + " defensive · "
      + pct.counts.purple + " neutral";

    return '' +
      '<div class="wcv-rb-wrap">' +
        '<svg class="wcv-rb-svg" viewBox="0 0 36 36" width="26" height="26">' +
          '<circle cx="18" cy="18" r="14" fill="#fff" stroke="#e2e2e6" stroke-width="1"/>' +
          '<g transform="rotate(-90 18 18)">' +
            '<circle cx="18" cy="18" r="14" fill="none" stroke="#dc2626" stroke-width="5" ' +
              'stroke-dasharray="' + redArc + ' ' + (C - redArc) + '" stroke-dashoffset="' + redOffset + '"/>' +
            '<circle cx="18" cy="18" r="14" fill="none" stroke="#2563eb" stroke-width="5" ' +
              'stroke-dasharray="' + blueArc + ' ' + (C - blueArc) + '" stroke-dashoffset="' + blueOffset + '"/>' +
            '<circle cx="18" cy="18" r="14" fill="none" stroke="#7c3aed" stroke-width="5" ' +
              'stroke-dasharray="' + purpleArc + ' ' + (C - purpleArc) + '" stroke-dashoffset="' + purpleOffset + '"/>' +
          '</g>' +
        '</svg>' +
        '<div class="wcv-rb-tip">' +
          '<div class="wcv-rb-tip-row"><span class="wcv-rb-dot" style="background:#dc2626"></span><span class="wcv-rb-tip-k">Red</span><span class="wcv-rb-tip-v">' + pct.red + '%</span></div>' +
          '<div class="wcv-rb-tip-row"><span class="wcv-rb-dot" style="background:#2563eb"></span><span class="wcv-rb-tip-k">Blue</span><span class="wcv-rb-tip-v">' + pct.blue + '%</span></div>' +
          '<div class="wcv-rb-tip-row"><span class="wcv-rb-dot" style="background:#7c3aed"></span><span class="wcv-rb-tip-k">Purple</span><span class="wcv-rb-tip-v">' + pct.purple + '%</span></div>' +
          '<div class="wcv-rb-tip-foot">' + pct.counts.total + ' files</div>' +
        '</div>' +
      '</div>';
  }

  return { isOn, setOn, toggle, classifyFile, computePercentages, renderHtml };
})();
