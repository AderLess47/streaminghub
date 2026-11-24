import assert from "node:assert/strict";
import test from "node:test";
import { audit, FILES, inspect } from "./check-app-versions.mjs";

// Dieselbe Version in allen fuenf Quellen; die Build-Nummern weichen ab, weil
// die Stores sie unabhaengig zaehlen.
const sources = () => ({
  android: 'android {\n  defaultConfig {\n    versionCode = 6\n    versionName = "1.2.3"\n  }\n}\n',
  apple: 'settings:\n  MARKETING_VERSION: "1.2.3"\n  CURRENT_PROJECT_VERSION: "6"\n',
  vegaManifest: '[package]\nname = "streaminghub"\nversion = "1.2.3"\n',
  vegaPackage: '{\n  "name": "vega",\n  "version": "1.2.3"\n}\n',
  vegaApp: 'const APP_VERSION = "1.2.3";\n',
});

test("akzeptiert dieselbe Version in allen Quellen", () => {
  const { versions, buildNumbers, findings } = inspect(sources());

  assert.deepEqual(findings, []);
  assert.equal(versions.Android, "1.2.3");
  assert.equal(versions["Vega package.json"], "1.2.3");
  assert.equal(buildNumbers["Android versionCode"], "6");
});

test("meldet eine auseinandergelaufene Version mit allen Werten", () => {
  const drifted = { ...sources(), apple: 'settings:\n  MARKETING_VERSION: "1.2.4"\n' };
  const { findings } = inspect(drifted);

  assert.equal(findings.length, 1);
  assert.match(findings[0].snippet, /auseinander/);
  for (const value of ["Android: 1.2.3", "Apple: 1.2.4", "Vega: 1.2.3"]) {
    assert.ok(findings[0].hint.includes(value), `Hinweis nennt ${value}`);
  }
});

test("meldet jede fehlende Quellenangabe an ihrer Datei", () => {
  const missing = { ...sources(), android: "android {\n  defaultConfig { }\n}\n" };
  const { findings } = inspect(missing);

  assert.equal(findings.length, 1);
  assert.match(findings[0].snippet, /fehlt \(Android\)/);
  assert.equal(findings[0].file, FILES.android);
  assert.match(findings[0].hint, /versionName/);
});

test("liest die Vega-Version nur aus der Schluesselzeile", () => {
  const manifest = '[package]\nsubversion = "9.9.9"\nversion = "1.2.3"\n';
  const { versions, findings } = inspect({ ...sources(), vegaManifest: manifest });

  assert.deepEqual(findings, []);
  assert.equal(versions.Vega, "1.2.3");
});

test("nimmt versionCode und CURRENT_PROJECT_VERSION getrennt von der Marketing-Version", () => {
  // Build-Nummern duerfen abweichen, ohne dass der Abgleich meckert.
  const builds = { ...sources(), apple: 'settings:\n  MARKETING_VERSION: "1.2.3"\n  CURRENT_PROJECT_VERSION: "42"\n' };
  assert.deepEqual(inspect(builds).findings, []);
  assert.equal(inspect(builds).buildNumbers["Apple CURRENT_PROJECT_VERSION"], "42");
});

test("lehnt versionCode 0 und Nicht-Zahlen ab", () => {
  for (const broken of ["versionCode = 0", "versionCode = beta"]) {
    const github = { ...sources(), android: `defaultConfig {\n  ${broken}\n  versionName = "1.2.3"\n}\n` };
    const { findings } = inspect(github);

    assert.equal(findings.length, 1, broken);
    assert.match(findings[0].snippet, /Android versionCode/);
    assert.equal(findings[0].file, FILES.android);
  }
});

test("lehnt eine fehlende Apple-Build-Nummer ab", () => {
  const noBuild = { ...sources(), apple: 'settings:\n  MARKETING_VERSION: "1.2.3"\n' };
  const { findings } = inspect(noBuild);

  assert.equal(findings.length, 1);
  assert.match(findings[0].snippet, /CURRENT_PROJECT_VERSION.*fehlt/);
  assert.equal(findings[0].file, FILES.apple);
});

test("meldet eine unlesbare vega/package.json als fehlende Quelle", () => {
  const broken = { ...sources(), vegaPackage: '{ "version": ' };
  const { findings } = inspect(broken);

  assert.equal(findings.length, 1);
  assert.match(findings[0].snippet, /fehlt \(Vega package\.json\)/);
  assert.equal(findings[0].file, FILES.vegaPackage);
});

test("meldet eine Version im Unterobjekt nicht als Top-Level-Version", () => {
  const nested = { ...sources(), vegaPackage: '{\n  "name": "vega",\n  "deps": { "version": "1.2.3" }\n}\n' };
  const { findings } = inspect(nested);

  assert.equal(findings.length, 1);
  assert.match(findings[0].snippet, /fehlt \(Vega package\.json\)/);
});

test("dieses Repository haelt die Marketing-Versionen zusammen", async () => {
  const { versions, findings } = await audit();

  assert.deepEqual(findings, []);
  assert.equal(versions.Android, versions.Apple);
  assert.equal(versions.Android, versions.Vega);
});
