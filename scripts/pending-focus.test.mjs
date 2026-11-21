import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

/** Ausnahme: hängt an der Eingabe, nicht am Laufzustand – der Fokus liegt im Feld. */
const ALLOWED_DISABLED = { "activate-form.tsx": ["code.length < 8 || undefined"] };

/** Leerraum in Bedingungen ist Formatierung, nicht Verhalten. */
const normalize = (expression) => expression.replace(/\s+/g, " ").trim();

function componentSource(file) {
  const target = path.join(componentsDir, file);
  assert.ok(existsSync(target), `${file}: Datei fehlt oder wurde umbenannt`);
  // Kommentare zählen nicht mit: Ein Satz über `disabled` sperrt nichts.
  return readFileSync(target, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");
}

/**
 * Die JSX-Attribute der Datei, vom Parser gelesen statt gesucht: Ein
 * `disabled={…}` als Fließtext in einem String-Literal ist damit kein Treffer,
 * ebenso wenig `disabledLabel` oder Tailwinds `disabled:`.
 */
function attributesOf(file) {
  const source = ts.createSourceFile(
    file,
    componentSource(file),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const attributes = [];
  const walk = (node) => {
    if (ts.isJsxAttribute(node)) {
      attributes.push({
        name: node.name.getText(source),
        value: node.initializer
          ? ts.isStringLiteral(node.initializer)
            ? node.initializer.text
            : node.initializer.getText(source).slice(1, -1)
          : null,
      });
    }
    node.forEachChild(walk);
  };
  walk(source);
  return attributes;
}

test("kein Element sperrt sich am Laufzustand", () => {
  for (const file of COMPONENTS) {
    const allowed = (ALLOWED_DISABLED[file] ?? []).map(normalize);
    const found = attributesOf(file)
      .filter(({ name }) => name === "disabled")
      .map(({ value }) => (value === null ? "(ohne Wert)" : normalize(value)))
      .filter((value) => !allowed.includes(value));

    assert.deepEqual(
      found,
      [],
      `${file}: disabled nimmt das Element aus dem Tastaturfluss und ignoriert es für Screenreader; Laufzustand über aria-disabled`,
    );
  }
});

test("jede Komponente meldet den Laufzustand über aria-disabled", () => {
  for (const file of COMPONENTS) {
    const aria = attributesOf(file).filter(({ name }) => name === "aria-disabled");
    assert.ok(aria.length > 0, `${file}: kein aria-disabled mehr vorhanden`);
    assert.deepEqual(
      aria.filter(({ value }) => !/\|\| undefined$/.test(normalize(value ?? ""))),
      [],
      `${file}: alle ${aria.length} aria-disabled müssen am Laufzustand hängen`,
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
    .filter((file) => attributesOf(file).some(({ name }) => name === "aria-disabled"));

  assert.deepEqual(unlisted, [], "in COMPONENTS eintragen, damit die Fokus-Regeln für sie gelten");
});

test("Cookie-Banner: choose() verwirft einen zweiten Klick während des Speicherns", () => {
  // `aria-disabled` allein blockiert nichts: Ohne Guard würde ein zweiter
  // Klick eine weitere Anfrage auslösen und die Auswahl doppelt schreiben.
  assert.match(
    componentSource("cookie-consent.tsx"),
    /async function choose\([\s\S]*?if \(saving\)\s+return;[\s\S]*?setSaving\(true\);/,
    "Guard vor dem Laufzustand in choose()",
  );
});
