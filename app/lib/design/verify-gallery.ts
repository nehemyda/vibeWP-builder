/**
 * The gallery's narrowing and paging, checked against counts the Images tab
 * will not reach for a long time.
 *
 * Here because the interesting cases are invisible on a real site today: with
 * seven pictures there is one page, no clamping and nothing to search past.
 * The faults arrive at fifty — a page number left pointing past the end after
 * a delete, a search that collapses five pages to one while you stand on page
 * four, an exact multiple of the page size producing a second empty page — and
 * each of those renders an empty grid, which reads as a broken tab rather than
 * as the end of a list.
 *
 * Run by `npm run verify`.
 */
import { galleryPage } from "@/lib/design/gallery-page";

type Pic = { n: number; text: string; missing: boolean };
const make = (count: number): Pic[] =>
  Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    text: `picture ${i + 1} ${i % 3 === 0 ? "hero bread loaf" : "gallery pastry"}`,
    missing: i % 4 === 0,
  }));

const P = 20;
const run = (all: Pic[], page: number, query = "", missingOnly = false) =>
  galleryPage(all, {
    keep: missingOnly ? (r) => r.missing : undefined,
    query,
    searchable: (r) => r.text,
    page,
    perPage: P,
  });

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name.padEnd(58)} ${ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("counts and boundaries");
check("47 items → 3 pages", run(make(47), 1).pageCount, 3);
check("exactly 20 → 1 page, no empty second", run(make(20), 1).pageCount, 1);
check("21 → 2 pages", run(make(21), 1).pageCount, 2);
check("0 items → pageCount is 1, not 0", run(make(0), 1).pageCount, 1);
check("page 1 of 47 shows 20", run(make(47), 1).rows.length, 20);
check("last page of 47 shows the remaining 7", run(make(47), 3).rows.length, 7);
check("page 2 starts at item 21", run(make(47), 2).rows[0].n, 21);

console.log("\nclamping — the cases that render an empty grid if wrong");
check("asked page 9 of 3 → clamped to 3", run(make(47), 9).page, 3);
check("clamped page still returns its rows", run(make(47), 9).rows.length, 7);
check("deleted down to 21 while on page 3 → page 2", run(make(21), 3).page, 2);
check("asked page 0 → 1", run(make(47), 0).page, 1);
check("asked page -4 → 1", run(make(47), -4).page, 1);
check("empty result → page 1, no rows", [run(make(0), 5).page, run(make(0), 5).rows.length], [1, 0]);

console.log("\nsearch");
check("'bread' matches every third", run(make(47), 1, "bread").matched.length, 16);
check("'hero bread' — both words, any order", run(make(47), 1, "bread hero").matched.length, 16);
check("'bread pastry' — no row has both", run(make(47), 1, "bread pastry").matched.length, 0);
check("case-insensitive", run(make(47), 1, "BREAD").matched.length, 16);
check("whitespace only is not a search", run(make(47), 1, "   ").matched.length, 47);
check("search narrows 3 pages to 1", run(make(47), 1, "bread").pageCount, 1);
check("standing on page 3 when search leaves 1", run(make(47), 3, "bread").page, 1);

console.log("\nfilter and search together");
check("missing only", run(make(47), 1, "", true).matched.length, 12);
check("missing + 'bread'", run(make(47), 1, "bread", true).matched.length, 4);
check("filter applies before paging", run(make(47), 1, "", true).rows.length, 12);

console.log(`\n${failed === 0 ? "gallery paging: all passed" : `gallery paging: ${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
