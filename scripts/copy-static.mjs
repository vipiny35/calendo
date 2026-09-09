import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const bundle = (entry, outfile) =>
  build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "browser",
    format: "iife",
    sourcemap: true,
  });

await mkdir("dist/renderer", { recursive: true });
await rm("dist/renderer/tray", { recursive: true, force: true });
await rm("dist/renderer/brands", { recursive: true, force: true });
await Promise.all([
  cp("src/renderer/calendar.html", "dist/renderer/calendar.html"),
  cp("src/renderer/calendar.css", "dist/renderer/calendar.css"),
  cp("src/renderer/events.html", "dist/renderer/events.html"),
  cp("src/renderer/events.css", "dist/renderer/events.css"),
  cp("src/renderer/settings.html", "dist/renderer/settings.html"),
  cp("src/renderer/settings.css", "dist/renderer/settings.css"),
  cp("icons/tray", "dist/renderer/tray", { recursive: true }),
  cp("icons/brands", "dist/renderer/brands", { recursive: true }),
  cp("icons/icon.png", "dist/renderer/icon.png"),
  bundle("src/renderer/calendar.ts", "dist/renderer/calendar.js"),
  bundle("src/renderer/events.ts", "dist/renderer/events.js"),
  bundle("src/renderer/settings.ts", "dist/renderer/settings.js"),
]);
