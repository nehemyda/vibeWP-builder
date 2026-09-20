import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { GenerateContentResponse } from "@google/genai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, sites } from "@/lib/db/schema";

/**
 * The AI usage ledger: one row per model call, saying whose it was.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A LEDGER BEFORE ANY LIMIT
 *
 * Every plan question — how many credits a Starter site should get, what an
 * agency may charge for more — needs a number nobody has: what a site actually
 * spends. This writes that number down and does nothing else. Limits and
 * dashboards read it later; a limit set before a week of rows would be a guess
 * enforced on paying clients.
 *
 * WHY THE CALLER DOES NOT PASS THE SITE
 *
 * The model calls live in lib/ai, three or four functions below the server
 * action that knows the site and the user. Threading `siteId` through every
 * signature — generatePageWithGemini, planEdit, generateAltWithGemini — would
 * touch every prompt-building function to carry a value none of them use.
 * Instead the action opens a context and the call site reads it, the way a
 * request id follows a request. A call made with no context open (a script, a
 * test) is simply not recorded, and never fails for it.
 *
 * WHY TOKENS ARE STORED AND CREDITS ARE NOT
 *
 * A credit is a billing unit — 1,000 tokens today — and a billing unit is a
 * decision that can change. Rows hold what the provider reported; credits
 * are computed from the SUM at read time, so a month of small calls costs
 * what it cost, not one rounded-up credit per call.
 * ─────────────────────────────────────────────────────────────────────
 */

export const CREDIT_TOKENS = 1_000;

/** Tokens → credits, applied to a total rather than per row. Whole credits, rounded up. */
export function creditsFromTokens(totalTokens: number): number {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return 0;
  return Math.ceil(totalTokens / CREDIT_TOKENS);
}

export type UsageAction =
  | "generate_page"
  | "edit"
  | "image_alt"
  | "page_meta"
  | "import_site";

export type UsageContext = {
  siteId: string;
  action: UsageAction;
  /** Filled in once the action has authenticated; the context opens before that. */
  userId?: string;
  /**
   * Set when the context opens. Every model call inside one action shares it,
   * so "how many times did the client ask" is a count of these, not of rows —
   * an edit is two calls, and a client who made six edits did not make twelve.
   */
  requestId?: string;
};

const store = new AsyncLocalStorage<UsageContext>();

/** Runs `fn` with every model call inside it attributed to this site and action. */
export function runWithUsageContext<T>(ctx: UsageContext, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...ctx, requestId: ctx.requestId ?? randomUUID() }, fn);
}

/**
 * Names the person behind the current context. Called right after an action
 * authenticates — the context is opened at the action boundary, before the
 * user is known, so this fills the one field that could not be known then.
 */
export function attributeUsageTo(userId: string): void {
  const ctx = store.getStore();
  if (ctx) ctx.userId = userId;
}

export type UsageRow = {
  siteId: string;
  agencyId: string | null;
  userId: string | null;
  requestId: string | null;
  action: UsageAction;
  model: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

/** What a call site knows. The agency is looked up by the database writer, not the caller. */
export type UsageEntry = Omit<UsageRow, "agencyId">;

type Writer = (entry: UsageEntry) => Promise<void>;

async function writeToDb(entry: UsageEntry): Promise<void> {
  /*
   * The agency is copied onto the row on purpose. A site can move between
   * agencies (site_transfers), and an agency's bill for August must show
   * what was spent under it in August — not what its current sites spend.
   */
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, entry.siteId),
    columns: { agencyId: true },
  });
  await db.insert(aiUsage).values({ ...entry, agencyId: site?.agencyId ?? null });
}

let writer: Writer = writeToDb;

const count = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/**
 * Records one model response against the open context. Never throws and
 * never blocks the caller's result on the ledger: a page the client asked
 * for must not fail because a bookkeeping insert did.
 */
export async function captureUsage(response: GenerateContentResponse, model: string): Promise<void> {
  const ctx = store.getStore();
  if (!ctx) return;

  const u = response.usageMetadata;
  if (!u) return;

  const prompt = count(u.promptTokenCount);
  const output = count(u.candidatesTokenCount);
  const thought = count(u.thoughtsTokenCount);
  const cached = count(u.cachedContentTokenCount);
  /* The provider's total when it gives one; our own sum when it does not, so
     a row is never a call that cost nothing. */
  const total = count(u.totalTokenCount) || prompt + output + thought;

  try {
    await writer({
      siteId: ctx.siteId,
      userId: ctx.userId ?? null,
      requestId: ctx.requestId ?? null,
      action: ctx.action,
      model,
      promptTokens: prompt,
      outputTokens: output,
      thoughtTokens: thought,
      cachedTokens: cached,
      totalTokens: total,
    });
  } catch (err) {
    console.error("[ai-usage] failed to record a model call:", err instanceof Error ? err.message : err);
  }
}

/** For the gate only: swap the writer so rows can be asserted without a database. */
export const __testing = {
  setWriter(w: Writer | null) {
    writer = w ?? writeToDb;
  },
  currentContext: () => store.getStore(),
};
