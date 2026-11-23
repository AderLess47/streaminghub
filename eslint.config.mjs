import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "android/**",
      "apple/**",
      "store/**",
      "vega/**",
      "ops/**",
      "docs/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Server Actions und Route Handler halten die Signatur mit ungenutzten
      // Parametern ein; ein führender Unterstrich ist die übliche Kennzeichnung.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Build- und Prüfskripte laufen außerhalb des Bundles; dort sind require()
    // und bewusst lose Typen in Test-Harnesses zulässig.
    files: ["scripts/**/*.cjs", "scripts/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
