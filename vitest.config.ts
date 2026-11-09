import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      // `server-only` lève une erreur hors d'un composant serveur Next : neutre en test.
      { find: /^server-only$/, replacement: `${root}/tests/helpers/server-only.ts` },
    ],
  },
  test: {
    // Les calculs métier sont purs : pas de DOM, pas de base, donc environnement node.
    // Les tests d'intégration utilisent PostgreSQL embarqué (PGlite), sans service externe.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    reporters: ["default"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["lib/pricing.ts", "lib/shipping-calc.ts", "lib/hooks.ts", "server/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
