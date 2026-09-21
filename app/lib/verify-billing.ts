/**
 * Platform MRR arithmetic, asserted.
 *
 * Run with `npx tsx lib/verify-billing.ts`, and as part of `npm run verify`.
 * No database: prices are stubs.
 *
 * The number on the admin overview was "$184.2k — illustrative" for as long
 * as the page existed. Now that it is computed, the one thing to pin is
 * WHOSE money it counts: an agency's subscription and a direct client's
 * price, never a managed site's — that is the agency's revenue, and counting
 * it here would double-book every reseller's client.
 */
import { platformMrrFrom, formatCents } from "./billing";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

const list: Record<string, number> = { starter: 0, growth: 4900, scale: 14900, agency: 39900 };
const pricing = {
  platformPriceFor: (plan: string) => list[plan] ?? null,
  resolve: (s: { plan: string; customPriceMonthlyCents: number | null }) => ({
    cents: s.customPriceMonthlyCents ?? list[s.plan] ?? 0,
  }),
};

/* ── 1. Agencies pay for their plan; their clients' sites are not counted ── */
{
  const m = platformMrrFrom([{ plan: "scale" }, { plan: "agency" }], [], pricing);
  if (m.cents !== 14900 + 39900) fail(`two agencies should be $548.00, got ${formatCents(m.cents)}`);
  else console.log("  ok   two agencies on Scale and Agency: $548.00, whatever their clients pay");
}

/* ── 2. Direct clients pay the resolved price, custom override first ───── */
{
  const m = platformMrrFrom(
    [],
    [
      { plan: "growth", customPriceMonthlyCents: null },
      { plan: "growth", customPriceMonthlyCents: 2500 },
      { plan: "starter", customPriceMonthlyCents: null },
    ],
    pricing,
  );
  if (m.cents !== 4900 + 2500) fail(`direct sites should be $74.00, got ${formatCents(m.cents)}`);
  else console.log("  ok   direct sites: list price, custom override, and a free Starter at $0");
  if (m.directSites !== 3) fail("direct site count wrong");
}

/* ── 3. Unknown plans are $0, not a crash ─────────────────────────────── */
{
  const m = platformMrrFrom([{ plan: "legacy-gold" }], [{ plan: "legacy-gold", customPriceMonthlyCents: null }], pricing);
  if (m.cents !== 0) fail(`unknown plans should contribute $0, got ${formatCents(m.cents)}`);
  else console.log("  ok   a plan not in the catalogue contributes $0");
}

/* ── 4. The parts add up to the whole ─────────────────────────────────── */
{
  const m = platformMrrFrom([{ plan: "growth" }], [{ plan: "scale", customPriceMonthlyCents: null }], pricing);
  if (m.agencyCents + m.directCents !== m.cents) fail("agencyCents + directCents !== cents");
  else console.log(`  ok   ${formatCents(m.agencyCents)} from agencies + ${formatCents(m.directCents)} direct = ${formatCents(m.cents)}`);
}

console.log(fails === 0 ? "\nPLATFORM MRR COUNTS ONLY THE PLATFORM'S MONEY" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
