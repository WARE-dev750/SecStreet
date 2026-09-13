// SecStreet UI smoke test.
// Starts the web server, drives a real browser through every page and
// every interactive control, and reports pass/fail per step.
//
//   node scripts/smoke.mjs
//
// Exits 0 if everything passes, 1 otherwise. Screenshots failures to
// /tmp/secstreet-smoke/.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5177;
const BASE = "http://127.0.0.1:" + PORT;
const SHOT_DIR = "/tmp/secstreet-smoke";

const results = [];
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    results.push({ ok: true, name });
    console.log("  \u2713 " + name);
  } catch (err) {
    failed++;
    results.push({ ok: false, name, error: err.message });
    console.log("  \u2717 " + name);
    console.log("      " + err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function startServer() {
  const proc = spawn("node", ["scripts/serve-web.mjs", "/workspaces/SecStreet/demo", String(PORT), "0.0.0.0"], {
    cwd: "/workspaces/SecStreet",
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", (d) => process.stderr.write("[server] " + d.toString()));
  // wait for the port to answer
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return proc;
    } catch {}
    await sleep(200);
  }
  proc.kill();
  throw new Error("server did not come up on " + BASE);
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  console.log("starting server on " + BASE);
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // capture console errors as they happen
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  console.log("\nLIBRARY PAGE");

  await step("library page loads with title", async () => {
    await page.goto(BASE + "/library", { waitUntil: "networkidle" });
    const title = await page.title();
    assert(title.includes("SecStreet"), "title did not contain SecStreet: " + title);
    const brand = await page.locator(".navbar-brand").textContent();
    assert(brand.includes("SECSTREET"), "brand missing: " + brand);
  });

  await step("library list renders 21 results", async () => {
    await page.waitForSelector(".lib-row", { timeout: 5000 });
    const count = await page.locator(".lib-row").count();
    assert(count >= 20, "expected at least 20 rows, got " + count);
    const label = await page.locator("#count").textContent();
    assert(label.includes("21"), "count label wrong: " + label);
  });

  await step("search 'elf' filters to 6 results", async () => {
    await page.fill("#q", "elf");
    await page.waitForTimeout(300);
    const count = await page.locator(".lib-row").count();
    assert(count === 6, "expected 6 results for 'elf', got " + count);
  });

  await step("search 'crypto' filters to 2 results", async () => {
    await page.fill("#q", "crypto");
    await page.waitForTimeout(300);
    const count = await page.locator(".lib-row").count();
    assert(count === 2, "expected 2 results for 'crypto', got " + count);
  });

  await step("click a result renders detail panel", async () => {
    await page.fill("#q", "pe");
    await page.waitForTimeout(300);
    await page.locator(".lib-row").first().click();
    await page.waitForSelector("#installBtn", { timeout: 3000 });
    const h1 = await page.locator(".lib-detail h1").textContent();
    assert(h1.includes("pe-header"), "detail header wrong: " + h1);
  });

  await step("detail shows input and output schemas", async () => {
    const sections = await page.locator(".lib-detail .section").allTextContents();
    assert(sections.some((s) => s.includes("Input schema")), "no input schema section");
    assert(sections.some((s) => s.includes("Output schema")), "no output schema section");
  });

  await step("monaco editor renders in detail", async () => {
    await page.waitForSelector(".lib-code .monaco-editor", { timeout: 5000 });
    const count = await page.locator(".lib-code .monaco-editor").count();
    assert(count === 1, "monaco editor not mounted");
  });

  await step("install button is present", async () => {
    const btn = page.locator("#installBtn");
    await btn.waitFor({ timeout: 2000 });
    const text = await btn.textContent();
    assert(text.toLowerCase().includes("install"), "install button text wrong: " + text);
  });

  await step("workspace link goes back to /", async () => {
    await page.locator("a.btn", { hasText: "Workspace" }).click();
    await page.waitForURL(BASE + "/", { timeout: 3000 });
    const isIde = await page.locator(".ide-shell").count();
    assert(isIde === 1, "did not land on IDE page");
  });

  console.log("\nIDE PAGE");

  await step("IDE loads with navbar and shell", async () => {
    const brand = await page.locator(".navbar-brand").textContent();
    assert(brand.includes("SECSTREET"), "brand missing");
    const rail = await page.locator(".rail-btn").count();
    assert(rail === 5, "expected 5 rail buttons, got " + rail);
  });

  await step("file tree shows project files", async () => {
    await page.waitForSelector(".tree-row", { timeout: 3000 });
    const count = await page.locator(".tree-row").count();
    assert(count > 0, "no tree rows");
    const hasCaps = await page.locator(".tree-row", { hasText: "capabilities" }).count();
    assert(hasCaps > 0, "capabilities folder missing from tree");
  });

  await step("rail: clicking Capabilities switches sidebar", async () => {
    await page.locator('.rail-btn[data-view="capabilities"]').click();
    await page.waitForTimeout(200);
    const title = await page.locator("#sidebarTitle").textContent();
    assert(title === "Capabilities", "sidebar title wrong: " + title);
  });

  await step("rail: clicking Workflows switches sidebar", async () => {
    await page.locator('.rail-btn[data-view="workflows"]').click();
    await page.waitForTimeout(200);
    const title = await page.locator("#sidebarTitle").textContent();
    assert(title === "Workflows", "sidebar title wrong: " + title);
  });

  await step("rail: clicking Audit switches sidebar", async () => {
    await page.locator('.rail-btn[data-view="audit"]').click();
    await page.waitForTimeout(400);
    const title = await page.locator("#sidebarTitle").textContent();
    assert(title === "Audit", "sidebar title wrong: " + title);
  });

  await step("rail: clicking Registry switches sidebar", async () => {
    await page.locator('.rail-btn[data-view="registry"]').click();
    await page.waitForTimeout(200);
    const title = await page.locator("#sidebarTitle").textContent();
    assert(title === "Registry", "sidebar title wrong: " + title);
  });

  await step("rail: back to Explorer", async () => {
    await page.locator('.rail-btn[data-view="explorer"]').click();
    await page.waitForTimeout(200);
    const title = await page.locator("#sidebarTitle").textContent();
    assert(title === "Explorer", "sidebar title wrong: " + title);
  });

  await step("navbar: Library button opens library panel", async () => {
    await page.locator("#btnLibrary").click();
    await page.waitForTimeout(300);
    const hasPanel = await page.locator(".lib-panel").count();
    assert(hasPanel === 1, "library panel not rendered");
    const hasSearch = await page.locator("#libq").count();
    assert(hasSearch === 1, "library search input missing");
  });

  await step("library panel: search filters results", async () => {
    await page.fill("#libq", "elf");
    await page.waitForTimeout(300);
    const count = await page.locator(".lib-panel-row").count();
    assert(count === 6, "expected 6 elf results, got " + count);
  });

  await step("library panel: language filter dropdown has options", async () => {
    const opts = await page.locator("#libLang option").count();
    assert(opts >= 2, "language filter has fewer than 2 options: " + opts);
  });

  await step("navbar: Console button opens bottom panel", async () => {
    await page.locator("#btnToggleBottom").click();
    await page.waitForTimeout(300);
    const visible = await page.locator("#bottom").isVisible();
    assert(visible, "bottom panel did not become visible");
  });

  await step("bottom panel: switching tabs works", async () => {
    await page.locator('.bottom-tabs [data-btab="audit"]').click();
    await page.waitForTimeout(300);
    const active = await page.locator('.bottom-tabs [data-btab="audit"]').getAttribute("class");
    assert(active.includes("active"), "audit tab not active");
  });

  await step("right panel: AI tab renders", async () => {
    await page.locator('.right-tabs [data-rtab="ai"]').click();
    await page.waitForTimeout(300);
    const text = await page.locator("#rightBody").textContent();
    assert(text.includes("AI adapter") || text.includes("Producer"), "AI panel did not render: " + text.slice(0, 80));
  });

  await step("palette: Files button opens it", async () => {
    await page.locator("#btnPalette").click();
    await page.waitForTimeout(400);
    const visible = await page.locator("#paletteWrap").isVisible();
    assert(visible, "palette not visible after clicking Files button");
    await page.locator("#paletteWrap").evaluate((el) => el.classList.remove("open"));
    await page.waitForTimeout(150);
  });

  await step("palette: Ctrl+P opens it", async () => {
    await page.keyboard.press("Control+KeyP");
    await page.waitForTimeout(400);
    const visible = await page.locator("#paletteWrap").isVisible();
    assert(visible, "palette not visible after Ctrl+P");
    await page.locator("#paletteWrap").evaluate((el) => el.classList.remove("open"));
    await page.waitForTimeout(150);
  });

  await step("file tree: clicking a file opens it", async () => {
    // expand capabilities then click the first capability folder
    await page.locator('.rail-btn[data-view="explorer"]').click();
    await page.waitForTimeout(200);
    const capFolder = page.locator('.tree-row', { hasText: "capabilities" }).first();
    await capFolder.click();
    await page.waitForTimeout(300);
    // click a subfolder or file
    const rows = page.locator(".tree-row");
    const n = await rows.count();
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const txt = await rows.nth(i).textContent();
      if (txt && (txt.includes("secstreet.json") || txt.includes("gitignore"))) {
        await rows.nth(i).click();
        clicked = true;
        break;
      }
    }
    assert(clicked, "no clickable file found in tree");
    await page.waitForTimeout(500);
    const tabs = await page.locator(".tabs-bar .nav-link").count();
    assert(tabs >= 1, "no tab appeared after opening a file");
  });

  await step("no javascript console errors during the whole run", async () => {
    // Filter out known noise from CDN loading
    const real = consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("ResizeObserver"));
    if (real.length > 0) {
      throw new Error(real.length + " console error(s): " + real.slice(0, 3).join(" | "));
    }
  });

  console.log("\n" + (failed === 0 ? "ALL PASSED" : failed + " FAILED") + " (" + results.length + " steps)");
  if (failed > 0) {
    const shot = SHOT_DIR + "/failure.png";
    await page.screenshot({ path: shot, fullPage: true });
    console.log("screenshot of final state: " + shot);
  }

  await browser.close();
  server.kill();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke test crashed:", err.message);
  process.exit(1);
});
