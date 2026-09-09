import { describe, expect, it } from "vitest";
import { TARGET, payloadUrl, updaterManifest } from "../scripts/updater-manifest.mjs";

const base = {
  version: "v0.3.0",
  notes: "Fixes things",
  signature: "dW50cnVzdGVk",
  url: "https://github.com/o/r/releases/download/v0.3.0/Calendo.app.tar.gz",
  date: new Date("2026-09-09T12:00:00Z"),
};

describe("updater manifest", () => {
  it("offers the version without the tag's v", () => {
    // The app compares this against its own version, which has no v.
    expect(updaterManifest(base).version).toBe("0.3.0");
    expect(updaterManifest({ ...base, version: "0.3.0" }).version).toBe("0.3.0");
  });

  it("carries the signature and payload for the shipped target", () => {
    const manifest = updaterManifest(base);
    expect(manifest.platforms[TARGET]).toEqual({
      signature: base.signature,
      url: base.url,
    });
    expect(manifest.pub_date).toBe("2026-09-09T12:00:00.000Z");
    expect(manifest.notes).toBe("Fixes things");
  });

  it("refuses a manifest nothing could verify", () => {
    expect(() => updaterManifest({ ...base, signature: "" })).toThrow(/signature/);
    expect(() => updaterManifest({ ...base, version: "" })).toThrow(/version/);
    expect(() => updaterManifest({ ...base, url: "" })).toThrow(/URL/);
  });

  it("points at the asset the tag publishes", () => {
    expect(
      payloadUrl({ repository: "o/r", tag: "v0.3.0", file: "Calendo.app.tar.gz" }),
    ).toBe("https://github.com/o/r/releases/download/v0.3.0/Calendo.app.tar.gz");
  });
});
