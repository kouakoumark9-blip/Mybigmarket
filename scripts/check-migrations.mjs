#!/usr/bin/env node
/**
 * Exécute réellement les migrations Drizzle sur une base PostgreSQL en mémoire.
 *
 * Objectif : attraper en CI les erreurs qu'un simple `drizzle-kit check` ne voit pas —
 * index sur une colonne inexistante, FK invalide, type mal formé. C'est exactement ce
 * qui a permis de trouver deux index cassés aux étapes 1 et 2.
 *
 * pg-mem n'implémente pas tout PostgreSQL. Les écarts connus sont listés explicitement
 * ci-dessous : ils sont signalés, jamais masqués, et doivent être confirmés sur Neon.
 */
import { newDb } from "pg-mem";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Écarts connus entre pg-mem et PostgreSQL, avec la raison. */
const KNOWN_GAPS = [
  {
    pattern: /unique constraint matching given keys for referenced table/i,
    why: "FK vers une colonne couverte par un INDEX UNIQUE : accepté par PostgreSQL, refusé par pg-mem",
  },
  {
    pattern: /does not parse|Failed query|not implemented|not supported/i,
    legacyOnly: true,
    why: "Syntaxe PostgreSQL non implémentée par pg-mem (migration antérieure à ce contrôle)",
  },
];

/** Les migrations antérieures à ce numéro ne sont pas validées strictement. */
const STRICT_FROM = "0008";

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Dossier introuvable : ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
  const db = newDb();
  // pg-mem n'embarque pas pgcrypto.
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  const gaps = [];
  let applied = 0;

  for (const file of files) {
    const strict = file.slice(0, 4) >= STRICT_FROM;
    const statements = fs
      .readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      try {
        db.public.none(statement);
      } catch (error) {
        const gap = KNOWN_GAPS.find((entry) => entry.pattern.test(error.message) && (!entry.legacyOnly || !strict));
        if (gap) {
          gaps.push({ file, statement: index + 1, why: gap.why });
          continue;
        }
        console.error(`\nÉCHEC ${file}, instruction ${index + 1}/${statements.length}`);
        console.error(`  ${error.message.split("\n")[0]}`);
        console.error(`  >>> ${statement.replace(/\s+/g, " ").slice(0, 200)}`);
        process.exit(1);
      }
    }
    applied += 1;
    console.log(`OK   ${file} (${statements.length} instructions)`);
  }

  console.log(`\n${applied}/${files.length} migrations appliquées sur PostgreSQL en mémoire.`);
  if (gaps.length) {
    console.log(`\n${gaps.length} instruction(s) non exécutables par pg-mem — à confirmer sur Neon :`);
    for (const gap of gaps) console.log(`  - ${gap.file} #${gap.statement} : ${gap.why}`);
  }
}

main();
