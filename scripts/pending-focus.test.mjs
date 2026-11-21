import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Seit #366/#367 hält `aria-disabled` den Fokus auf dem auslösenden Knopf,
// während eine Aktion läuft; ein `disabled` nimmt ihn aus dem Tastaturfluss.
// Geprüft wird die Quelle, weil das Projekt keinen DOM-Teststack hat: Ein
// Laufzustand im Browser lässt sich hier nicht auslösen.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(root, "src/components");

const components = readdirSync(componentsDir)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, source: readFileSync(path.join(componentsDir, file), "utf8") }))
  .filter(({ source }) => source.includes("aria-disabled"));

const BUTTON = /<button\b[\s\S]*?<\/button>/g;
const DISABLED = /\sdisabled=\{([^}]+)\}/g;
const ARIA_DISABLED = /aria-disabled=\{\s*[\w.]+(?:\s*!==\s*null)?\s*\|\|\s*undefined\s*\}/g;

/**
 * Ausgenommene `disabled`-Bindungen: Sie hängen an der Eingabe, nicht am
 * Laufzustand, und der Fokus liegt dann im Eingabefeld, nicht auf dem Knopf.
 */
const ALLOWED_DISABLED = { "activate-form.tsx": ["code.length < 8 || undefined"] };

test("die umgestellten Komponenten werden gefunden", () => {
  assert.ok(
    components.some(({ file }) => file === "cookie-consent.tsx") &&
      components.some(({ file }) => file === "dashboard-forms.tsx"),
    `nur ${components.length} Komponenten mit aria-disabled gefunden`,
  );
});

test("kein Knopf sperrt sich am Laufzustand", () => {
  for (const { file, source } of components) {
    const allowed = ALLOWED_DISABLED[file] ?? [];
    const found = [...source.matchAll(BUTTON)]
      .flatMap(([button]) => [...button.matchAll(DISABLED)].map(([, expression]) => expression.trim()))
      .filter((expression) => !allowed.includes(expression));

    assert.deepEqual(
      found,
      [],
      `${file}: disabled nimmt den Knopf aus dem Tastaturfluss; Laufzustand über aria-disabled`,
    );
  }
});

test("jede Komponente meldet den Laufzustand über aria-disabled", () => {
  for (const { file, source } of components) {
    const aria = (source.match(/aria-disabled=/g) ?? []).length;
    assert.equal(
      (source.match(ARIA_DISABLED) ?? []).length,
      aria,
      `${file}: alle ${aria} aria-disabled müssen am Laufzustand hängen`,
    );
  }
});

test("Cookie-Banner: choose() verwirft einen zweiten Klick während des Speicherns", () => {
  // `aria-disabled` allein blockiert nichts: Ohne Guard würde ein zweiter
  // Klick eine weitere Anfrage auslösen und die Auswahl doppelt schreiben.
  const source = components.find(({ file }) => file === "cookie-consent.tsx").source;
  assert.match(
    source,
    /async function choose\([\s\S]*?if \(saving\)\s+return;[\s\S]*?setSaving\(true\);/,
    "Guard vor dem Laufzustand in choose()",
  );
});
