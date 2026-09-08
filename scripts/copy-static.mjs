import { cp, mkdir } from "node:fs/promises";
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
await Promise.all([
  cp("src/renderer/calendar.html", "dist/renderer/calendar.html"),
  cp("src/renderer/calendar.css", "dist/renderer/calendar.css"),
  cp("src/renderer/settings.html", "dist/renderer/settings.html"),
  cp("src/renderer/settings.css", "dist/renderer/settings.css"),
  bundle("src/renderer/calendar.ts", "dist/renderer/calendar.js"),
  bundle("src/renderer/settings.ts", "dist/renderer/settings.js"),
]);
