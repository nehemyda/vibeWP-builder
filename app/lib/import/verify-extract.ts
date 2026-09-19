/**
 * Reading a business's details off its own page, asserted.
 *
 * Run with `npx tsx lib/import/verify-extract.ts`, and as part of
 * `npm run verify`. Fetches nothing — every case is a fixture.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * The output of this becomes a client's phone number and address. Both ways it
 * can be wrong are quiet: it can return nothing, which merely wastes the
 * feature, or it can return the WRONG thing, which a client may accept because
 * it arrived looking authoritative.
 *
 * The second is the one to guard. The rule the whole module rests on is that a
 * value must come from a field whose meaning was declared — schema.org
 * telephone, a tel: link — and never from a number that happened to be in the
 * text. A regex over page text would find a customer's number in a
 * testimonial, or a price, and present it as the business's phone.
 * ─────────────────────────────────────────────────────────────────────
 */
import { extractProfile } from "./structured";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

const page = (head: string, body = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

/* ── 1. A full LocalBusiness, the best case ──────────────────────────── */
{
  const html = page(
    ld({
      "@context": "https://schema.org",
      "@type": "Dentist", // a LocalBusiness subtype, not the word itself
      name: "Northgate Dental",
      telephone: "0117 496 0000",
      email: "hello@northgatedental.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "14 Northgate Street",
        addressLocality: "Bristol",
        postalCode: "BS1 2AA",
      },
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "09:00", closes: "17:00" },
      ],
    }),
  );
  const p = extractProfile(html);
  const expect: Array<[string, string | undefined]> = [
    ["businessName", p.businessName?.value],
    ["phone", p.phone?.value],
    ["email", p.email?.value],
    ["address", p.address?.value],
    ["city", p.city?.value],
    ["postcode", p.postcode?.value],
  ];
  const want = ["Northgate Dental", "0117 496 0000", "hello@northgatedental.com", "14 Northgate Street", "Bristol", "BS1 2AA"];
  expect.forEach(([field, got], i) => {
    if (got !== want[i]) fail(`${field}: expected ${JSON.stringify(want[i])}, got ${JSON.stringify(got)}`);
  });
  if (p.hours?.value.monday !== "09:00–17:00") fail(`hours: got ${JSON.stringify(p.hours?.value)}`);
  console.log("  ok   a full LocalBusiness yields 7 fields, subtype recognised");
}

/* ── 2. @graph, which is how Yoast and our own theme emit it ─────────── */
{
  const html = page(
    ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "A website, not the business" },
        { "@type": "Organization", name: "Bluebell Florist", telephone: "01179 000 111" },
      ],
    }),
  );
  const p = extractProfile(html);
  if (p.businessName?.value !== "Bluebell Florist") {
    fail(`@graph: picked ${JSON.stringify(p.businessName?.value)} — the WebSite node, not the business`);
  } else {
    console.log("  ok   @graph: the business is picked, not the WebSite node");
  }
}

/* ── 3. A one-line address, which is what our own theme writes ───────── */
{
  const p = extractProfile(
    page(ld({ "@type": "LocalBusiness", name: "X", address: { streetAddress: "14 Market Street, Bath, BA1 1AA" } })),
  );
  if (p.postcode?.value !== "BA1 1AA") fail(`postcode not split out: ${JSON.stringify(p.postcode)}`);
  if (p.address?.value !== "14 Market Street, Bath") fail(`address left whole: ${JSON.stringify(p.address?.value)}`);
  if (p.city?.value !== "Bath") fail(`city not inferred: ${JSON.stringify(p.city?.value)}`);
  if (p.city && !/check/i.test(p.city.source)) fail("an inferred city must say it needs checking");
  console.log("  ok   a combined address splits, and the inferred city says so");
}

/* ── 4. THE RULE: nothing is read from prose ─────────────────────────── */
{
  const html = page(
    "<title>Some Cafe</title>",
    `<p>Call Dave on 07700 900123 for the best coffee. Email dave@example.com.</p>
     <blockquote>"Ring them on 0161 496 0000" — a happy customer</blockquote>`,
  );
  const p = extractProfile(html);
  if (p.phone) fail(`a number in prose was taken as the phone: ${p.phone.value} (${p.phone.source})`);
  if (p.email) fail(`an address in prose was taken as the email: ${p.email.value}`);
  if (p.businessName?.value !== "Some Cafe") fail("the title should still give a name");
  console.log("  ok   numbers and emails in page text are NOT harvested");
}

/* ── 5. tel: and mailto: ARE declarations, and are used ──────────────── */
{
  const p = extractProfile(
    page("<title>T</title>", '<a href="tel:0161 496 0000">Call</a><a href="mailto:hi@x.com?subject=Hi">Mail</a>'),
  );
  if (p.phone?.value !== "0161 496 0000") fail(`tel: link not used: ${JSON.stringify(p.phone)}`);
  if (p.email?.value !== "hi@x.com") fail(`mailto: not cleaned of its query: ${JSON.stringify(p.email?.value)}`);
  console.log("  ok   tel: and mailto: are used, and mailto's query is dropped");
}

/* ── 6. Broken and empty input must not throw ────────────────────────── */
{
  for (const [label, html] of [
    ["empty", ""],
    ["no head", "<p>hi</p>"],
    ["malformed JSON-LD", page('<script type="application/ld+json">{ not json</script>')],
    ["JSON-LD that is a string", page(ld("just a string"))],
  ] as const) {
    try {
      extractProfile(html);
    } catch (e) {
      fail(`${label} threw: ${(e as Error).message}`);
    }
  }
  console.log("  ok   empty, malformed and surprising input does not throw");
}

/* ── 7. A broken block must not hide a good one ──────────────────────── */
{
  const html = page(
    `<script type="application/ld+json">{ broken</script>` +
      ld({ "@type": "LocalBusiness", name: "Still Found", telephone: "0113 000 0000" }),
  );
  const p = extractProfile(html);
  if (p.businessName?.value !== "Still Found") fail("a malformed block hid the valid one that followed");
  else console.log("  ok   one malformed block does not discard the rest");
}

/* ── 8. Relative logos are made absolute ─────────────────────────────── */
{
  const p = extractProfile(page('<meta property="og:image" content="/img/logo.png">'), "https://example.com/about");
  if (p.logoUrl?.value !== "https://example.com/img/logo.png") {
    fail(`relative logo not resolved: ${JSON.stringify(p.logoUrl?.value)}`);
  } else {
    console.log("  ok   a relative logo URL is resolved against the page");
  }
}

/* ── 9. Every value carries a source, or the reviewer cannot judge it ── */
{
  const p = extractProfile(
    page(ld({ "@type": "LocalBusiness", name: "S", telephone: "1", email: "a@b.c", description: "d" })),
  );
  for (const [field, found] of Object.entries(p)) {
    if (!found || !(found as { source?: string }).source?.trim()) fail(`${field} has no source`);
  }
  console.log("  ok   every extracted value carries where it came from");
}

console.log(fails === 0 ? "\nEXTRACTION READS ONLY WHAT WAS DECLARED" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
