import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Seit #366/#367 hält `aria-disabled` den Fokus auf dem auslösenden Knopf,
// während eine Aktion läuft; ein `disabled` nimmt ihn aus dem Tastaturfluss.
// Geprüft wird die Quelle, weil das Projekt keinen DOM-Teststack hat: Ein
// Laufzustand im Browser lässt sich hier nicht auslösen. Alle Regeln lesen
// den TSX-Baum, nicht den Rohtext.
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

/** Datei als TSX-Baum: Ein `disabled={…}` im Fließtext eines Strings ist kein Knoten. */
function parse(file) {
  const target = path.join(componentsDir, file);
  assert.ok(existsSync(target), `${file}: Datei fehlt oder wurde umbenannt`);
  return ts.createSourceFile(
    file,
    readFileSync(target, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
}

function walk(node, visit) {
  if (visit(node) === false) return;
  node.forEachChild((child) => walk(child, visit));
}

/** Die JSX-Attribute der Datei; `disabledLabel` und Tailwinds `disabled:` sind keine. */
function attributesOf(file) {
  const tree = parse(file);
  const attributes = [];
  walk(tree, (node) => {
    if (ts.isJsxAttribute(node)) {
      attributes.push({
        name: node.name.getText(tree),
        value: node.initializer
          ? ts.isStringLiteral(node.initializer)
            ? node.initializer.text
            : node.initializer.getText(tree).slice(1, -1)
          : null,
      });
    }
  });
  return attributes;
}

/** Erstes Funktionsobjekt mit diesem Namen – Deklaration oder Zuweisung. */
function functionNamed(tree, name) {
  let found = null;
  walk(tree, (node) => {
    if (found) return false;
    if (ts.isFunctionDeclaration(node) && node.name?.getText(tree) === name) found = node;
    else if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      found = node.initializer;
  });
  return found;
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
  const tree = parse("cookie-consent.tsx");
  const choose = functionNamed(tree, "choose");
  assert.ok(choose, "cookie-consent.tsx: choose() fehlt oder wurde umbenannt");

  const positions = { guard: null, setter: null };
  walk(choose, (node) => {
    const start = node.getStart(tree);
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(tree) === "saving" &&
      ts.isReturnStatement(node.thenStatement) &&
      !node.thenStatement.expression
    ) {
      positions.guard ??= start;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.getText(tree) === "setSaving" &&
      node.arguments.some((argument) => argument.getText(tree) === "true")
    ) {
      positions.setter ??= start;
    }
  });

  assert.notEqual(positions.guard, null, "`if (saving) return;` fehlt in choose()");
  assert.notEqual(positions.setter, null, "`setSaving(true)` fehlt in choose()");
  assert.ok(positions.guard < positions.setter, "Guard muss vor setSaving(true) stehen");
});
