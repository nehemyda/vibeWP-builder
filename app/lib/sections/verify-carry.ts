import { parse } from "node-html-parser";
import { SECTIONS } from "@/lib/sections";
import { isOptionField, type SectionDefinition } from "./types";
import { carryProps, describe, mountsForm } from "./carry-props";

/**
 * The swap gate. Run with `npx tsx lib/sections/verify-carry.ts [keyPrefix]`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EVERY PAIR, AND WHY OF THE SAME PLACEMENT RATHER THAN THE SAME CATEGORY
 *
 * "Change this section's design" offers alternatives; category was the obvious
 * way to decide which. It is not enough. The worst content loss found — twelve
 * price lines turning into three bare headings — is services-pricelist against
 * faq-grouped, which are Content and Support. Any picker with a search box
 * reaches it. Placement is the real boundary, because a header can never
 * stand in for a page section.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS
 *
 * Each one failed on something measured, not imagined. The four that matter
 * are 3 (no-ghost), 5 (shape honesty), 6 (non-vacuity) and 11 (self-swap):
 * between them they caught every silent deletion. The rest are cheap once the
 * harness exists.
 *
 * The failure mode being defended against is not a crash. It is a swap that
 * renders beautifully and takes the client's telephone number off their
 * contact page.
 * ─────────────────────────────────────────────────────────────────────
 */

type AnySection = SectionDefinition<any>;
type Props = Record<string, unknown>;

let fails = 0;
const seen = new Map<string, number>();
const fail = (assertion: string, message: string) => {
  fails += 1;
  seen.set(assertion, (seen.get(assertion) ?? 0) + 1);
  // Capped per assertion: a systemic break would otherwise print 2,000 lines
  // and bury the other eleven.
  if ((seen.get(assertion) ?? 0) <= 12) console.log(`  FAIL [${assertion}] ${message}`);
};

const textOf = (html: string) => parse(html).textContent;

const ATTRIBUTE_ONLY = new Set([
  "url",
  "alt",
  "href",
  "variant",
  "kind",
  "featured",
  "id",
  "formToken",
]);

function visibleStrings(value: unknown, key?: string): string[] {
  if (key && ATTRIBUTE_ONLY.has(key)) return [];
  if (typeof value === "string") return value.trim().length > 3 ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((v) => visibleStrings(v, key));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Props).flatMap(([k, v]) => visibleStrings(v, k));
  }
  return [];
}

/** The target's own sample for anything the swap could not fill. */
function pad(to: AnySection, props: Props, missing: string[]): Props {
  const out = { ...props };
  const sample = (to.sample ?? {}) as Props;
  for (const path of missing) {
    const field = path.split(".")[0];
    if (out[field] === undefined && sample[field] !== undefined) out[field] = sample[field];
  }
  return out;
}

/* ── the sweep ─────────────────────────────────────────────────────── */

const prefix = process.argv[2] ?? "";
const all = SECTIONS.filter((s) => s.key.startsWith(prefix));
const byPlacement = new Map<string, AnySection[]>();
for (const s of all) {
  const p = s.placement ?? "page";
  byPlacement.set(p, [...(byPlacement.get(p) ?? []), s]);
}

let pairs = 0;
let ghostPairs = 0;
let vacuousPadded = 0;

for (const [placement, group] of byPlacement) {
  for (const from of group) {
    for (const to of group) {
      pairs += 1;
      const label = `${from.key} → ${to.key}`;
      const frozen = deepFreeze(structuredClone(from.sample) as Props);

      /* 1. Purity — the client previews with this and the server swaps with it.
       *    If the two calls disagreed, the client would be shown one design and
       *    given another. */
      let a: ReturnType<typeof carryProps>;
      let b: ReturnType<typeof carryProps>;
      try {
        a = carryProps(from, frozen as Props, to);
        b = carryProps(from, frozen as Props, to);
      } catch (err) {
        fail("totality", `${label} threw: ${(err as Error).message}`);
        continue;
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) fail("purity", `${label} not deterministic`);
      if (JSON.stringify(frozen) !== JSON.stringify(from.sample)) {
        fail("purity", `${label} mutated its input`);
      }

      const { props, missing, dropped, converted } = a;

      /* 2. Totality — the swap's own output must render. */
      let html = "";
      try {
        html = to.toGutenberg(props);
      } catch (err) {
        fail("totality", `${label} render threw: ${(err as Error).message}`);
        continue;
      }

      /* 3. No-ghost — every carried string must reach the page. This is the
       *    assertion that found the gallery-into-alternating collapse and the
       *    price list turning into bare headings. */
      const text = textOf(html);
      for (const [field, value] of Object.entries(props)) {
        const strings = visibleStrings(value, field);
        const lost = strings.filter((s) => !text.includes(s));
        if (lost.length) {
          ghostPairs += 1;
          fail("no-ghost", `${label} carried ${field} but "${lost[0].slice(0, 40)}" never renders`);
          break;
        }
      }

      /* 4. Accounting — nothing is silently unclassified, and nothing is
       *    reported as both needing writing and having been thrown away. */
      const bothWays = missing.filter((m) => dropped.includes(m));
      if (bothWays.length) {
        fail("accounting", `${label} reports ${bothWays[0]} as both missing and dropped`);
      }
      for (const key of Object.keys(props)) {
        if (key === "formToken") continue;
        if (!(key in to.fields)) fail("accounting", `${label} carried undeclared ${key}`);
      }
      for (const [key, value] of Object.entries(from.sample as Props)) {
        if (describe(value).kind === "nil") continue;
        const spec = from.fields[key];
        if (spec && isOptionField(spec)) continue;
        if (key === "formToken") continue;
        const accountedFor =
          key in props ||
          dropped.includes(key) ||
          missing.some((m) => m === key || m.startsWith(`${key}.`)) ||
          converted.length > 0 ||
          Object.values(props).length > 0;
        if (!accountedFor) fail("accounting", `${label} lost track of ${key}`);
      }

      /* 5. Shape honesty — a carried value must be the same KIND of thing the
       *    target's own sample holds. One line; it catches the whole `hours`
       *    family, where one key is a string in four sections and a list of
       *    day/time rows in two. */
      for (const [field, value] of Object.entries(props)) {
        if (field === "formToken") continue;
        const spec = to.fields[field];
        if (!spec || isOptionField(spec)) continue;
        const mine = describe(value).kind;
        const theirs = describe(((to.sample ?? {}) as Props)[field]).kind;
        const listy = (k: string) => k === "strings" || k === "records" || k === "emptyList";
        if (mine !== theirs && !(listy(mine) && listy(theirs))) {
          fail("shape", `${label} put ${mine} in ${field}, whose sample is ${theirs}`);
        }
      }

      /* 6. Non-vacuity — padded with the target's sample for whatever needs
       *    writing, the result must say something. 40 chars is verify.ts's own
       *    floor for a page section. This is the assertion that proves padding
       *    belongs in the preview caller rather than in carryProps. */
      const padded = pad(to, props, missing);
      let paddedText = "";
      try {
        paddedText = textOf(to.toGutenberg(padded));
      } catch (err) {
        fail("totality", `${label} padded render threw: ${(err as Error).message}`);
      }
      /*
       * Every field the target declares has to end up with something in it.
       *
       * Stated as a character floor first, which was the gate being wrong
       * rather than the swap: cta-strip is one line and a button, so eleven
       * perfectly good swaps into it fell under an arbitrary 40. Asked this
       * way it still catches the case it was written for — features-grid's
       * {title, body} entries arriving in testimonials as three empty quote
       * cards — without a magic number.
       */
      for (const [field, spec] of Object.entries(to.fields)) {
        if (isOptionField(spec)) continue;
        if (describe(padded[field]).kind === "nil") {
          vacuousPadded += 1;
          fail("non-vacuity", `${label} leaves ${field} empty even after padding`);
        }
      }
      /*
       * A net under the assertion above, for page sections only. A header's
       * words are not in its markup: header-simple is wp:site-title and
       * wp:navigation, both rendered by PHP at request time and carrying no
       * inner HTML, so its own output is four characters and always was.
       */
      if (placement === "page" && paddedText.length < 20) {
        fail("non-vacuity", `${label} renders only ${paddedText.length} chars`);
      }

      /* 7. No empty styled containers — a section whose grid is half blank
       *    reads as broken, and this is how services-featured shipped with its
       *    wider column empty. */
      const empties = (
        to.toGutenberg(padded).match(/<(div|section|ul|figure)[^>]*class="([^"]*yp-[^"]*)"[^>]*>\s*<\/\1>/g) ?? []
      ).filter(
        // The form's mount is empty BY DESIGN — embed.js fills it in the
        // browser, and the canvas substitutes a drawing of the real form.
        (m) => !m.includes("yp-embed__mount"),
      );
      if (empties.length) {
        fail("empty-container", `${label} renders empty ${empties[0].match(/class="([^"]*)"/)?.[1]}`);
      }

      /* 8. Truncation, and no severed token — "{{addr" is a literal the theme
       *    cannot resolve and the preview cannot strip. */
      for (const [field, value] of Object.entries(props)) {
        const spec = to.fields[field];
        if (typeof value !== "string") continue;
        if (spec?.maxChars && value.length > spec.maxChars) {
          fail("truncation", `${label} ${field} is ${value.length} chars, max ${spec.maxChars}`);
        }
        if (/\{\{[a-z_]*$/.test(value) || /^[a-z_]*\}\}/.test(value)) {
          fail("truncation", `${label} ${field} has a severed token: ${value.slice(-20)}`);
        }
      }

      /* 9. Facts survive. A business detail the target declares must arrive at
       *    the same key, in its token form — this is the phone number that the
       *    naive implementation deleted. */
      for (const field of ["phone", "email", "address", "hours"]) {
        const mine = (from.sample as Props)[field];
        if (typeof mine !== "string" || !/\{\{[a-z_]+\}\}/.test(mine)) continue;
        if (!(field in to.fields)) continue;
        if (isOptionField(to.fields[field])) continue;
        if (props[field] !== mine && !missing.includes(field)) {
          fail("facts", `${label} lost the ${field} token (got ${JSON.stringify(props[field])})`);
        }
      }

      /* 10. Form continuity — the handle follows the form and nothing else. */
      const withToken = { ...(from.sample as Props), formToken: "tok_test_1234" };
      const t = carryProps(from, withToken, to);
      if (mountsForm(from) && mountsForm(to) && t.props.formToken !== "tok_test_1234") {
        fail("form", `${label} dropped the form token between two form sections`);
      }
      if (!mountsForm(to) && "formToken" in t.props) {
        fail("form", `${label} carried a form token into a section with no form`);
      }

      /* 11. Self-swap is a no-op. The cheapest assertion here, and it is what
       *     surfaced the two fields declared as lists that hold a single
       *     object. */
      if (from.key === to.key) {
        for (const [field, spec] of Object.entries(to.fields)) {
          if (isOptionField(spec)) continue;
          const mine = (from.sample as Props)[field];
          if (describe(mine).kind === "nil") continue;
          // Compared by value, not by key order: projection rebuilds each
          // entry from the target's sorted key set, so {label, href} comes
          // back as {href, label} with identical content.
          if (!sameData(props[field], mine)) {
            fail("self-swap", `${from.key} changed its own ${field}`);
          }
        }
        if (missing.length) fail("self-swap", `${from.key} reports missing: ${missing.join(", ")}`);
        if (dropped.length) fail("self-swap", `${from.key} reports dropped: ${dropped.join(", ")}`);
      }
    }
  }
}

/* ── 12. registry drift ────────────────────────────────────────────── */

/**
 * A list field whose sample disagrees with its own `of`.
 *
 * Thirty exist today, all for the same reason: `of` is
 * `Omit<FieldSpec, "of">`, so a nested array cannot be declared and is written
 * as `text` instead. That lie is exactly what a shape-matching swap has to work
 * around. They are frozen here as known exceptions so a new section cannot add
 * a thirty-first without someone deciding to.
 */
const KNOWN_DRIFT = new Set([
  /*
   * Every `actions` field, all for one reason: `variant` exists at runtime —
   * parseActions() recovers it from the button's class on a WordPress pull —
   * and no section declares it, because the model must never write it. So
   * every sample carries three keys where `of` declares two.
   */
  ...SECTIONS.filter((s) => "actions" in s.fields).map((s) => `${s.key}.actions`),
  /* Declared `list`, holds a single object. */
  "hero-showcase.badge",
  "services-featured.featured",
  /* Declared `of: {text}`, holds plain strings. */
  "form-split.points",
]);

console.log("\n== registry drift: list fields whose sample disagrees with `of` ==");
const drift: string[] = [];
for (const s of SECTIONS) {
  for (const [field, spec] of Object.entries(s.fields)) {
    if (spec.type !== "list" || !spec.of) continue;
    const shape = describe((s.sample as Props)[field]);
    const declared = Object.keys(spec.of).sort().join(",");
    const keys = shape.kind === "records" || shape.kind === "object" ? shape.keys.join(",") : "";
    // Two ways to drift, and both matter: the wrong keys, or — the one that
    // silently empties a section — a single object where a list was declared.
    const notAList = shape.kind === "object" || shape.kind === "image";
    if (declared === keys && !notAList) continue;
    const id = `${s.key}.${field}`;
    drift.push(id);
    const actual = notAList ? `a bare ${shape.kind} of {${keys}}` : keys || shape.kind;
    if (!KNOWN_DRIFT.has(id)) fail("drift", `${id}: of={${declared}} but sample is ${actual}`);
  }
}
const stale = [...KNOWN_DRIFT].filter((id) => !drift.includes(id));
if (stale.length) {
  console.log(`  ${stale.length} known exception(s) now clean — remove from KNOWN_DRIFT: ${stale.join(", ")}`);
}
console.log(`  ${drift.length} drifting, ${drift.length - stale.length} of them known`);

/* ── report ────────────────────────────────────────────────────────── */

/** Deep equality that ignores object key order. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameData(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Props).filter((k) => (a as Props)[k] !== undefined).sort();
    const kb = Object.keys(b as Props).filter((k) => (b as Props)[k] !== undefined).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every((k) => sameData((a as Props)[k], (b as Props)[k]));
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Props).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

console.log(`\n== ${pairs} ordered same-placement pairs ==`);
if (ghostPairs) console.log(`  ${ghostPairs} pair(s) carried content that never renders`);
if (vacuousPadded) console.log(`  ${vacuousPadded} pair(s) render nearly nothing even when padded`);
for (const [assertion, count] of [...seen].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${assertion.padEnd(16)} ${count} failure(s)`);
}
console.log(fails === 0 ? "\nALL SWAP GATES PASS" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
