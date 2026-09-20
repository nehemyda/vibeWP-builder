/**
 * The AI usage ledger, asserted.
 *
 * Run with `npx tsx lib/ai/verify-usage.ts`, and as part of `npm run verify`.
 * No network, no key, no database: the writer is swapped for an array.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * A ledger fails silently in exactly one direction: a call happens and no row
 * lands. Nothing the client sees changes — the page still generates — so the
 * first sign is a dashboard that under-reports, and by then the missing rows
 * are gone for good. Two ways that happens are checked here by reading the
 * source: a new model call added without `captureUsage`, and a new server
 * action reaching a model without opening a context.
 *
 * The other cases pin the arithmetic that will one day become a bill.
 * ─────────────────────────────────────────────────────────────────────
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GenerateContentResponse } from "@google/genai";
import { getTableConfig } from "drizzle-orm/pg-core";
import { aiUsage } from "@/lib/db/schema";
import {
  CREDIT_TOKENS,
  __testing,
  attributeUsageTo,
  captureUsage,
  creditsFromTokens,
  runWithUsageContext,
  type UsageEntry,
} from "./usage";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

const rows: UsageEntry[] = [];
__testing.setWriter(async (entry) => {
  rows.push(entry);
});

const response = (usage?: Record<string, number>) =>
  ({ usageMetadata: usage } as unknown as GenerateContentResponse);

const SITE_A = "11111111-1111-1111-1111-111111111111";
const SITE_B = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";

async function main() {
  /* ── 1. No context, no row — and no error ───────────────────────────── */
  await captureUsage(response({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }), "m");
  if (rows.length) fail("a call with no context open was recorded");
  else console.log("  ok   a call outside any context is not recorded");

  /* ── 2. Inside a context, the row says who, what and how much ───────── */
  await runWithUsageContext({ siteId: SITE_A, action: "generate_page" }, async () => {
    attributeUsageTo(USER);
    await captureUsage(
      response({
        promptTokenCount: 1200,
        candidatesTokenCount: 300,
        thoughtsTokenCount: 50,
        cachedContentTokenCount: 100,
        totalTokenCount: 1550,
      }),
      "gemini-2.5-flash",
    );
  });
  const row = rows[0];
  if (rows.length !== 1) fail(`expected 1 row, got ${rows.length}`);
  else if (
    row.siteId !== SITE_A ||
    row.userId !== USER ||
    row.action !== "generate_page" ||
    row.model !== "gemini-2.5-flash" ||
    row.promptTokens !== 1200 ||
    row.outputTokens !== 300 ||
    row.thoughtTokens !== 50 ||
    row.cachedTokens !== 100 ||
    row.totalTokens !== 1550
  ) {
    fail(`row shape wrong: ${JSON.stringify(row)}`);
  } else {
    console.log("  ok   a call inside a context lands with site, user, action, model and every count");
  }

  /* ── 2b. Two calls in one action share a request id; two actions do not ── */
  rows.length = 0;
  await runWithUsageContext({ siteId: SITE_A, action: "edit" }, async () => {
    await captureUsage(response({ totalTokenCount: 1 }), "plan");
    await captureUsage(response({ totalTokenCount: 2 }), "revise");
  });
  await runWithUsageContext({ siteId: SITE_A, action: "edit" }, () => captureUsage(response({ totalTokenCount: 3 }), "plan"));
  if (rows.length !== 3) fail(`expected 3 rows, got ${rows.length}`);
  else if (!rows[0].requestId || rows[0].requestId !== rows[1].requestId) fail("the two calls of one edit do not share a request id");
  else if (rows[2].requestId === rows[0].requestId) fail("a second edit reused the first edit's request id");
  else console.log("  ok   plan and revise of one edit share a request id; the next edit gets its own");

  /* ── 3. A response with no usage block is not a row of zeros ────────── */
  rows.length = 0;
  await runWithUsageContext({ siteId: SITE_A, action: "edit" }, () => captureUsage(response(undefined), "m"));
  if (rows.length) fail("a response with no usageMetadata produced a row");
  else console.log("  ok   a response without usage figures produces no row");

  /* ── 4. A missing total is summed, so a row is never a free call ────── */
  rows.length = 0;
  await runWithUsageContext({ siteId: SITE_A, action: "edit" }, () =>
    captureUsage(response({ promptTokenCount: 7, candidatesTokenCount: 3, thoughtsTokenCount: 2 }), "m"),
  );
  if (rows[0]?.totalTokens !== 12) fail(`total not summed from parts: ${rows[0]?.totalTokens}`);
  else console.log("  ok   a missing total is summed from prompt + output + thought");

  /* ── 5. The user is optional, and absent when nobody attributed it ──── */
  rows.length = 0;
  await runWithUsageContext({ siteId: SITE_A, action: "edit" }, () =>
    captureUsage(response({ totalTokenCount: 1 }), "m"),
  );
  if (rows[0]?.userId !== null) fail(`userId should be null when not attributed, got ${rows[0]?.userId}`);
  else console.log("  ok   a context nobody attributed records a null user, not a wrong one");

  /* ── 6. Two sites in flight at once do not swap rows ────────────────── */
  rows.length = 0;
  await Promise.all([
    runWithUsageContext({ siteId: SITE_A, action: "edit" }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      await captureUsage(response({ totalTokenCount: 1 }), "a");
    }),
    runWithUsageContext({ siteId: SITE_B, action: "page_meta" }, async () => {
      await captureUsage(response({ totalTokenCount: 2 }), "b");
    }),
  ]);
  const a = rows.find((r) => r.model === "a");
  const b = rows.find((r) => r.model === "b");
  if (a?.siteId !== SITE_A || b?.siteId !== SITE_B || a?.action !== "edit" || b?.action !== "page_meta") {
    fail(`concurrent contexts leaked: ${JSON.stringify(rows)}`);
  } else {
    console.log("  ok   two sites generating at once each get their own rows");
  }

  /* ── 7. A failing writer never fails the caller ─────────────────────── */
  __testing.setWriter(async () => {
    throw new Error("database away");
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    await runWithUsageContext({ siteId: SITE_A, action: "edit" }, () =>
      captureUsage(response({ totalTokenCount: 1 }), "m"),
    );
    console.log("  ok   a ledger write that fails does not fail the model call");
  } catch (e) {
    fail(`ledger failure escaped to the caller: ${(e as Error).message}`);
  } finally {
    console.error = quiet;
    __testing.setWriter(null);
  }

  /* ── 8. Credits: whole, rounded up, from a TOTAL ────────────────────── */
  const credit: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [CREDIT_TOKENS, 1],
    [CREDIT_TOKENS + 1, 2],
    [CREDIT_TOKENS * 10, 10],
    [-5, 0],
    [Number.NaN, 0],
  ];
  for (const [tokens, want] of credit) {
    const got = creditsFromTokens(tokens);
    if (got !== want) fail(`creditsFromTokens(${tokens}) = ${got}, want ${want}`);
  }
  /* Ten 100-token calls are one credit as a sum and ten credits per row —
     the whole reason rows hold tokens and not credits. */
  const perRow = Array.from({ length: 10 }, () => creditsFromTokens(100)).reduce((s, n) => s + n, 0);
  const asSum = creditsFromTokens(10 * 100);
  if (asSum !== 1 || perRow !== 10) fail(`sum-vs-row demonstration broke: sum=${asSum} rows=${perRow}`);
  console.log(`  ok   ${credit.length} credit conversions; ten 100-token calls are 1 credit summed, not ${perRow}`);

  /* ── 9. Every model call in the codebase is followed by captureUsage ── */
  const root = join(__dirname, "..");
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name) && !/verify-usage\.ts$/.test(entry.name)) {
        const src = readFileSync(p, "utf8");
        const calls = (src.match(/\.models\.generateContent\(/g) ?? []).length;
        if (!calls) continue;
        callers.push(p);
        const captured = (src.match(/captureUsage\(/g) ?? []).length;
        if (captured < calls) fail(`${p.replace(root, "lib")}: ${calls} model call(s), ${captured} captureUsage`);
      }
    }
  };
  walk(root);
  if (callers.length < 6) fail(`expected at least 6 model-calling files, found ${callers.length}`);
  console.log(`  ok   ${callers.length} files call the model, every call followed by captureUsage`);

  /* ── 10. Every server action reaching one of those files opens a context ── */
  const actionsDir = join(__dirname, "..", "..", "app", "actions");
  const instrumented = callers.map((p) => p.replace(root, "@/lib").replace(/\.ts$/, ""));
  let reaching = 0;
  for (const name of readdirSync(actionsDir)) {
    if (!/\.ts$/.test(name)) continue;
    const src = readFileSync(join(actionsDir, name), "utf8");
    if (!instrumented.some((m) => src.includes(`from "${m}"`))) continue;
    reaching += 1;
    if (!src.includes("runWithUsageContext(")) fail(`app/actions/${name} reaches a model without opening a usage context`);
  }
  if (reaching < 5) fail(`expected at least 5 actions reaching a model, found ${reaching}`);
  console.log(`  ok   ${reaching} server actions reach a model, all inside runWithUsageContext`);

  /* ── 11. The hand-written migration names the same columns as the schema ── */
  /* Every migration that touches ai_usage, read together: the table was
     created in batch 40 and has grown since, one column per batch. */
  const dbDir = join(__dirname, "..", "db");
  const migrations = readdirSync(dbDir)
    .filter((n) => /^migrate-batch\d+\.ts$/.test(n))
    .map((n) => readFileSync(join(dbDir, n), "utf8"))
    .filter((src) => /ai_usage/.test(src))
    .join("\n");
  for (const col of getTableConfig(aiUsage).columns) {
    if (!new RegExp(`\\b${col.name}\\b`).test(migrations)) fail(`no migration creates ai_usage.${col.name}`);
  }
  console.log("  ok   every ai_usage column the schema declares is created by a migration");

  console.log(fails === 0 ? "\nEVERY MODEL CALL IS ACCOUNTED FOR" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
}

void main();
