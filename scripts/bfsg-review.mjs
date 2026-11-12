#!/usr/bin/env node
/**
 * Erinnerung an die jährliche BFSG-Prüfung.
 *
 * `docs/BFSG-ANWENDUNGSBEREICH.md` hält fest, wann die Einordnung zuletzt
 * entschieden wurde. Diese Prüfung schlägt an, wenn die Entscheidung älter als
 * ein Jahr ist oder noch fehlt – dann müssen Beschäftigtenzahl und Umsatz
 * erneut gegen die Schwelle aus § 2 Nr. 17 BFSG gelegt werden.
 *
 * Usage:
 *   npm run bfsg:review
 *   npm run bfsg:review -- --max-days 400
 *   npm run bfsg:review -- --today 2028-03-01    # Datum für einen Testlauf
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(here, "..", "docs", "BFSG-ANWENDUNGSBEREICH.md");

function parseArgs(argv) {
  const options = { maxDays: 365, today: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--max-days") options.maxDays = Number(argv[++i]);
    else if (arg === "--today") options.today = argv[++i];
  }
  return options;
}

/** Liest `Entschieden am: TT.MM.JJJJ` aus dem Entscheidungsblock. */
function readDecisionDate(markdown) {
  const match = markdown.match(/Entschieden am:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function readResult(markdown) {
  const kleinst = /\[x\]\s*Kleinstunternehmen/i.test(markdown);
  const kein = /\[x\]\s*kein Kleinstunternehmen/i.test(markdown);
  if (kleinst) return "Kleinstunternehmen nach § 2 Nr. 17 BFSG";
  if (kein) return "kein Kleinstunternehmen";
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Prüft, ob die BFSG-Einordnung in docs/BFSG-ANWENDUNGSBEREICH.md erneuert werden muss.",
        "",
        "  --max-days <n>   Höchstalter der Entscheidung in Tagen (Standard: 365)",
        "  --today <date>   Stichtag als YYYY-MM-DD (Standard: heute)",
      ].join("\n"),
    );
    return 0;
  }

  let markdown;
  try {
    markdown = readFileSync(DOC_PATH, "utf8");
  } catch {
    console.error("FEHLER: docs/BFSG-ANWENDUNGSBEREICH.md nicht gefunden.");
    return 1;
  }

  const today = options.today ? new Date(`${options.today}T00:00:00Z`) : new Date();
  const decided = readDecisionDate(markdown);
  const result = readResult(markdown);

  if (!decided || Number.isNaN(decided.getTime())) {
    console.error(
      "BFSG-Prüfung überfällig: Im Dokument steht kein ausgefülltes „Entschieden am: TT.MM.JJJJ“.",
    );
    return 1;
  }

  const ageDays = Math.floor((today.getTime() - decided.getTime()) / 86_400_000);
  const decidedText = decided.toISOString().slice(0, 10);

  console.log(`BFSG-Einordnung: ${result ?? "unbekannt"}`);
  console.log(`Entschieden am: ${decidedText} (${ageDays} Tage alt, Grenze ${options.maxDays})`);

  if (!result) {
    console.error("BFSG-Prüfung überfällig: Im Entscheidungsblock ist kein Ergebnis angekreuzt.");
    return 1;
  }

  if (ageDays > options.maxDays) {
    console.error(
      [
        "",
        "BFSG-Prüfung überfällig.",
        "Beschäftigtenzahl und Jahresumsatz bzw. Bilanzsumme erneut erheben und gegen",
        "die Schwelle aus § 2 Nr. 17 BFSG legen (unter 10 Personen und höchstens 2 Mio. €).",
        "Danach in docs/BFSG-ANWENDUNGSBEREICH.md das Datum und das Ergebnis aktualisieren",
        "und bei geänderter Einordnung die Seite /barrierefreiheit prüfen.",
      ].join("\n"),
    );
    return 1;
  }

  console.log("OK: Einordnung ist aktuell.");
  return 0;
}

process.exit(main());
