/**
 * The manifest the app checks for updates against.
 *
 * Tauri builds the update payload and its signature but not this file, so the
 * release step writes it. The app verifies `signature` against the public key
 * compiled into it, which is why the signature travels in the manifest rather
 * than beside the download.
 */

/** The only target this project ships; Intel Macs build from source. */
export const TARGET = "darwin-aarch64";

export function updaterManifest({ version, notes, signature, url, date = new Date() }) {
  if (!version) throw new Error("a manifest needs the version it offers");
  if (!signature) throw new Error("a manifest without a signature cannot be verified");
  if (!url) throw new Error("a manifest needs the URL of the update payload");
  return {
    // The app compares this to its own version, so it carries no leading v.
    version: version.replace(/^v/, ""),
    notes,
    pub_date: date.toISOString(),
    platforms: {
      [TARGET]: { signature, url },
    },
  };
}

/** Where the release publishes the payload a given tag's manifest points at. */
export function payloadUrl({ repository, tag, file }) {
  return `https://github.com/${repository}/releases/download/${tag}/${file}`;
}
