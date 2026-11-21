import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Seit #366/#367 hält `aria-disabled` den Fokus auf dem auslösenden Knopf,
// während eine Aktion läuft; ein `disabled` nimmt ihn aus dem Tastaturfluss.
// Geprüft wird die Quelle, weil das Projekt keinen DOM-Teststack hat: Ein
// Laufzustand im Browser lässt sich hier nicht auslösen.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(root, "src/components");

/**
 * Die in #366/#367 umgestellten Komponenten – feste Liste, keine Entdeckung:
 * Wer eine Datei vollständig auf `disabled` zurückbaut, würde sonst aus der
 * Prüfung herausfallen und der Test bliebe grün.
 */
const COMPONENTS = [
  "activate-form.tsx",
  "admin-mfa-form.tsx",
  "auth-forms.tsx",
  "backup-panel.tsx",
  "cancel-subscription-form.tsx",
  "cancellation-form.tsx",
  "checkout-button.tsx",
  "contact-form.tsx",
  "cookie-consent.tsx",
  "dashboard-forms.tsx",
  "language-switcher.tsx",
  "mfa-setup-form.tsx",
  "resend-verification.tsx",
  "retention-offer.tsx",
  "start-trial-button.tsx",
  "withdrawal-form.tsx",
];

// Jedes `disabled` im Markup, auch an `<input>` und `<select>` und auch ohne
// Wert. Nicht getroffen werden `aria-disabled` (davor steht ein „-“),
// `disabledLabel` (Wortzeichen) und Tailwinds `disabled:` (Doppelpunkt).
const DISABLED = /\sdisabled(?![\w:-])(=\{([^}]+)\})?/g;
const ARIA_DISABLED = /aria-disabled=\{[^}]*\|\|\s*undefined\s*\}/g;

/** Ausnahme: hängt an der Eingabe, nicht am Laufzustand – der Fokus liegt im Feld. */
const ALLOWED_DISABLED = { "activate-form.tsx": ["code.length < 8 || undefined"] };

/** Leerraum in Bedingungen ist Formatierung, nicht Verhalten. */
const normalize = (expression) => expression.replace(/\s+/g, " ").trim();

/** Kommentare zählen nicht mit: Ein Satz über `disabled` sperrt nichts. */
function sourceOf(file) {
  const target = path.join(componentsDir, file);
  assert.ok(existsSync(target), `${file}: Datei fehlt oder wurde umbenannt`);
  return readFileSync(target, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");
}

test("kein Element sperrt sich am Laufzustand", () => {
  for (const file of COMPONENTS) {
    const allowed = (ALLOWED_DISABLED[file] ?? []).map(normalize);
    const found = [...sourceOf(file).matchAll(DISABLED)]
      .map(([, , expression]) => (expression ? normalize(expression) : "(ohne Wert)"))
      .filter((expression) => !allowed.includes(expression));

    assert.deepEqual(
      found,
      [],
      `${file}: disabled nimmt das Element aus dem Tastaturfluss und ignoriert es für Screenreader; Laufzustand über aria-disabled`,
    );
  }
});

test("jede Komponente meldet den Laufzustand über aria-disabled", () => {
  for (const file of COMPONENTS) {
    const source = sourceOf(file);
    const aria = (source.match(/aria-disabled=/g) ?? []).length;
    assert.ok(aria > 0, `${file}: kein aria-disabled mehr vorhanden`);
    assert.equal(
      (source.match(ARIA_DISABLED) ?? []).length,
      aria,
      `${file}: alle ${aria} aria-disabled müssen am Laufzustand hängen`,
    );
  }
});

/**
 * Gegenrichtung zur Liste: Eine neu umgestellte Komponente würde sonst
 * ungeprüft bleiben. Wer `aria-disabled` einführt, trägt sie hier ein.
 */
test("keine Komponente mit aria-disabled fehlt in der Liste", () => {
  const unlisted = readdirSync(componentsDir)
    .filter((file) => file.endsWith(".tsx") && !COMPONENTS.includes(file))
    .filter((file) => sourceOf(file).includes("aria-disabled"));

  assert.deepEqual(unlisted, [], "in COMPONENTS eintragen, damit die Fokus-Regeln für sie gelten");
});

test("Cookie-Banner: choose() verwirft einen zweiten Klick während des Speicherns", () => {
  // `aria-disabled` allein blockiert nichts: Ohne Guard würde ein zweiter
  // Klick eine weitere Anfrage auslösen und die Auswahl doppelt schreiben.
  assert.match(
    sourceOf("cookie-consent.tsx"),
    /async function choose\([\s\S]*?if \(saving\)\s+return;[\s\S]*?setSaving\(true\);/,
    "Guard vor dem Laufzustand in choose()",
  );
});
