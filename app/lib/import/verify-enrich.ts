/**
 * Parsing the model's answer about services and about-text, asserted.
 *
 * Run with `npx tsx lib/import/verify-enrich.ts`, and as part of
 * `npm run verify`. Makes no network call and needs no API key — everything
 * here is the pure half of enrich.ts, split out for exactly this reason.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * The shape check is the one thing standing between a model's answer and a
 * client's intake form. If it drifts loose — an unhandled shape waved through
 * as though it were valid — a client sees a services list built from whatever
 * fell out of a malformed response, in a form that presents it exactly as
 * confidently as a genuine one. The caps exist for the same reason
 * verify-clone-plan's length rule does: a control built for a sentence or a
 * handful of rows must not be handed a paragraph or a fifty-item list.
 * ─────────────────────────────────────────────────────────────────────
 */
import { parseEnrichmentResponse, enrichFromPageText } from "./enrich";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/* ── a normal, well-formed answer ─────────────────────────────────────── */
{
  const r = parseEnrichmentResponse(
    JSON.stringify({ services: ["Emergency leak repair", "Boiler servicing"], about: "A family-run plumber." }),
  );
  if (!r || r.services.length !== 2 || r.about !== "A family-run plumber.") {
    fail(`a normal answer did not parse cleanly: ${JSON.stringify(r)}`);
  } else {
    console.log("  ok   a well-formed answer parses as given");
  }
}

/* ── the two honest empty answers, which must survive intact ─────────── */
{
  const r = parseEnrichmentResponse(JSON.stringify({ services: [], about: "" }));
  if (!r || r.services.length !== 0 || r.about !== "") {
    fail(`an honest "found nothing" answer was not preserved: ${JSON.stringify(r)}`);
  } else {
    console.log('  ok   "found nothing" is preserved, not treated as a parse failure');
  }
}

/* ── malformed and wrongly-shaped responses must yield null, not a guess ─ */
const BAD: Array<[string, string]> = [
  ["{ not json", "unparseable JSON"],
  ["null", "JSON null"],
  ['"just a string"', "a bare string"],
  ["[]", "a bare array"],
  ['{"about": "x"}', "missing services"],
  ['{"services": []}', "missing about"],
  ['{"services": "plumbing", "about": "x"}', "services as a string, not an array"],
  ['{"services": [1, 2], "about": "x"}', "services containing numbers"],
  ['{"services": [], "about": 5}', "about as a number"],
];
for (const [raw, why] of BAD) {
  const r = parseEnrichmentResponse(raw);
  if (r !== null) fail(`${why}: expected null, got ${JSON.stringify(r)}`);
}
console.log(`  ok   ${BAD.length} malformed shapes rejected rather than guessed at`);

/* ── whitespace entries are dropped, real ones survive ────────────────── */
{
  const r = parseEnrichmentResponse(JSON.stringify({ services: ["  ", "Plumbing ", "", " Boiler repair"], about: "  " }));
  if (!r) fail("valid shape with messy whitespace was rejected outright");
  else {
    if (r.services.length !== 2) fail(`whitespace-only entries not dropped: ${JSON.stringify(r.services)}`);
    if (r.services[0] !== "Plumbing") fail(`entries not trimmed: ${JSON.stringify(r.services)}`);
    if (r.about !== "") fail(`whitespace-only about should trim to empty: ${JSON.stringify(r.about)}`);
    console.log("  ok   blank entries dropped, real ones trimmed");
  }
}

/* ── a form built for a sentence and a handful of rows cannot be flooded ─ */
{
  const many = Array.from({ length: 40 }, (_, i) => `Service ${i}`);
  const long = "x".repeat(5000);
  const r = parseEnrichmentResponse(JSON.stringify({ services: many, about: long }));
  if (!r) fail("a long but well-shaped answer was rejected instead of capped");
  else {
    if (r.services.length !== 8) fail(`services list not capped: got ${r.services.length}`);
    if (r.about.length !== 600) fail(`about not capped: got ${r.about.length} chars`);
    console.log("  ok   an oversized answer is capped, not rejected or passed through whole");
  }
}

/* ── no network call for text with nothing on it ──────────────────────── */
async function main() {
  const r = await enrichFromPageText({ apiKey: "unused-should-never-be-read", pageText: "   \n\t  " });
  if (r.error !== null || r.result.services.length !== 0 || r.result.about !== "") {
    fail(`blank page text should short-circuit to an empty result: ${JSON.stringify(r)}`);
  } else {
    console.log("  ok   blank page text returns empty without calling the model");
  }

  console.log(fails === 0 ? "\nENRICHMENT PARSING HOLDS" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
}

void main();
