import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

/**
 * Lazily constructs the client on first real use, not at module-load time.
 * Several standalone scripts (seed, backfill) load env vars via dotenv
 * AFTER their own imports resolve — under ESM/CJS module semantics those
 * imports (including transitive ones, e.g. via lib/ids.ts) run before any
 * of the importing script's own statements, including a config() call
 * placed above them. Reading process.env.DATABASE_URL eagerly here would
 * capture an empty string, get cached as this module's singleton, and stay
 * broken for the rest of the process — even for later imports that happen
 * once env vars are actually loaded. Deferring the read until first query
 * sidesteps the ordering problem entirely, for the Next.js app and scripts
 * alike.
 */
function getDb(): Db {
  if (!instance) {
    const client = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
