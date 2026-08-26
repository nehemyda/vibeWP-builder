import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Scope introspection to our own tables — Supabase's auth/storage/realtime
  // schemas have check constraints that trip a parsing bug in drizzle-kit
  // 0.31.10 when it scans every schema by default.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
