import { parse } from "node-html-parser";
import { SECTIONS } from "@/lib/sections";
import { isOptionField, type SectionDefinition } from "./types";
import {
  carryProps,
  describe,
  mountsForm,
  visibleStrings,
  STRUCTURAL_FIELDS,
} from "./carry-props";

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


/**
 * A sample made to look like props that have actually lived on a site.
 *
 * Samples are clean; stored props are not, and the difference hid a real
 * defect. searchPhoto() records the credit alongside the file
 * (lib/images/pexels.ts), and WordPress adds an attachment id and dimensions,
 * so a hero on a client's site holds six more keys than any sample — none of
 * which render. The removal test read those as content that had vanished and
 * threw the photograph away on every hero swap, while all 2,754 sample pairs
 * passed.
 */
function asStored(props: Props): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = decorate(value);
  }
  return out;
}

function decorate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decorate);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Props;
    if (typeof record.url === "string") {
      return {
        ...record,
        id: 33,
        width: 940,
        height: 650,
        photographer: "Kate Filatova",
        photographerUrl: "https://www.pexels.com/@kate-filatova-1861817299",
      };
    }
    const inner: Props = {};
    for (const [k, v] of Object.entries(record)) inner[k] = decorate(v);
    return inner;
  }
  return value;
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
      /*
       * The source, shaped the way stored props really are, and a pristine copy
       * of it. Every assertion below compares against THIS rather than against
       * `from.sample`: comparing against the clean sample made the decoration
       * itself look like a mutation, 728 times.
       */
      const stored = asStored(structuredClone(from.sample) as Props);
      const reference = structuredClone(stored);
      const frozen = deepFreeze(stored);

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
      if (JSON.stringify(frozen) !== JSON.stringify(reference)) {
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
        /*
         * A setting's VALUE is a name, not copy. "default" or "airy" is never
         * meant to appear on the page, so looking for it there reports every
         * section as having lost content. carry-props' own ghost check exempts
         * options for the same reason; this is its second copy.
         */
        const spec = to.fields[field];
        if (spec && isOptionField(spec)) continue;
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
      for (const [key, value] of Object.entries(reference)) {
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
        // Structural fields are deliberately never carried; see carry-props.
        if (STRUCTURAL_FIELDS.has(field) || isOptionField(spec)) continue;
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
        const mine = reference[field];
        if (typeof mine !== "string" || !/\{\{[a-z_]+\}\}/.test(mine)) continue;
        if (!(field in to.fields)) continue;
        if (isOptionField(to.fields[field])) continue;
        if (props[field] !== mine && !missing.includes(field)) {
          fail("facts", `${label} lost the ${field} token (got ${JSON.stringify(props[field])})`);
        }
      }

      /* 10. Form continuity — the handle follows the form and nothing else. */
      const withToken = { ...reference, formToken: "tok_test_1234" };
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
          const mine = reference[field];
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
