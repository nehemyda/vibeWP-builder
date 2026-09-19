/**
 * The backup's restore order, asserted against the real foreign keys.
 *
 * Run with `npx tsx lib/db/verify-backup-order.ts`, and as part of
 * `npm run verify`. Reads no database — this is a fact about the schema.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * The dump takes every table in pg_tables, so nothing is ever MISSING from a
 * backup. What a table can lose is its place: anything not named in
 * RESTORE_ORDER used to be appended alphabetically, and the .sql is replayed
 * top to bottom.
 *
 * That was FK-safe by coincidence. form_submissions references
 * form_definitions and restored only because "form_d" sorts before "form_s".
 * A table added tomorrow that sorts before its own parent breaks the restore
 * and nothing says so — the dump still succeeds, the file still looks right,
 * and the failure surfaces on the one day someone is restoring.
 *
 * So this walks drizzle's own foreign-key metadata rather than a list written
 * by hand: the gate reads what the ORM reads, and cannot drift from it.
 * ─────────────────────────────────────────────────────────────────────
 */
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { RESTORE_ORDER } from "./backup-db";
import * as schema from "./schema";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/** Every pgTable the schema declares, by its SQL name. */
const tables = new Map<string, ReturnType<typeof getTableConfig>>();
for (const value of Object.values(schema)) {
  try {
    const cfg = getTableConfig(value as PgTable);
    if (cfg?.name) tables.set(cfg.name, cfg);
  } catch {
    /* Not a table — enums, types, helpers. */
  }
}

console.log(`== ${tables.size} tables, ${RESTORE_ORDER.length} named in RESTORE_ORDER ==`);

/* 1. Every table has a declared place. */
const unnamed = [...tables.keys()].filter((t) => !RESTORE_ORDER.includes(t)).sort();
if (unnamed.length) {
  fail(
    `not named in RESTORE_ORDER, so they restore in alphabetical order:\n       ${unnamed.join(", ")}`,
  );
} else {
  console.log("  ok   every table has a declared place");
}

/* 2. Nothing is named twice — a duplicate means one of them is dead. */
const seen = new Set<string>();
for (const t of RESTORE_ORDER) {
  if (seen.has(t)) fail(`named twice in RESTORE_ORDER: ${t}`);
  seen.add(t);
}

/* 3. Every parent is restored before its children. */
const at = new Map(RESTORE_ORDER.map((t, i) => [t, i]));
let edges = 0;

for (const [name, cfg] of tables) {
  for (const fk of cfg.foreignKeys) {
    const parent = getTableConfig(fk.reference().foreignTable as PgTable).name;
    if (parent === name) continue; // self-reference, always satisfiable
    edges += 1;

    const childAt = at.get(name);
    const parentAt = at.get(parent);
    if (childAt === undefined || parentAt === undefined) continue; // covered by check 1

    if (parentAt > childAt) {
      fail(
        `${name} is restored at ${childAt} but needs ${parent}, which comes at ${parentAt}\n` +
          `       the INSERTs would fail on a foreign key during a restore`,
      );
    }
  }
}
console.log(`  ok   ${edges} foreign key(s), every parent before its children`);

console.log(fails === 0 ? "\nBACKUP ORDER IS RESTORABLE" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
