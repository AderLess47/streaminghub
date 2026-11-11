import assert from "node:assert/strict";
import test from "node:test";
import { renderRelease, validateRelease } from "./lib/release-file.mjs";

const sha = "a".repeat(64);
const valid = {
  version: "1.2.3",
  versionCode: 6,
  fileName: "streaminghub-1.2.3.apk",
  url: `https://downloads.streaminghub.org/streaminghub-1.2.3.apk?v=${sha}`,
  sizeBytes: 14_284_833,
  sha256: sha,
};

test("accepts a complete release payload", () => {
  const release = validateRelease(valid);

  assert.ok(release, "a complete payload must be accepted");
  assert.equal(release.version, "1.2.3");
  assert.equal(release.fileName, "streaminghub-1.2.3.apk");
  assert.equal(release.sizeLabel, "14 MB");
  assert.equal(release.sha256, sha);
});

test("rejects partial or unsafe release payloads", () => {
  const rejected = [
    null,
    { ...valid, version: "" },
    { ...valid, versionCode: 0 },
    { ...valid, sizeBytes: -1 },
    { ...valid, sha256: "abc" },
    { ...valid, url: "http://downloads.streaminghub.org/streaminghub-1.2.3.apk" },
    { ...valid, fileName: "other.apk" },
  ];

  for (const payload of rejected) {
    assert.equal(validateRelease(payload), null, `expected rejection: ${JSON.stringify(payload)}`);
  }
});

test("renders a stable module for the same release", () => {
  const rendered = renderRelease(validateRelease(valid));

  assert.equal(renderRelease(validateRelease(valid)), rendered, "renderer must be deterministic");
  assert.match(rendered, /export const androidRelease = \{/);
  assert.match(rendered, new RegExp(`sha256: "${sha}"`));
  assert.match(rendered, /sizeLabel: "14 MB"/);
});
