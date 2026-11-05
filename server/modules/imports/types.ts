import type { ZodType } from "zod";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import type { Db } from "@/server/core/db";
import type { PermissionCode } from "@/server/core/permissions";
import type { Context } from "@/server/modules/catalog/shared";
import type { ImportRow, RowMessage } from "@/server/modules/imports/parsers";

/** Colonne reconnue d'un import : clé canonique (en-tête du modèle), en-têtes acceptés, aide. */
export type ColumnSpec = { key: string; label: string; aliases: string[]; description: string; example: string; requiredForCreate?: boolean };

export type PlannedAction = "create" | "update" | "skip" | "error";
export type ApplyResult = { status: "created" | "updated" | "skipped"; entityId: string | null; messages?: RowMessage[] };

/** Résultat de l'analyse d'une ligne : action prévue, messages, et l'écriture à exécuter. */
export type RowPlan = { action: PlannedAction; messages: RowMessage[]; apply?: (database: Db, context: Context) => Promise<ApplyResult> };

/**
 * Entité importable. `planner` charge en une fois ce qu'il faut pour toutes les lignes (références
 * existantes, catégories, marques, vendeurs) puis rend une fonction qui planifie chaque ligne :
 * l'analyse de 1 000 lignes coûte quelques requêtes, et non quelques milliers.
 */
export type ImportEntity<O = Record<string, unknown>> = {
  code: "products" | "categories" | "brands";
  label: string;
  /** Au moins une de ces colonnes doit figurer dans l'en-tête. */
  identifyingColumns: string[];
  columns: ColumnSpec[];
  optionsSchema: ZodType<O>;
  permissions: { create: PermissionCode; update: PermissionCode };
  planner: (database: Db, rows: ImportRow[], options: O, actor: AdminPrincipal) => Promise<(row: ImportRow) => RowPlan>;
};
