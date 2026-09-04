/**
 * Checks the edit operations.
 *
 *   npx tsx lib/sections/verify-edits.ts
 *
 * Pure and offline — no model, no database. Every case here is one that was
 * seen going wrong: a section landing at the end when a position was asked for,
 * and an anchor named by its heading rather than its node type.
 */
import { applyOp, type PageSchema } from "./edit-ops";

const page: PageSchema = {
  schemaVersion: "1.0",
  nodes: [
    { id: "1", type: "HeroSplit", props: { heading: "Artisan Sourdough" } },
    { id: "2", type: "ServicesEditorial", props: { heading: "Our Hand-Baked Offerings" } },
    { id: "3", type: "Testimonials", props: { heading: "What Our Customers Say" } },
    { id: "4", type: "CtaBand", props: { heading: "Ready for a taste?" } },
  ],
};
const types = (s: PageSchema) => (s.nodes ?? []).map((n) => n.type).join(" > ");

let fails = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};

// The exact instruction that failed: anchor named by its HEADING.
const byHeading = applyOp(page, {
  kind: "add_section", section: "content-gallery", before: "What Our Customers Say",
}, { heading: "Our Recent Bakes" });
check("anchor by heading places it correctly",
  byHeading.ok && types(byHeading.schema) === "HeroSplit > ServicesEditorial > ContentGallery > Testimonials > CtaBand",
  byHeading.ok ? types(byHeading.schema) : byHeading.error);

// The quoted form, as the instruction was actually typed.
const quoted = applyOp(page, {
  kind: "add_section", section: "content-gallery", before: '"What our customers say"',
}, {});
check("quoted, differently-cased heading still matches", quoted.ok && types(quoted.schema).includes("ContentGallery > Testimonials"));

// Node type still works.
const byType = applyOp(page, { kind: "add_section", section: "content-gallery", before: "Testimonials" }, {});
check("anchor by node type still works", byType.ok && types(byType.schema).includes("ContentGallery > Testimonials"));

// An anchor that does not exist must REFUSE, not silently append.
const missing = applyOp(page, { kind: "add_section", section: "content-gallery", before: "Pricing table" }, {});
check("unknown anchor refuses instead of appending",
  !missing.ok && missing.error.includes("Pricing table"), missing.ok ? types(missing.schema) : missing.error);

// No anchor at all is a legitimate append.
const append = applyOp(page, { kind: "add_section", section: "content-gallery" }, {});
check("no anchor appends to the end", append.ok && types(append.schema).endsWith("ContentGallery"));

// Removing and moving, both by heading.
const removed = applyOp(page, { kind: "remove_section", section: "What Our Customers Say" });
check("remove by heading", removed.ok && !types(removed.schema).includes("Testimonials"));

const moved = applyOp(page, { kind: "move_section", section: "CtaBand", before: "Artisan Sourdough" });
check("move by heading", moved.ok && types(moved.schema).startsWith("CtaBand > HeroSplit"),
  moved.ok ? types(moved.schema) : moved.error);

// A failed move must leave the page as it was.
const badMove = applyOp(page, { kind: "move_section", section: "CtaBand", before: "Nonexistent" });
check("failed move leaves the page unchanged",
  !badMove.ok && types(page) === "HeroSplit > ServicesEditorial > Testimonials > CtaBand");

// Options.
const cols = applyOp(page, { kind: "set_option", section: "Testimonials", option: "columns", value: "4" });
check("rejects an option the section doesn't have", !cols.ok);

/*
 * Data loss, seen for real: set_option aimed at a list field replaced a
 * gallery's photographs with the string "6".
 */
const gallery: PageSchema = { nodes: [
  { id: "g", type: "ContentGallery", props: { heading: "Work", items: [{ caption: "a" }, { caption: "b" }] } },
]};
const clobber = applyOp(gallery, { kind: "set_option", section: "ContentGallery", option: "items", value: "6" });
check("refuses to set a CONTENT field as if it were an option", !clobber.ok,
  clobber.ok ? `items became ${JSON.stringify(clobber.schema.nodes![0].props!.items)}` : clobber.error);

/* ── swap_section ──────────────────────────────────────────────────── */

// Referred to by its own heading, like every other op accepts.
const swapped = applyOp(
  page,
  { kind: "swap_section", section: "What Our Customers Say", design: "faq" },
  { heading: "Common questions" },
);
check(
  "swaps the section named by its heading, in place",
  swapped.ok && types(swapped.schema) === "HeroSplit > ServicesEditorial > Faq > CtaBand",
  swapped.ok ? types(swapped.schema) : swapped.error,
);
check(
  "and says which design it changed to",
  swapped.ok && /Testimonials|customer/i.test(swapped.describe) && /FAQ/i.test(swapped.describe),
  swapped.ok ? swapped.describe : swapped.error,
);

// Nothing else on the page may move. A swap that reordered the page would be
// indistinguishable from remove + add, which is what it replaces.
check(
  "leaves every other section's props untouched",
  swapped.ok &&
    JSON.stringify(swapped.schema.nodes?.filter((n) => n.type !== "Faq")) ===
      JSON.stringify(page.nodes?.filter((n) => n.type !== "Testimonials")),
);

const missingNode = applyOp(page, { kind: "swap_section", section: "Faq", design: "faq-open" }, {});
check(
  "refuses a section that is not on the page",
  !missingNode.ok,
  missingNode.ok ? types(missingNode.schema) : missingNode.error,
);

const noDesign = applyOp(
  page,
  { kind: "swap_section", section: "Testimonials", design: "not-a-design" },
  {},
);
check("refuses a design that does not exist", !noDesign.ok, noDesign.ok ? "" : noDesign.error);

/* A header is not a page section, and putting one mid-page gives the visitor a
 * second navigation bar below the real one. */
const chromeDesign = applyOp(
  page,
  { kind: "swap_section", section: "Testimonials", design: "header-cta" },
  {},
);
check(
  "refuses a header as a page design",
  !chromeDesign.ok,
  chromeDesign.ok ? "" : chromeDesign.error,
);

const sameDesign = applyOp(
  page,
  { kind: "swap_section", section: "Testimonials", design: "testimonials" },
  {},
);
check(
  "refuses a swap to the design already in place",
  !sameDesign.ok,
  sameDesign.ok ? "" : sameDesign.error,
);

console.log(fails === 0 ? "\nALL EDIT TESTS PASS" : `\n${fails} FAILURE(S)`);

/* A gate that always exits 0 gates nothing: chained from `npm run verify`,
   a failure here has to stop the run. */
process.exitCode = fails === 0 ? 0 : 1;
