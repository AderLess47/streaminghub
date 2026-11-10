import { getDb } from "./db";
import { ensureSeed } from "./seed";

type Cache = typeof globalThis & { __streaminghubBootstrapped?: boolean };

/**
 * Creates the schema and seeds FAQ/settings plus the initial administrator
 * (only when ADMIN_EMAIL and ADMIN_PASSWORD are provided). Safe to call often.
 */
export function bootstrap() {
  const cache = globalThis as Cache;
  if (cache.__streaminghubBootstrapped) return;
  getDb();
  ensureSeed();
  cache.__streaminghubBootstrapped = true;
}
