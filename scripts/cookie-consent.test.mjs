import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Der Fokus bleibt im Banner nur, solange die Wahlknöpfe nicht gesperrt sind:
// `disabled` nimmt sie aus dem Tastaturfluss. Geprüft wird die Quelle, weil das
// Projekt keinen DOM-Teststack hat.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/components/cookie-consent.tsx"), "utf8");

const buttons = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]);

/** Der Wahlknopf zu einer Auswahl; Prettier-Formatierung darf ihn nicht verschieben. */
function choiceButton(choice) {
  const button = buttons.find((candidate) =>
    new RegExp(`choose\\(["']${choice}["']\\)`).test(candidate),
  );
  assert.ok(button, `Wahlknopf für "${choice}" im Banner erwartet`);
  return button;
}

test("kein Wahlknopf ist per disabled gesperrt", () => {
  for (const button of [choiceButton("all"), choiceButton("necessary")]) {
    assert.doesNotMatch(
      button,
      /\sdisabled(?=[\s/>=])/,
      "ein gesperrter Knopf verliert den Tastaturfokus; Laufzustand über aria-disabled",
    );
  }
});

test("beide Wahlknöpfe melden den Laufzustand über aria-disabled", () => {
  for (const button of [choiceButton("all"), choiceButton("necessary")]) {
    assert.match(button, /type=["']button["']/, "kein Absenden eines Formulars");
    assert.match(
      button,
      /aria-disabled=\{\s*saving\s*\|\|\s*undefined\s*\}/,
      "aria-disabled muss am Laufzustand hängen",
    );
  }
});

test("choose() verwirft einen zweiten Klick während des Speicherns", () => {
  // `aria-disabled` allein blockiert nichts: Ohne Guard würde ein zweiter
  // Klick eine weitere Anfrage auslösen und die Auswahl doppelt schreiben.
  assert.match(
    source,
    /async function choose\([\s\S]*?if \(saving\)\s+return;[\s\S]*?setSaving\(true\);/,
    "Guard vor dem Laufzustand in choose()",
  );
});
