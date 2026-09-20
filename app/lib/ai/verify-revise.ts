/**
 * Revising one section's words, asserted.
 *
 * Run with `npx tsx lib/ai/verify-revise.ts`, and as part of `npm run verify`.
 * No network, no key: the model's answer is a fixture and the merge is pure.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * A client asked for one button's label changed and got a new hero. The fix
 * is that a rewrite is now a patch merged onto the section, and the merge is
 * where the guarantee lives: what the model does not return is kept, what it
 * must not touch is ignored. Those rules are pinned here so that a prompt
 * edit, or a model that starts returning everything, cannot quietly bring the
 * old behaviour back.
 * ─────────────────────────────────────────────────────────────────────
 */
import { SECTIONS, getSectionByNodeType } from "@/lib/sections";
import { applyRevision, copyFields } from "./revise-section";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

const hero = getSectionByNodeType("HeroSplit");
if (!hero) throw new Error("HeroSplit missing from the registry");
const fields = hero.fields;

const current = {
  eyebrow: "BAKED FRESH DAILY",
  heading: "Handmade Sourdough, Pastries, and Cakes in Bath",
  body: "Discover the true taste of artisan baking.",
  features: ["Made on site from 4am", "Traditional long fermentation"],
  actions: [
    { label: "See Today's Bakes", href: "/menu" },
    { label: "Order a Custom Cake", href: "/quote" },
  ],
  image: { url: "https://images.example/loaves.jpg", alt: "Loaves" },
  background: "tint",
};

/* ── 1. THE CASE: one button, and only one button ────────────────────── */
{
  const r = applyRevision(fields, current, {
    actions: [
      { label: "See Today's Loaves", href: "/menu" },
      { label: "Order a Custom Cake", href: "/quote" },
    ],
  });
  const a = r.props.actions as Array<{ label: string }>;
  if (a[0].label !== "See Today's Loaves") fail("the button did not change");
  if (r.props.heading !== current.heading) fail("the heading changed on a button edit");
  if (r.props.body !== current.body) fail("the body changed on a button edit");
  if (r.props.image !== current.image) fail("the photo changed on a button edit");
  if (r.changed.join() !== "actions") fail(`changed should be [actions], got ${JSON.stringify(r.changed)}`);
  console.log("  ok   a button change touches the buttons and nothing else");
}

/* ── 2. A model that returns everything still only changes what differs ── */
{
  const r = applyRevision(fields, current, {
    eyebrow: current.eyebrow,
    heading: current.heading,
    body: current.body,
    features: current.features,
    actions: [{ label: "Visit Us", href: "/menu" }, current.actions[1]],
  });
  if (r.changed.join() !== "actions") fail(`echoed fields counted as changes: ${JSON.stringify(r.changed)}`);
  else console.log("  ok   fields returned unchanged are not reported as changed");
}

/* ── 3. Photos and settings are refused even when returned ──────────── */
{
  const r = applyRevision(fields, current, {
    image: { url: "https://evil.example/x.jpg", alt: "x" },
    background: "dark",
    heading: "New heading",
  });
  if (r.props.image !== current.image) fail("an image in the patch was applied");
  if (r.props.background !== "tint") fail("an option in the patch was applied");
  if (r.props.heading !== "New heading") fail("the legitimate heading change was lost");
  if (r.changed.join() !== "heading") fail(`changed: ${JSON.stringify(r.changed)}`);
  console.log("  ok   a patch cannot change the photograph or a setting");
}

/* ── 4. Unknown fields and wrong shapes are dropped ─────────────────── */
{
  const r = applyRevision(fields, current, {
    tagline: "not a field",
    heading: 42,
    features: "should be a list",
    actions: [{ label: "ok", href: "/" }, "not an object"],
  });
  if (r.changed.length) fail(`bad values were applied: ${JSON.stringify(r.changed)}`);
  if ("tagline" in r.props) fail("an undeclared field was written into the props");
  console.log("  ok   undeclared fields and wrong shapes are dropped whole");
}

/* ── 5. Junk from the model is not a crash ───────────────────────────── */
{
  for (const junk of [null, "text", 7, [1, 2], undefined]) {
    const r = applyRevision(fields, current, junk);
    if (r.changed.length || r.props.heading !== current.heading) fail(`junk ${JSON.stringify(junk)} changed something`);
  }
  console.log("  ok   a non-object answer leaves the section exactly as it was");
}

/* ── 6. List entries keep their photographs across a rewrite ────────── */
{
  /* Any section whose list entries carry a photo — found, not named, so the
     case survives sections being renamed or retired. */
  const withPhotos = SECTIONS.map((def) => {
    const entry = Object.entries(def.fields).find(
      ([, s]) => s.type === "list" && s.of && Object.values(s.of).some((x) => x.type === "image") && Object.values(s.of).some((x) => x.type === "text"),
    );
    return entry ? { def, name: entry[0], spec: entry[1] } : null;
  }).find(Boolean);
  if (!withPhotos) {
    fail("no section in the registry has a list with photographs — the carry rule is untested");
  } else {
    const { def, name, spec } = withPhotos;
    const imgKey = Object.entries(spec.of!).find(([, s]) => s.type === "image")![0];
    const textKey = Object.entries(spec.of!).find(([, s]) => s.type === "text")![0];
    const before = {
      [name]: [
        { [textKey]: "Sourdough", [imgKey]: { url: "https://x/1.jpg", alt: "1" } },
        { [textKey]: "Cakes", [imgKey]: { url: "https://x/2.jpg", alt: "2" } },
      ],
    };
    const shown = copyFields(def.fields, before);
    const shownList = shown[name] as Array<Record<string, unknown>>;
    if (shownList.some((e) => imgKey in e)) fail("the model was shown a photograph URL");

    const r = applyRevision(def.fields, before, {
      [name]: [{ [textKey]: "Sourdough Loaves" }, { [textKey]: "Celebration Cakes" }],
    });
    const after = r.props[name] as Array<Record<string, unknown>>;
    if ((after[0][imgKey] as { url: string })?.url !== "https://x/1.jpg") fail("entry 1 lost its photo");
    if ((after[1][imgKey] as { url: string })?.url !== "https://x/2.jpg") fail("entry 2 lost its photo");
    if (after[1][textKey] !== "Celebration Cakes") fail("entry 2 text did not change");
    console.log(`  ok   ${def.name}: renamed entries keep the photographs they had, and the model never saw them`);
  }
}

console.log(fails === 0 ? "\nA REWRITE CHANGES ONLY WHAT WAS ASKED" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
