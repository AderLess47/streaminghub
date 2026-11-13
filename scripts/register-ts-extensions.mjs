import path from "node:path";
import { registerHooks } from "node:module";

/**
 * Die Bibliothek in `src/lib` importiert einander ohne Dateiendung, weil Next.js
 * das auflöst. Node tut das nicht. Dieser Hook ergänzt fehlende Endungen, damit
 * die Tests dieselben Dateien unverändert laden können.
 */
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith(".") || path.extname(specifier) !== "") {
      return next(specifier, context);
    }
    try {
      return next(`${specifier}.ts`, context);
    } catch {
      return next(`${specifier}/index.ts`, context);
    }
  },
});
