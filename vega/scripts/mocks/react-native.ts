/**
 * Minimaler React-Native-Ersatz für die Headless-Tests.
 *
 * Nur die Geräteabfragen aus `src/data/diagnostics.ts` werden gebraucht;
 * Oberflächen und native Module bleiben außen vor. `scripts/headless-run.mjs`
 * bündelt diesen Mock per esbuild-Alias anstelle von `react-native`.
 */

const Dimensions = {
  get: (_dimension: "window" | "screen") => ({ width: 1920, height: 1080 }),
};

const PixelRatio = {
  get: () => 1,
};

const Platform = {
  OS: "vega",
  Version: "1",
  constants: { Model: "Headless", Manufacturer: "Test" },
};

export { Dimensions, PixelRatio, Platform };
export default { Dimensions, PixelRatio, Platform };
