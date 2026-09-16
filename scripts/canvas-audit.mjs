// Drive the Structure canvas through every interaction and dump state.
// Run: node scripts/canvas-audit.mjs
//
// No interaction is skipped. At each step it prints:
//   - number of DOM nodes rendered
//   - each node's path, position, display, opacity
//   - number of edges drawn
//   - view mode + collapsed set + manual deltas from localStorage
//   - any console errors

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5190;
const BASE = "http://127.0.0.1:" + PORT;
const VIEWPORT = { width: 1400, height: 900 };

async function startServer() {
  const proc = spawn("node", ["scripts/serve-web.mjs", "/workspaces/SecStreet/demo", String(PORT), "0.0.0.0"], {
    cwd: "/workspaces/SecStreet",
    stdio: ["ignore", "ignore", "pipe"],
  });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return proc; } catch {}
    await sleep(200);
  }
  proc.kill();
  throw new Error("server did not come up");
}

function banner(label) {
  console.log("\n========================================================");
  console.log("  " + label);
  console.log("========================================================");
}

async function dumpState(page, label) {
  banner(label);
  const info = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".wcv-node"));
    const edges = document.querySelectorAll(".wcv-wrap svg path").length;
    const toggle = document.querySelector(".wcv-toggle-btn.active");
    const rows = nodes.map((el) => {
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const caret = el.querySelector(".wcv-caret");
      return {
        path: el.dataset.path,
        cls: el.className,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display,
        vis: cs.visibility,
        op: cs.opacity,
        caret: caret ? caret.textContent : "",
      };
    });
    const store = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("secstreet")) store[k] = localStorage.getItem(k);
    }
    const host = document.querySelector("#canvasHost");
    const hostRect = host ? host.getBoundingClientRect() : null;
    const wrapRect = (() => {
      const w = document.querySelector(".wcv-wrap");
      return w ? w.getBoundingClientRect() : null;
    })();
    return { nodeCount: nodes.length, edgeCount: edges, activeToggle: toggle ? toggle.dataset.mode : null, rows, store, hostRect, wrapRect };
  });
  console.log("node count:   ", info.nodeCount);
  console.log("edge count:   ", info.edgeCount);
  console.log("view mode:    ", info.activeToggle);
  console.log("canvas host:  ", info.hostRect ? `${Math.round(info.hostRect.width)}x${Math.round(info.hostRect.height)}` : "missing");
  console.log("wrap:         ", info.wrapRect ? `${Math.round(info.wrapRect.width)}x${Math.round(info.wrapRect.height)} @ ${Math.round(info.wrapRect.x)},${Math.round(info.wrapRect.y)}` : "missing");
  console.log("");
  console.log("  path".padEnd(40) + "cls".padEnd(38) + "x,y".padEnd(14) + "wxh".padEnd(12) + "disp  vis  op   caret");
  console.log("  " + "-".repeat(130));
  for (const r of info.rows) {
    const cls = (r.cls || "").length > 36 ? r.cls.slice(0, 36) + ".." : r.cls;
    console.log(
      "  " + (r.path || "(no path)").padEnd(38) +
      (cls || "").padEnd(38) +
      (r.x + "," + r.y).padEnd(14) +
      (r.w + "x" + r.h).padEnd(12) +
      r.display.padEnd(6) + r.vw || r.vis,
      "  " + r.op.padEnd(4) + " " + r.caret
    );
  }
  console.log("");
  console.log("  localStorage:");
  for (const [k, v] of Object.entries(info.store)) {
    const val = v.length > 100 ? v.slice(0, 100) + "…" : v;
    console.log("    " + k + " = " + val);
  }
}

async function clickCaret(page, pathHint) {
  const result = await page.evaluate((hint) => {
    const nodes = Array.from(document.querySelectorAll(".wcv-node"));
    for (const n of nodes) {
      if ((n.dataset.path || "").includes(hint)) {
        const caret = n.querySelector(".wcv-caret");
        if (caret) { caret.click(); return n.dataset.path; }
      }
    }
    return null;
  }, pathHint);
  await sleep(300);
  return result;
}

async function main() {
  console.log("starting server on " + BASE);
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  const errors = [];
  page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text()); });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // clear canvas state so we start clean
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("secstreet.canvas")) localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  await dumpState(page, "STEP 0 — IDE loaded, no canvas mounted yet");

  await page.locator('.rail-btn[data-view="structure"]').click();
  await page.waitForTimeout(1200);
  await dumpState(page, "STEP 1 — Structure canvas mounted (Files mode, default)");

  // Click Files toggle (already active, but exercise it)
  await page.locator('.wcv-toggle-btn[data-mode="files"]').click();
  await page.waitForTimeout(400);
  await dumpState(page, "STEP 2 — clicked Files toggle");

  // Toggle to Skills
  await page.locator('.wcv-toggle-btn[data-mode="skills"]').click();
  await page.waitForTimeout(600);
  await dumpState(page, "STEP 3 — toggled to Skills mode");

  // Toggle back
  await page.locator('.wcv-toggle-btn[data-mode="files"]').click();
  await page.waitForTimeout(600);
  await dumpState(page, "STEP 4 — toggled back to Files mode");

  // Collapse root
  const rootPath = await clickCaret(page, "demo");
  console.log("\n>>> clicked caret on:", rootPath);
  await dumpState(page, "STEP 5 — collapsed root folder (if it has a caret)");

  // Expand root again
  await clickCaret(page, "demo");
  await dumpState(page, "STEP 6 — expanded root folder again");

  // Collapse capabilities (if it has children)
  await clickCaret(page, "capabilities");
  await dumpState(page, "STEP 7 — collapsed capabilities folder");

  // Expand it
  await clickCaret(page, "capabilities");
  await dumpState(page, "STEP 8 — expanded capabilities folder");

  // Click a file node (should open in editor)
  const clickedFile = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".wcv-node"));
    for (const n of nodes) {
      const p = n.dataset.path || "";
      if (p.endsWith(".json") || p.endsWith(".js")) {
        const r = n.getBoundingClientRect();
        return { path: p, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (clickedFile) {
    console.log("\n>>> clicking file node:", clickedFile.path);
    await page.mouse.click(clickedFile.x, clickedFile.y);
    await page.waitForTimeout(800);
    await dumpState(page, "STEP 9 — after clicking a file node");
  } else {
    console.log("\n>>> no file node available to click");
  }

  // Return to Structure view
  await page.locator('.rail-btn[data-view="explorer"]').click();
  await page.waitForTimeout(300);
  await page.locator('.rail-btn[data-view="structure"]').click();
  await page.waitForTimeout(1200);
  await dumpState(page, "STEP 10 — back to Structure after navigating away");

  // Open everything + close everything stress test on Skills view
  await page.locator('.wcv-toggle-btn[data-mode="skills"]').click();
  await page.waitForTimeout(400);
  await dumpState(page, "STEP 11 — Skills view before stress test");
  for (let i = 0; i < 20; i++) {
    // open everything
    await page.evaluate(() => {
      const root = document.querySelector('.wcv-node.is-root');
      if (!root) return;
      const r = root.getBoundingClientRect();
      root.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2
      }));
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".wcv-menu-item"));
      const open = items.find((x) => x.textContent.startsWith("Open everything"));
      if (open) open.click();
    });
    await page.waitForTimeout(80);
    // close everything
    await page.evaluate(() => {
      const root = document.querySelector('.wcv-node.is-root');
      if (!root) return;
      const r = root.getBoundingClientRect();
      root.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true,
        clientX: r.x + r.width / 2, clientY: r.y + r.height / 2
      }));
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".wcv-menu-item"));
      const close = items.find((x) => x.textContent.startsWith("Close everything"));
      if (close) close.click();
    });
    await page.waitForTimeout(80);
  }
  await dumpState(page, "STEP 12 — Skills view after 20 open/close cycles");

  // Right-click root
  const rootCenter = await page.evaluate(() => {
    const n = document.querySelector('.wcv-node.is-root');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rootCenter) {
    await page.mouse.click(rootCenter.x, rootCenter.y, { button: "right" });
    await page.waitForTimeout(400);
    const menuItems = await page.evaluate(() => Array.from(document.querySelectorAll(".wcv-menu-item")).map((x) => x.textContent));
    console.log("\n>>> root context menu items:", menuItems);
    await page.keyboard.press("Escape");
    await page.mouse.click(200, 700);
    await page.waitForTimeout(200);
  }

  console.log("\n========================================================");
  console.log("  CONSOLE ERRORS DURING THE WHOLE RUN");
  console.log("========================================================");
  if (errors.length === 0) console.log("  (none)");
  else for (const e of errors) console.log("  " + e);

  console.log("\n--- audit complete ---");
  await browser.close();
  server.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
