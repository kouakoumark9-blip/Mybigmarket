/**
 * Le diagramme versionné (docs/backend/schema-base-de-donnees.md) reflète exactement lib/db/schema.ts :
 * après toute modification du schéma, régénérez-le avec `npm run docs:db`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIAGRAM_PATH, renderDatabaseDiagram } from "../scripts/db-diagram";

describe("diagramme de la base", () => {
  it("est à jour avec le schéma", () => {
    expect(readFileSync(DIAGRAM_PATH, "utf8")).toBe(renderDatabaseDiagram());
  });

  it("classe chaque table dans un domaine et montre chaque clé étrangère", () => {
    const diagram = renderDatabaseDiagram();
    expect(diagram).not.toContain("## Autres");
    expect(diagram).toMatch(/\*\*1\d\d tables, \d+ clés étrangères\.\*\*/);
    expect(diagram).toContain('ORDERS ||--o{ ORDER_ITEMS : "order_id"');
  });
});
