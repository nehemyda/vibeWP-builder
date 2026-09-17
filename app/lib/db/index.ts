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
    /*
     * `prepare: false` because DATABASE_URL points at Supabase's pooler on
     * 6543, which runs in TRANSACTION mode: a connection is handed to a
     * different client between statements, so prepared statements cannot
     * survive and named ones error.
     *
     * `idle_timeout` exists for the other half of that arrangement, and its
     * absence is a real bug rather than a tuning choice. The pooler drops an
     * idle client connection on its own schedule; postgres.js defaults to
     * holding sockets forever, so a long-lived process eventually hands a
     * query a socket the far end closed minutes ago and the query fails with
     * nothing useful attached. It presents as "the database is down" while a
     * fresh script — which opens a new connection — works perfectly, which is
     * exactly how a dev server that had been up for 22 hours started failing
     * every query against `sites` while the database sat at 8 of its 60
     * connections.
     *
     * Closing them from this side first means a socket is never older than
     * the pooler tolerates.
     */
    const client = postgres(process.env.DATABASE_URL ?? "", {
      prepare: false,
      idle_timeout: 20,
      max: 10,
      connect_timeout: 10,
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
