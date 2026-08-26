# AI Builder

Section library, Gutenberg exporter, and export fidelity harness for an
AI-generated WordPress site builder.

The design premise: **the AI never generates layout.** A designer solves each
section once in React and CSS; the AI selects a section and fills typed props.
The same section serializes to native Gutenberg blocks, so a client can leave
for another agency and keep an editable site.

---

## Quick start

```bash
npm install
npx playwright install chromium    # first run only
npm test
```

Expected:

```
  HeroSplit
    schema        PASS
    class parity  PASS  (22 classes)
    prop coverage PASS  (26 values)
    desktop       diff   0.000%  Δh   0px  ext 0  err 0   PASS
    mobile        diff   0.000%  Δh   0px  ext 0  err 0   PASS

  ALL SECTIONS PASS
```

---

## Layout

```
packages/renderer/src/
├── registry.ts                 type string → real code. Add a section here.
├── gutenberg/blocks.ts         core block emitters, shared by all serializers
├── styles/base.css             tokens, box-sizing, block-gap reset
└── sections/
    └── HeroSplit/
        ├── index.tsx           React renderer      (platform)
        ├── export.ts           Gutenberg serializer (export)
        ├── styles.css          the layout          (both)
        ├── schema.ts           Zod props + aiHint  (AI, editor, validation)
        └── fixture.ts          props the test renders

tools/
├── build-css.mjs               section CSS → scoped → theme
├── scope-css.mjs               the scoping transform
├── fidelity.tsx                the test harness
└── fixtures/                   real WordPress block CSS

themes/pipepro/                 the exported theme (installable)
docs/                           architecture specs
```

---

## Adding a section

Five files, then one registry entry. A section is **not done** until
`npm test` is green — that is the definition of done, not a nice-to-have.

```bash
mkdir packages/renderer/src/sections/ServicesGrid
# index.tsx  export.ts  styles.css  schema.ts  fixture.ts
# then add the entry to registry.ts
npm test
```

Budget roughly 1–1.5 days per section for a designer + developer pair.

---

## The five rules

These came out of building the first section. Breaking any of them produces a
section that looks fine on the platform and breaks on export.

**1. React mirrors Gutenberg's DOM, not the other way around.**
Where WordPress wraps text in a `<p>`, React does too. Where WordPress adds a
`<figure>`, React uses one. Parity of shape is what lets one stylesheet drive
both renders.

**2. Style the anchor by position, never by class.**
WordPress puts its own classes on `<a>` and only lets a block author name the
wrapping `<div>`. Use `.yp-btn--primary a`, not `.yp-btn__link`.

**3. Layout must be expressible in CSS.**
JavaScript is for enhancement only. A section that measures the DOM to lay
itself out cannot be exported, and silently breaks the portability guarantee.

**4. Every selector gets scoped; every element declares its margin.**
`tools/scope-css.mjs` prefixes selectors with `.yp-page` at build time, giving
them two classes of specificity so they outrank WordPress's inline layout CSS.
Elements that do not declare a margin inherit WordPress's 24px block gap the
moment someone re-saves the page in the editor — `styles/base.css` zeroes it
before the component rules, so an intentional margin still wins on source order.

**5. Never inherit `box-sizing` from the host.**
WordPress sets `border-box` on blocks; a bare React host does not. Relying on
either makes every width differ by twice the horizontal padding.

---

## What the test actually checks

Per section, at two viewports:

| Check | Catches |
|---|---|
| **schema** | fixture drifting from the props contract |
| **class parity** | a class name that exists in one renderer and not the other |
| **prop coverage** | a serializer that silently drops a prop |
| **pixel diff < 3%** | layout and styling divergence |
| **zero external requests** | the exported site phoning home |
| **zero console errors** | broken markup or scripts |

The Gutenberg render is given real WordPress conditions: the actual
`wp-block-library` stylesheet in `@layer plugins`, WordPress's inline layout
CSS unlayered, and layout classes stamped onto the markup to simulate a re-save
in the block editor.

**The structural checks matter more than the pixel diff.** A broken class name
on a small element moves 0.13% of the page and sails past a 3% threshold; class
parity catches it exactly. Both regressions below were verified against this
harness:

```
class name typo in serializer   → class parity FAIL  (pixel diff was 0.130%, would have passed)
serializer drops a prop         → prop coverage FAIL (pixel diff was 0.170%, would have passed)
```

---

## Exported theme

`themes/pipepro/` is a standard WordPress block theme with no dependency on
this platform. Build and package it:

```bash
npm run build:css     # section CSS → themes/pipepro/assets/sections.css
npm run theme:zip     # → pipepro-theme.zip, uploadable in wp-admin
```

`themes/pipepro/HANDOFF.md` is written for the receiving agency and explains
what is editable, and the two cascade rules they must not break.

---

## Docs

| File | Covers |
|---|---|
| `docs/architecture.md` | full system — agents, provisioning, hosting, roadmap |
| `docs/hybrid-renderer.md` | the React + Gutenberg dispatch, 3 hydration strategies |
| `docs/export-and-portability.md` | export tiers, the class-name contract, CI gate |

---

## Not built yet

The compiler service, the editor, the AI pipeline, and 49 more sections. This
repo is the spine: the section contract, the exporter, and the test that keeps
them honest. Everything else is downstream of getting these right.
