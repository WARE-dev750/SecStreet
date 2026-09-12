import { startWebServer } from "@secstreet/app-web";
const projectRoot = process.argv[2];
if (!projectRoot) { console.error("usage: node scripts/serve-web.mjs <project-root> [port]"); process.exit(2); }
const port = process.argv[3] ? Number(process.argv[3]) : 5050;
const h = await startWebServer({ projectRoot, port, host: "127.0.0.1" });
console.log("web IDE at " + h.url);
process.on("SIGTERM", () => h.close().then(() => process.exit(0)));
process.on("SIGINT", () => h.close().then(() => process.exit(0)));
