import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les calculs métier sont purs : pas de DOM, pas de base, donc environnement node.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // `adminnew` a son propre tsconfig et ses propres dépendances.
    exclude: ["node_modules", "adminnew", ".next"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["lib/pricing.ts", "lib/shipping-calc.ts", "lib/hooks.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
