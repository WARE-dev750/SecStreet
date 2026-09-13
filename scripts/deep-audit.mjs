// Deep audit: full DOM walk + every action, as text.
// Run: node scripts/deep-audit.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5179;
const BASE = "http://127.0.0.1:" + PORT;

async function startServer() {
  const proc = spawn("node", ["scripts/serve-web.mjs", "/workspaces/SecStreet/demo", String(PORT), "0.0.0.0"], { cwd: "/workspaces/SecStreet", stdio: ["ignore", "ignore", "pipe"] });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return proc; } catch {}
    await sleep(200);
  }
  proc.kill(); throw new Error("server did not come up");
}

async function dumpTree(page, label, maxDepth = 5) {
  console.log("\n### " + label);
  const tree = await page.evaluate((maxDepth) => {
    const lines = [];
    function walk(el, depth, prefix) {
      if (depth > maxDepth) return;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible = cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      if (!visible && depth > 0) return;
      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      const id = el.id ? "#" + el.id : "";
      const text = el.children.length === 0 ? (el.textContent || "").trim().slice(0, 30) : "";
      const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? " bg=" + cs.backgroundColor : "";
      const sz = " [" + Math.round(rect.width) + "x" + Math.round(rect.height) + "@" + Math.round(rect.x) + "," + Math.round(rect.y) + "]";
      const txt = text ? ' "' + text + '"' : "";
      lines.push(prefix + tag + id + cls + sz + bg + txt);
      for (const c of el.children) walk(c, depth + 1, prefix + "  ");
    }
    walk(document.body, 0, "");
    return lines.join("\n");
  }, maxDepth);
  console.log(tree);
}

async function act(page, label, fn, targets) {
  console.log("\n>>> " + label);
  try { await fn(); } catch (e) { console.log("  FAILED: " + e.message); }
  await page.waitForTimeout(400);
  for (const t of targets || []) {
    const m = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === "none" || el.offsetParent === null) return { hidden: true };
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, fg: cs.color };
    }, t);
    console.log("  " + t.padEnd(28) + " " + (m ? JSON.stringify(m) : "MISSING"));
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => console.log("[PAGEERROR] " + e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[ERR] " + m.text()); });

  // === LIBRARY PAGE ===
  await page.goto(BASE + "/library", { waitUntil: "networkidle" });
  await page.waitForSelector(".lib-row", { timeout: 5000 });
  await dumpTree(page, "LIBRARY DEFAULT", 5);

  await act(page, "library: click first result", async () => {
    await page.locator(".lib-row").first().click();
    await page.waitForTimeout(700);
  }, [".lib-detail", "#installBtn", ".lib-code"]);
  await dumpTree(page, "LIBRARY DETAIL", 6);

  // === IDE ===
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await dumpTree(page, "IDE DEFAULT", 6);

  for (const view of ["capabilities", "workflows", "audit", "registry", "explorer"]) {
    await act(page, "IDE: rail " + view, async () => {
      await page.locator('.rail-btn[data-view="' + view + '"]').click();
      await page.waitForTimeout(400);
    }, ["#sidebar", "#sidebarBody"]);
  }

  await act(page, "IDE: navbar Library", async () => {
    await page.locator("#btnLibrary").click();
    await page.waitForTimeout(500);
  }, ["#right", ".lib-panel", "#libList", "#libq"]);
  await dumpTree(page, "IDE LIBRARY PANEL", 6);

  await act(page, "IDE: navbar Console (open)", async () => {
    await page.locator("#btnToggleBottom").click();
    await page.waitForTimeout(500);
  }, ["#bottom", "#mainContent"]);
  await dumpTree(page, "IDE BOTTOM OPEN", 4);

  await act(page, "IDE: navbar Console (close)", async () => {
    await page.locator("#btnToggleBottom").click();
    await page.waitForTimeout(400);
  }, ["#bottom", "#mainContent"]);

  await act(page, "IDE: navbar Panel (hide right)", async () => {
    await page.locator("#btnToggleRight").click();
    await page.waitForTimeout(500);
  }, ["#right", "#mainArea"]);

  await act(page, "IDE: navbar Panel (show right)", async () => {
    await page.locator("#btnToggleRight").click();
    await page.waitForTimeout(500);
  }, ["#right", "#mainArea"]);

  // Workflow canvas
  await act(page, "IDE: rail Workflows", async () => {
    await page.locator('.rail-btn[data-view="workflows"]').click();
    await page.waitForTimeout(500);
  }, ["#sidebar"]);

  await act(page, "IDE: click workflow file", async () => {
    const wf = page.locator(".cap-row[data-wf]").first();
    if (await wf.count() > 0) await wf.click();
    await page.waitForTimeout(1000);
  }, ["#canvasHost", ".canvas-shell", ".canvas-toolbar", ".canvas-stage", ".cnode", ".cedge"]);
  await dumpTree(page, "IDE WORKFLOW CANVAS", 5);

  await act(page, "IDE: workflow save", async () => {
    const b = page.locator("#cSave");
    if (await b.count() > 0) await b.click();
    await page.waitForTimeout(500);
  }, ["#cDebug"]);

  await act(page, "IDE: workflow reset", async () => {
    const b = page.locator("#cReset");
    if (await b.count() > 0) await b.click();
    await page.waitForTimeout(500);
  }, [".cnode"]);

  // Drag library row onto tree
  await act(page, "IDE: open library panel again", async () => {
    await page.locator("#btnLibrary").click();
    await page.waitForTimeout(500);
  }, [".lib-panel-row"]);
  await act(page, "IDE: search 'elf' in library panel", async () => {
    await page.fill("#libq", "elf");
    await page.waitForTimeout(500);
  }, [".lib-panel-row", "#libCount"]);

  await act(page, "IDE: click library row (preview)", async () => {
    const row = page.locator(".lib-panel-row").first();
    if (await row.count() > 0) await row.click();
    await page.waitForTimeout(600);
  }, ["#bottomBody"]);

  await act(page, "IDE: drag library row onto capabilities folder", async () => {
    await page.locator('.rail-btn[data-view="explorer"]').click();
    await page.waitForTimeout(400);
    const row = page.locator(".lib-panel-row").first();
    const target = page.locator('.tree-row', { hasText: "capabilities" }).first();
    if ((await row.count()) > 0 && (await target.count()) > 0) {
      await row.dragTo(target);
      await page.waitForTimeout(1000);
    }
  }, ["#bottomBody", ".tree-row"]);

  // Palette
  await act(page, "IDE: navbar Files (palette)", async () => {
    await page.locator("#btnPalette").click();
    await page.waitForTimeout(500);
  }, ["#paletteWrap", ".palette"]);
  await act(page, "IDE: type elf in palette", async () => {
    await page.fill("#paletteInput", "elf");
    await page.waitForTimeout(400);
  }, [".palette-item"]);
  await act(page, "IDE: escape palette", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }, ["#paletteWrap"]);

  // AI tab
  await act(page, "IDE: AI tab", async () => {
    await page.locator('.right-tabs [data-rtab="ai"]').click();
    await page.waitForTimeout(500);
  }, ["#rightBody", "#aiProducer", "#aiConsumer", "#aiGenerate"]);
  await dumpTree(page, "IDE AI TAB", 5);

  // File open
  await act(page, "IDE: click secstreet.json", async () => {
    const row = page.locator('.tree-row', { hasText: "secstreet.json" }).first();
    if (await row.count() > 0) await row.click();
    await page.waitForTimeout(800);
  }, [".tabs-bar", ".breadcrumb-bar", "#editorHost", ".monaco-editor"]);
  await dumpTree(page, "IDE FILE OPEN", 5);

  console.log("\n--- DEEP AUDIT COMPLETE ---");
  await browser.close();
  server.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
