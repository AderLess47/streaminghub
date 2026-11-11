import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const releaseSource = read("src/content/release.ts");
const downloadPage = read("src/app/download/page.tsx");
const apkRoute = read("src/app/app.apk/route.ts");

function releaseField(name) {
  const match = releaseSource.match(new RegExp(`${name}:\\s*"([^"]+)"`));
  assert.ok(match, `release.ts must declare ${name}`);
  return match[1];
}

const version = releaseField("version");
const fileName = releaseField("fileName");
const releasePath = releaseField("path");
const sha256 = releaseField("sha256");

test("release metadata points at the current versioned APK", () => {
  assert.equal(fileName, `streaminghub-${version}.apk`);
  assert.ok(releasePath.includes(`/${fileName}?v=${sha256}`), "download URL must use the current file and checksum");
});

test("download page uses the stable same-origin APK endpoint", () => {
  const platformUrls = [...downloadPage.matchAll(/url:\s*"([^"]+)"/g)].map((match) => match[1]);

  assert.equal(platformUrls.length, 3, "expected one URL for each download platform");
  assert.deepEqual(platformUrls, ["/app.apk", "/app.apk", "/app.apk"]);
  assert.doesNotMatch(
    downloadPage,
    /env\.downloads\.(fireTv|androidTv|androidMobile)/,
    "platform links must not come from potentially stale environment overrides",
  );
});

test("download page never names an outdated APK file", () => {
  const mentionedFiles = [...downloadPage.matchAll(/streaminghub-\d+\.\d+\.\d+\.apk/g)].map(
    (match) => match[0],
  );

  for (const mentioned of mentionedFiles) {
    assert.equal(mentioned, fileName, `download page references ${mentioned}, expected ${fileName}`);
  }
});

test("short APK endpoint serves the release metadata instead of a hardcoded file", () => {
  assert.match(apkRoute, /androidRelease\.path/, "route must read the generated download URL");
  assert.match(apkRoute, /androidRelease\.fileName/, "route must use the generated file name");
  assert.doesNotMatch(apkRoute, /streaminghub-\d+\.\d+\.\d+\.apk/, "route must not hardcode an APK version");
});

test("release metadata is read from the environment at request time", () => {
  const resolver = read("src/lib/android-release.ts");

  for (const name of [
    "APK_VERSION",
    "APK_VERSION_CODE",
    "APK_FILE_NAME",
    "APK_SHA256",
    "APK_SIZE_BYTES",
    "APK_URL",
  ]) {
    assert.match(resolver, new RegExp(`process\.env\.${name}`), `resolver must read ${name}`);
  }
  assert.match(resolver, /generatedRelease/, "generated release.ts must stay the fallback");
  assert.match(downloadPage, /from "@\/lib\/android-release"/, "download page must use the resolver");
  assert.match(apkRoute, /from "@\/lib\/android-release"/, "APK route must use the resolver");
  assert.match(
    downloadPage,
    /export const dynamic = "force-dynamic"/,
    "download page must render per request, otherwise a release would need a deploy",
  );
});
