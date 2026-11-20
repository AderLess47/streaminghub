/**
 * AsyncStorage-Ersatz für die Headless-Tests.
 *
 * Bildet die Methoden nach, die `src/data/storage.ts` benutzt, und hält alles in
 * einer Map. `scripts/headless-check.mjs` bündelt diesen Mock per esbuild-Alias
 * anstelle von `@react-native-async-storage/async-storage`, damit die echte
 * Speicherlogik unter Node läuft.
 */

const store = new Map<string, string>();

const memoryStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    store.set(key, String(value));
  },

  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },

  async mergeItem(key: string, value: string): Promise<void> {
    const current = store.get(key);
    if (!current) {
      store.set(key, value);
      return;
    }
    store.set(key, JSON.stringify({ ...JSON.parse(current), ...JSON.parse(value) }));
  },

  async clear(): Promise<void> {
    store.clear();
  },

  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },

  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return keys.map((key) => [key, store.get(key) ?? null]);
  },

  async multiSet(pairs: [string, string][]): Promise<void> {
    for (const [key, value] of pairs) store.set(key, String(value));
  },

  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) store.delete(key);
  },

  async flushGetRequests(): Promise<void> {
    return undefined;
  },

  /** Nur für die Tests: alles vergessen, damit Prüfungen unabhängig sind. */
  __reset(): void {
    store.clear();
  },

  /** Nur für die Tests: Rohinhalt eines Schlüssels, ohne JSON-Auswertung. */
  __raw(key: string): string | null {
    return store.get(key) ?? null;
  },
};

export default memoryStorage;
