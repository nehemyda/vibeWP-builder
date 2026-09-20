/**
 * Figures the model produced against figures the client supplied, asserted.
 *
 * Run with `npx tsx lib/ai/verify-fact-guard.ts`, and as part of
 * `npm run verify`. No network, no key.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * A homepage shipped "1000+ Happy Smiles" for a dentist who had never said
 * 1000, because the section's prompt asked for "round placeholders" and its
 * sample showed "500+ Weddings". The prompt is fixed; the sample is fixed. But
 * both are text, and text drifts — someone will one day write a sample stat
 * that reads well, and it will teach the model exactly what the rule forbids.
 *
 * So two things are held here. The guard itself: a figure survives only if
 * the client wrote it down. And the samples: every stats section's example
 * must pass the guard against a business that supplied NOTHING, which is the
 * precise statement of "the example does not do what the instruction forbids".
 * ─────────────────────────────────────────────────────────────────────
 */
import { stripUnsupportedStats, clientSaidNumbers } from "./fact-guard";
import type { BusinessContext } from "./business-context";
import { SECTIONS } from "@/lib/sections";
import { isStatList } from "./fact-guard";

let fails = 0;
const fail = (m: string) => { console.log("  FAIL " + m); fails += 1; };

const business = (over: Partial<BusinessContext> = {}): BusinessContext =>
  ({
    businessName: "Harbour Lights Dental", categories: null, tags: null, about: null, services: [],
    hours: null, city: null, state: null, country: null, phone: null, email: null, street: null,
    postcode: null, website: null, seoKeywords: null, logoUrl: null,
    ...over,
  }) as BusinessContext;

const statsField = { stats: { type: "list", label: "Stats", of: { value: { type: "text", label: "Figure" }, label: { type: "text", label: "Of" } } } } as const;
const run = (rows: Array<{ value: string; label: string }>, b: BusinessContext) =>
  stripUnsupportedStats({ stats: rows }, statsField as never, b);

/* ── 1. the incident ─────────────────────────────────────────────────── */
{
  const { props, stripped } = run(
    [{ value: "1000+", label: "Happy Smiles" }, { value: "50+", label: "Emergencies Monthly" }, { value: "Bristol", label: "Harbourside" }],
    business(),
  );
  const kept = (props.stats as Array<{ value: string }>).map((s) => s.value);
  if (kept.join() !== "Bristol") fail(`expected only "Bristol" to survive, kept ${JSON.stringify(kept)}`);
  if (stripped.length !== 2) fail(`expected 2 stripped, got ${stripped.length}`);
  console.log('  ok   "1000+" and "50+" dropped for a client who said neither; "Bristol" kept');
}

/* ── 2. a figure the client wrote down survives ──────────────────────── */
{
  const b = business({ about: "Family-run since 2011 — 45 years of combined experience across our team." });
  const kept = (run([{ value: "Since 2011", label: "Family-run" }, { value: "45 years", label: "Experience" }, { value: "300+", label: "Reviews" }], b).props.stats as Array<{ value: string }>).map((s) => s.value);
  if (kept.join("|") !== "Since 2011|45 years") fail(`expected 2011 and 45 kept and 300+ dropped, got ${JSON.stringify(kept)}`);
  console.log("  ok   figures stated in the client's own about text are kept; an unstated one is not");
}

/* ── 3. opening hours vouch for a time, leading zero and all ─────────── */
{
  const b = business({ hours: [{ day: "monday", open: "04:00", close: "14:00", closed: false }] as never });
  const said = clientSaidNumbers(b);
  const kept = (run([{ value: "4 AM", label: "Baking starts" }, { value: "4.9★", label: "Rating" }], b).props.stats as Array<{ value: string }>).map((s) => s.value);
  if (!said.has("4")) fail(`"04:00" should vouch for 4; said=${[...said].join(",")}`);
  if (kept.join() !== "4 AM") fail(`expected "4 AM" kept and "4.9★" dropped, got ${JSON.stringify(kept)}`);
  console.log('  ok   "4 AM" survives on 04:00 opening; "4.9★" does not ride in on the 4 (decimal is one figure)');
}

/* ── 4. commas are not a different number ────────────────────────────── */
{
  const kept = (run([{ value: "1,000+", label: "Jobs" }], business({ about: "Over 1000 jobs completed." })).props.stats as unknown[]).length;
  if (kept !== 1) fail('"1,000+" should match a stated 1000');
  console.log('  ok   "1,000+" matches a stated "1000"');
}

/* ── 4b. the count of what the client listed is theirs ───────────────── */
{
  const kept = (run([{ value: "2", label: "Core services" }], business({ services: ["Whitening", "Implants"] })).props.stats as unknown[]).length;
  if (kept !== 1) fail('"2 Core services" for a client who listed two services was dropped');
  console.log('  ok   "2 core services" survives for a client who listed two');
}

/* ── 4c. a contact list is NOT a stats list, whatever its shape ─────────── */
{
  const contact = SECTIONS.filter((s) => /^contact-(cards|band)$/.test(s.key));
  for (const s of contact) {
    if (Object.entries(s.fields).some(([n, f]) => isStatList(n, f as never))) fail(`${s.key} was classed as a stats section — its pinned phone would be stripped`);
  }
  console.log(`  ok   ${contact.map((s) => s.key).join(", ")} are not stats sections — a pinned phone number is never stripped`);
}

/* ── 5. lists that are not stats are never touched ───────────────────── */
{
  const fields = { items: { type: "list", label: "Quotes", of: { quote: { type: "text", label: "Q" }, name: { type: "text", label: "N" } } } } as const;
  const rows = [{ quote: "Saved us 300 pounds", name: "Sam K." }];
  const { props, stripped } = stripUnsupportedStats({ items: rows }, fields as never, business());
  if (JSON.stringify(props.items) !== JSON.stringify(rows) || stripped.length) fail("a testimonials list was altered");
  console.log("  ok   a testimonials list (quote/name) is not a stat list and is left alone");
}

/* ── 6. THE SAMPLES: no example does what the rule forbids ───────────── */
const statSections = SECTIONS.filter((s) => Object.entries(s.fields).some(([n, f]) => isStatList(n, f as never)));
for (const s of statSections) {
  const { stripped } = stripUnsupportedStats(s.sample as Record<string, unknown>, s.fields as never, business());
  if (stripped.length) fail(`${s.key}: its own sample teaches invented figures — ${stripped.join("; ")}`);
}
console.log(`  ok   ${statSections.length} stats sections (${statSections.map((s) => s.key).join(", ")}) — every sample passes the guard against an empty business`);

/* ── 7. an emptied stats list renders NO block ───────────────────────── */
for (const s of statSections) {
  const field = Object.entries(s.fields).find(([n, f]) => isStatList(n, f as never))![0];
  const html = s.toGutenberg({ ...(s.sample as Record<string, unknown>), [field]: [] } as never);
  /* The stats containers by name. Not any "__grid": hero-showcase lays out its
     copy and photo in a yp-hero-showcase__grid that has nothing to do with
     stats, and matching it flagged a section that was behaving correctly. */
  if (/__stats"|yp-stats__grid"/.test(html)) fail(`${s.key}: an empty stats list still renders a container`);
}
console.log("  ok   with no figures, none of the three renders an empty stats container");

console.log(fails === 0 ? "\nINVENTED FIGURES DO NOT REACH THE PAGE" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
