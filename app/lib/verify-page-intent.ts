/**
 * What a builder chat message is taken to mean, asserted.
 *
 * Run with `npx tsx lib/verify-page-intent.ts`, and as part of `npm run verify`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * detectIntent decides whether a sentence CREATES a page, REBUILDS one,
 * switches to one, or edits the one on screen. Three of those four write to
 * the site, and the function had no test of any kind.
 *
 * Both known failures were silent and both were expensive. "create services
 * page" once regenerated the homepage over the top of itself, which the file's
 * own header records as data loss. And "add a section near the bottom of the
 * page" created a page called "Section Near The Bottom Of The", because the
 * name capture allowed spaces and crossed a whole clause to reach the word it
 * was looking for.
 *
 * Neither reported anything wrong. A page appeared in the menu, or one was
 * overwritten, and the assistant said it had done what was asked. That is the
 * case for asserting the mapping rather than trusting the patterns to keep
 * reading the way they look like they read.
 * ─────────────────────────────────────────────────────────────────────
 */
import { detectIntent } from "./page-intent";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/** [message, expected kind, expected slug when the kind carries one] */
const CASES: Array<[string, string, string?]> = [
  // ── The regression this gate exists for ──────────────────────────────
  [
    "Add a section near the bottom of the page with a Google map showing where we are",
    "edit_page",
  ],
  ["add a map to the page", "edit_page"],
  ["add a gallery above the testimonials on this page", "edit_page"],
  ["put a booking form at the top of the page", "edit_page"],
  ["show me the map on the contact page", "edit_page"],

  // ── Creating, which must still work ──────────────────────────────────
  ["create services page", "create_page", "services"],
  ["add a contact page", "create_page", "contact"],
  ["make an about us page", "create_page", "about"],
  ["create a privacy policy page", "create_page", "privacy-policy"],
  ["build a terms of service page", "create_page", "terms-of-service"],
  ["create a page called Pricing", "create_page", "pricing"],
  ["new page named Careers", "create_page", "careers"],

  // ── Misspellings the file folds in on purpose ────────────────────────
  ["create servies page", "create_page", "services"],
  ["create service page", "create_page", "services"],
  ["add a contact us page", "create_page", "contact"],

  // ── Rebuilding beats creating, and beats switching ───────────────────
  ["recreate the quote page", "rebuild_page", "quote"],
  ["delete the quote page and recreate it", "rebuild_page", "quote"],
  ["regenerate the home page", "rebuild_page", "home"],

  // ── Switching ────────────────────────────────────────────────────────
  ["go to the home page", "switch_page", "home"],
  ["go to the homepage", "switch_page", "home"],
  ["open the contact page", "switch_page", "contact"],

  // ── Ordinary edits, which are the common case ────────────────────────
  ["make the heading bigger", "edit_page"],
  ["change the hero photo", "edit_page"],
  ["write a friendlier intro", "edit_page"],

  // ── Reserved, and never a page ───────────────────────────────────────
  ["create wp-admin page", "edit_page"],
  ["create admin page", "edit_page"],
];

for (const [message, kind, slug] of CASES) {
  const got = detectIntent(message);
  const gotSlug = "slug" in got ? got.slug : undefined;

  if (got.kind !== kind) {
    fail(`${JSON.stringify(message)}\n       expected ${kind}, got ${got.kind}${gotSlug ? ` (${gotSlug})` : ""}`);
  } else if (slug !== undefined && gotSlug !== slug) {
    fail(`${JSON.stringify(message)}\n       expected slug ${slug}, got ${gotSlug}`);
  } else {
    const shown = gotSlug ? `${got.kind} → ${gotSlug}` : got.kind;
    console.log(`  ok   ${shown.padEnd(26)} ${message.slice(0, 52)}`);
  }
}

/*
 * A create must never name a page after a sentence. Length is the property
 * that separates a name from a clause, so it is asserted directly rather than
 * only through the examples above.
 */
for (const message of [
  "add a really long descriptive thing that goes on and on page",
  "create a section underneath the services block on the home page",
]) {
  const got = detectIntent(message);
  if (got.kind === "create_page" && got.slug.split("-").length > 4) {
    fail(`named a page after a sentence: ${got.slug}`);
  }
}

console.log(
  fails === 0 ? `\nALL ${CASES.length} INTENT CASES PASS` : `\n${fails} FAILURE(S)`,
);
process.exitCode = fails === 0 ? 0 : 1;
