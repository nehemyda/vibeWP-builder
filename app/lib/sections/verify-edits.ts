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

console.log(fails === 0 ? "\nALL EDIT TESTS PASS" : `\n${fails} FAILURE(S)`);
