import { startRegistryServer } from "@secstreet/service-registry";
const h = await startRegistryServer({
  libraryDir: "/workspaces/SecStreet/capabilities/official",
  port: 8787, host: "0.0.0.0",
  libraryName: "official", libraryVersion: "0.1.0", maintainer: "SecStreet"
});
console.log("registry up at " + h.url);
process.on("SIGTERM", () => h.close().then(() => process.exit(0)));
process.on("SIGINT", () => h.close().then(() => process.exit(0)));
