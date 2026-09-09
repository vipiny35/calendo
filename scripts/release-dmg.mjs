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
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { payloadUrl, updaterManifest } from "./updater-manifest.mjs";

const ENV_FILE = ".env.notarization";
const DMG_DIR = "src-tauri/target/release/bundle/dmg";
const MACOS_DIR = "src-tauri/target/release/bundle/macos";
const REQUIRED = ["APPLE_ID", "APPLE_TEAM_ID", "APPLE_PASSWORD"];
/// Where `tauri signer generate` put the key; kept out of the repo.
const SIGNING_KEY = join(homedir(), ".calendo", "updater.key");
const REPOSITORY = "vipiny35/calendo";

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

/// The private key signs the update payload; without it the app would refuse
/// every update it is offered.
function loadSigningKey() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) return;
  if (!existsSync(SIGNING_KEY)) {
    console.error(
      `No update signing key at ${SIGNING_KEY}.\n` +
        `Generate one with: pnpm tauri signer generate -w ${SIGNING_KEY}\n` +
        `Keep it out of the repository, and keep a backup: an update signed by\n` +
        `any other key is refused by every copy already installed.`,
    );
    process.exit(1);
  }
  process.env.TAURI_SIGNING_PRIVATE_KEY = SIGNING_KEY;
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
}

function findOne(directory, suffix, label) {
  const files = existsSync(directory)
    ? readdirSync(directory).filter((name) => name.endsWith(suffix))
    : [];
  if (files.length !== 1) {
    console.error(
      `Expected exactly one ${label} in ${directory}, found ${files.length}.`,
    );
    process.exit(1);
  }
  return join(directory, files[0]);
}

/// Writes the manifest the app fetches, pointing at the payload this tag will
/// publish. The version comes from the build, so the two cannot drift.
function writeManifest(version) {
  const payload = findOne(MACOS_DIR, ".app.tar.gz", "update payload");
  const signature = readFileSync(`${payload}.sig`, "utf8").trim();
  const tag = `v${version}`;
  const manifest = updaterManifest({
    version,
    notes: `See https://github.com/${REPOSITORY}/releases/tag/${tag}`,
    signature,
    url: payloadUrl({ repository: REPOSITORY, tag, file: payload.split("/").pop() }),
  });
  const path = join(DMG_DIR, "latest.json");
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest: path, payload, signature: `${payload}.sig` };
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
loadSigningKey();

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `Cannot build a release image without ${missing.join(", ")}.\n` +
      `Put them in ${ENV_FILE} (gitignored) or export them, then run again.\n` +
      `For an unnotarized local build: pnpm tauri build --bundles dmg`,
  );
  process.exit(1);
}

// The updater payload is built from the app bundle, so both targets run.
run("pnpm", ["tauri", "build", "--bundles", "app,dmg"], "Bundling");

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

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const update = writeManifest(version);

console.log(`\nReady to publish v${version}. Upload all three:`);
for (const file of [dmg, update.payload, update.manifest]) {
  console.log(`  ${file}`);
}
console.log(
  `\n  gh release create v${version} --target main \\\n` +
    `    ${dmg} \\\n    ${update.payload} \\\n    ${update.manifest}`,
);
console.log(
  "\nlatest.json is what installed copies read, so a release without it\n" +
    "offers nothing and one without the payload offers a broken download.",
);
