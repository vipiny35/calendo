/**
 * Builds the release disk image, notarized end to end.
 *
 * Tauri notarizes and staples the `.app`, then wraps it in a disk image it
 * never submits, so Gatekeeper rejects the very file a user downloads. This
 * submits the image too and refuses to finish until `spctl` accepts it.
 *
 * Credentials come from `.env.notarization`, which is gitignored:
 * APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD (an app-specific password) and
 * APPLE_SIGNING_IDENTITY. CI can pass them as environment variables instead.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = ".env.notarization";
const DMG_DIR = "src-tauri/target/release/bundle/dmg";
const REQUIRED = ["APPLE_ID", "APPLE_TEAM_ID", "APPLE_PASSWORD"];

function loadCredentials() {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    // Later definitions lose to whatever the environment already carries.
    if (process.env[key]) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

function newestDmg() {
  const files = readdirSync(DMG_DIR)
    .filter((name) => name.endsWith(".dmg"))
    .map((name) => join(DMG_DIR, name));
  if (!files.length) {
    console.error(`No disk image found under ${DMG_DIR}.`);
    process.exit(1);
  }
  return files.sort().at(-1);
}

loadCredentials();

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `Cannot build a release image without ${missing.join(", ")}.\n` +
      `Put them in ${ENV_FILE} (gitignored) or export them, then run again.\n` +
      `For an unnotarized local build: pnpm tauri build --bundles dmg`,
  );
  process.exit(1);
}

run("pnpm", ["tauri", "build", "--bundles", "dmg"], "Bundling");

const dmg = newestDmg();
console.log(`\nNotarizing ${dmg}`);
// The password reaches notarytool as an argument, which is visible to other
// processes on this machine for the life of the call.
run(
  "xcrun",
  [
    "notarytool",
    "submit",
    dmg,
    "--apple-id",
    process.env.APPLE_ID,
    "--team-id",
    process.env.APPLE_TEAM_ID,
    "--password",
    process.env.APPLE_PASSWORD,
    "--wait",
  ],
  "Notarizing the disk image",
);
run("xcrun", ["stapler", "staple", dmg], "Stapling the disk image");
run("spctl", ["--assess", "--type", "install", "-vv", dmg], "Gatekeeper assessment");

console.log(`\nReady to publish: ${dmg}`);
