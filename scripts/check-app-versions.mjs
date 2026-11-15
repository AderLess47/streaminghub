#!/usr/bin/env node
/**
 * Android, Apple und Vega OS müssen dieselbe Marketing-Version tragen. Die
 * Build-Nummern bleiben plattformeigen, weil die Stores sie unabhängig zählen.
 *
 * Aufruf: npm run check:app-versions
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const android = read("android/app/build.gradle.kts").match(/versionName\s*=\s*"([^"]+)"/)?.[1];
const androidCode = read("android/app/build.gradle.kts").match(/versionCode\s*=\s*(\d+)/)?.[1];
const apple = read("apple/project.yml").match(/MARKETING_VERSION:\s*"([^"]+)"/)?.[1];
const appleBuild = read("apple/project.yml").match(/CURRENT_PROJECT_VERSION:\s*"([^"]+)"/)?.[1];
const vega = read("vega/manifest.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const vegaPackage = JSON.parse(read("vega/package.json")).version;
const vegaApp = read("vega/src/app.tsx").match(/const APP_VERSION\s*=\s*"([^"]+)"/)?.[1];

const versions = { Android: android, Apple: apple, Vega: vega, "Vega package.json": vegaPackage, "Vega App": vegaApp };
const missing = Object.entries(versions).filter(([, value]) => !value);
if (missing.length > 0) {
  console.error(`Version nicht gefunden: ${missing.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  console.error("Marketing-Versionen laufen auseinander:");
  for (const [name, value] of Object.entries(versions)) console.error(`  ${name}: ${value}`);
  process.exit(1);
}

for (const [name, value] of [
  ["Android versionCode", androidCode],
  ["Apple CURRENT_PROJECT_VERSION", appleBuild],
]) {
  if (!value || !Number.isInteger(Number(value)) || Number(value) < 1) {
    console.error(`${name} fehlt oder ist keine positive Ganzzahl: ${value}`);
    process.exit(1);
  }
}

console.log(`OK: Android, Apple und Vega stehen auf ${android} (Android ${androidCode}).`);
