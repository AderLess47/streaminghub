/**
 * Teaches plain Node the extensionless relative imports the Next.js app uses,
 * so the persistence modules can run in `node --test` unchanged.
 *
 * Import this file before the dynamic imports of a test – static imports are
 * evaluated first, which is exactly the order the hook needs.
 */
import * as nodeModule from "node:module";

const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown,
    ) => unknown;
  }) => void;
};

registerHooks?.({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(specifier, context);
      } catch {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
