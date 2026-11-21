import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Der Fokus-Erhalt des Banners ist eine Eigenschaft des Markups, nicht der
// Route: Ein `disabled` an den Wahlknöpfen nimmt sie aus dem Tastaturfluss und
// der Browser setzt den Fokus auf das Dokument zurück. Deshalb prüft dieser
// Test die Quelle – ein Laufzustand im Browser-Stack fehlt dem Projekt und
// würde die Eigenschaft ohnehin nur mit echtem Fokusverhalten belegen.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/components/cookie-consent.tsx"), "utf8");

/** `disabled` als eigenes Attribut; `aria-disabled` beginnt nicht mit Leerraum. */
const DISABLED_ATTRIBUTE = /\sdisabled(?=[\s/>=])/;

const buttons = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]);

test("die Wahlknöpfe sind nicht per disabled gesperrt", () => {
  assert.equal(buttons.length, 2, "genau zwei Wahlknöpfe im Banner erwartet");

  for (const button of buttons) {
    assert.doesNotMatch(
      button,
      DISABLED_ATTRIBUTE,
      "ein gesperrter Knopf verliert den Tastaturfokus; Laufzustand über aria-disabled",
    );
  }
});

test("beide Wahlknöpfe melden den Laufzustand über aria-disabled", () => {
  assert.deepEqual(
    buttons.map((button) => /choose\("(all|necessary)"\)/.exec(button)?.[1]),
    ["all", "necessary"],
    "Reihenfolge und Beschriftung der beiden Wahlknöpfe",
  );

  for (const button of buttons) {
    assert.match(button, /type="button"/, "kein Absenden eines Formulars");
    assert.match(
      button,
      /aria-disabled=\{saving \|\| undefined\}/,
      "aria-disabled muss am Laufzustand hängen",
    );
  }
});

test("choose() verwirft einen zweiten Klick während des Speicherns", () => {
  // `aria-disabled` allein blockiert nichts: Ohne Guard würde ein zweiter
  // Klick eine weitere Anfrage auslösen und die Auswahl doppelt schreiben.
  assert.match(
    source,
    /async function choose\([\s\S]*?\n\s{4}if \(saving\) return;/,
    "Guard am Anfang von choose()",
  );
});
