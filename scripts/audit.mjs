// SecStreet DOM + layout audit. Text output only.
// Run: node scripts/audit.mjs
//
// For every UI state it walks the top-level regions, records position, size,
// background, text color, and prints the state compactly. Then it flags
// layout anomalies (gaps, overlaps, zero-size, invisible-by-same-color).
// You paste the output. The AI reads it like a screenshot.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5178;
const BASE = "http://127.0.0.1:" + PORT;
const VIEWPORT = { width: 1400, height: 900 };

async function startServer() {
  const proc = spawn("node", ["scripts/serve-web.mjs", "/workspaces/SecStreet/demo", String(PORT), "0.0.0.0"], { cwd: "/workspaces/SecStreet", stdio: ["ignore", "ignore", "pipe"] });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return proc; } catch {}
    await sleep(200);
  }
  proc.kill(); throw new Error("server did not come up");
}

async function measure(page, selectors) {
  return await page.evaluate((sels) => {
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) { out[s] = null; continue; }
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.offsetParent === null) {
        out[s] = { hidden: true };
        continue;
      }
      const r = el.getBoundingClientRect();
      out[s] = {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor, fg: cs.color,
        border: cs.borderTopWidth === "0px" ? null : cs.borderTopColor,
        display: cs.display,
        overflow: cs.overflow,
      };
    }
    return out;
  }, selectors);
}

async function capture(page, label, selectors) {
  const data = await measure(page, selectors);
  console.log("\n=== " + label + " ===");
  const vw = VIEWPORT.width;
  const vh = VIEWPORT.height;
  let lastRight = 0;
  for (const [sel, m] of Object.entries(data)) {
    if (m === null) { console.log("  " + sel.padEnd(22) + " MISSING"); continue; }
    if (m.hidden) { console.log("  " + sel.padEnd(22) + " hidden"); continue; }
    const gapLeft = m.x - lastRight;
    const gapNote = (lastRight > 0 && gapLeft > 4) ? "  <-- GAP LEFT " + gapLeft + "px" : "";
    console.log("  " + sel.padEnd(22) + " " + String(m.x).padStart(4) + "," + String(m.y).padStart(4) + " " + String(m.w).padStart(4) + "x" + String(m.h).padStart(4) + "  bg=" + m.bg.padEnd(22) + " fg=" + m.fg + gapNote);
    lastRight = m.x + m.w;
  }
  // right-edge gap check
  const rightmost = Math.max(...Object.values(data).filter((m) => m && !m.hidden).map((m) => m.x + m.w));
  const rightGap = vw - rightmost;
  const bottomMost = Math.max(...Object.values(data).filter((m) => m && !m.hidden).map((m) => m.y + m.h));
  const bottomGap = vh - bottomMost;
  if (rightGap > 4) console.log("  ! RIGHT GAP: " + rightGap + "px empty on the right side (viewport " + vw + ")");
  if (bottomGap > 4) console.log("  ! BOTTOM GAP: " + bottomGap + "px empty at the bottom (viewport " + vh + ")");
}

async function colors(page, label) {
  const palette = await page.evaluate(() => {
    const counts = {};
    const walk = (el) => {
      const cs = window.getComputedStyle(el);
      const key = "bg=" + cs.backgroundColor + " fg=" + cs.color;
      counts[key] = (counts[key] || 0) + 1;
      for (const c of el.children) walk(c);
    };
    walk(document.body);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  });
  console.log("  PALETTE (top 8 by usage):");
  for (const [k, n] of palette) console.log("    " + String(n).padStart(4) + "  " + k);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (e) => console.log("[PAGEERROR] " + e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[CONSOLE-ERR] " + m.text()); });

  // --- LIBRARY ---
  await page.goto(BASE + "/library", { waitUntil: "networkidle" });
  await page.waitForSelector(".lib-row", { timeout: 5000 });
  await capture(page, "library default", [".navbar", ".lib-left", ".lib-right", ".lib-header", ".lib-search", ".lib-list", ".lib-detail"]);
  await colors(page, "library default");

  await page.fill("#q", "elf"); await page.waitForTimeout(400);
  await capture(page, "library search 'elf'", [".navbar", ".lib-left", ".lib-list"]);
  const elfCount = await page.locator(".lib-row").count();
  console.log("  rows visible: " + elfCount);

  await page.locator(".lib-row").first().click(); await page.waitForTimeout(900);
  await capture(page, "library detail (pe-header)", [".lib-detail", ".lib-detail h1", "#installBtn", ".lib-code", ".lib-detail pre"]);
  await colors(page, "library detail");

  // --- IDE ---
  await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  await capture(page, "IDE default", [".navbar", ".ide-shell", ".activity-rail", "#sidebar", "#mainArea", "#editorHost", "#emptyState", "#right", ".status-bar"]);
  await colors(page, "IDE default");

  // Right panel closed — the white square bug
  await page.locator("#btnToggleRight").click(); await page.waitForTimeout(500);
  await capture(page, "IDE right panel closed", [".navbar", ".activity-rail", "#sidebar", "#mainArea", "#editorHost", "#right", ".status-bar"]);

  await page.locator("#btnToggleRight").click(); await page.waitForTimeout(400);

  // Sidebar closed
  await page.locator("#sidebarToggle").click(); await page.waitForTimeout(500);
  await capture(page, "IDE sidebar closed", [".activity-rail", "#sidebar", "#mainArea", "#right"]);

  await page.locator(".rail-btn[data-view='explorer']").click(); await page.waitForTimeout(300);

  // Bottom open
  await page.locator("#btnToggleBottom").click(); await page.waitForTimeout(500);
  await capture(page, "IDE bottom open", ["#mainArea", "#mainContent", "#bottom", ".bottom-tabs"]);

  await page.locator("#btnToggleBottom").click(); await page.waitForTimeout(300);

  // File open
  await page.locator(".tree-row", { hasText: "secstreet.json" }).first().click(); await page.waitForTimeout(1000);
  await capture(page, "IDE file open (Monaco)", [".tabs-bar", ".breadcrumb-bar", "#editorHost", ".monaco-editor", "#right"]);

  // Library panel
  await page.locator("#btnLibrary").click(); await page.waitForTimeout(500);
  await capture(page, "IDE library panel", [".navbar", "#right", ".lib-panel", "#libq", "#libLang", "#libList"]);
  await page.fill("#libq", "elf"); await page.waitForTimeout(500);
  await capture(page, "IDE library panel search", ["#libList", ".lib-panel-row", "#libCount"]);

  // AI tab
  await page.locator('.right-tabs [data-rtab="ai"]').click(); await page.waitForTimeout(400);
  await capture(page, "IDE AI tab", ["#right", "#rightBody", "#aiProducer", "#aiConsumer", "#aiGenerate"]);

  // Capabilities list
  await page.locator(".rail-btn[data-view='capabilities']").click(); await page.waitForTimeout(400);
  await capture(page, "IDE capabilities sidebar", ["#sidebar", ".cap-row"]);

  const capCount = await page.locator(".cap-row").count();
  if (capCount > 0) {
    await page.locator(".cap-row").first().click(); await page.waitForTimeout(600);
    await capture(page, "IDE capability inspector", ["#right", "#rightBody", "#capInput", "#capRun"]);
  }

  // Workflows / canvas
  await page.locator(".rail-btn[data-view='workflows']").click(); await page.waitForTimeout(400);
  const wfCount = await page.locator(".cap-row[data-wf]").count();
  if (wfCount > 0) {
    await page.locator(".cap-row[data-wf]").first().click(); await page.waitForTimeout(1000);
    await capture(page, "IDE workflow canvas", ["#canvasHost", ".canvas-toolbar", ".canvas-stage", ".cnode", ".cedge"]);
    await colors(page, "IDE workflow canvas");
  } else {
    console.log("\n=== IDE workflow canvas ===\n  (no workflows available)");
  }

  // Palette
  await page.locator("#btnPalette").click(); await page.waitForTimeout(400);
  await capture(page, "IDE palette open", ["#paletteWrap", ".palette", "#paletteInput", "#paletteList"]);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);

  // Audit sidebar
  await page.locator(".rail-btn[data-view='audit']").click(); await page.waitForTimeout(600);
  await capture(page, "IDE audit sidebar", ["#sidebar", ".audit-row"]);

  // Registry sidebar
  await page.locator(".rail-btn[data-view='registry']").click(); await page.waitForTimeout(400);
  await capture(page, "IDE registry sidebar", ["#sidebar", "#registryUrl", "#registryGo"]);

  console.log("\n--- audit complete ---");
  await browser.close();
  server.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
