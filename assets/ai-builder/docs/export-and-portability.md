# Export & Portability Subsystem
**AI WordPress Builder — Technical Specification v1.0**

**The requirement:** a client leaves for another agency. Their site must keep working, and the new agency must be able to edit it — on ordinary WordPress hosting, with zero dependency on your platform.

**The constraint that makes this solvable:** every section on every page is a known component with typed props. Export is therefore a pure function, not a scraping problem.

**The rule that makes it real:** build the exporter in Phase 1, alongside the first section. Not Phase 5.

---

## 1. Why This Must Be Phase 1

If you build 100 React sections first and write the exporter afterwards, you will discover that a third of them cannot be expressed as portable markup — and by then rewriting them is a quarter's work.

Make it a definition-of-done rule from the first component:

> **A section is not complete until it renders in the platform, serializes to Gutenberg, and passes the export fidelity test.**

This costs roughly 30% more time per section. It buys you the answer to the only question every agency will ask before signing.

---

## 2. The Key Insight

Your three previous Gutenberg builders failed at **generating** layout. Export is a different, much easier problem: **preserving** a layout that already exists.

You are not asking Gutenberg to invent a bento grid. You are asking it to hold content inside a `div` that a stylesheet already knows how to lay out.

```
GENERATION (hard, fails):   AI → "build me a good layout in core blocks" → mediocre
PRESERVATION (easy, works): known layout → group wrapper + stable class + shipped CSS → faithful
```

The layout lives in CSS. Gutenberg only carries the content. That division is what makes high-fidelity export achievable.

---

## 3. The Class Name Contract

Both renderers emit **identical class names**. That single decision is what lets one stylesheet serve the live site and the exported site.

```tsx
// sections/HeroSplit/index.tsx — platform renderer
export function HeroSplit({ eyebrow, heading, body, media, actions }: HeroSplitProps) {
  return (
    <section className="yp-hero-split">
      <div className="yp-hero-split__copy">
        {eyebrow && <p className="yp-hero-split__eyebrow">{eyebrow}</p>}
        <h1 className="yp-hero-split__heading">{heading}</h1>
        <p className="yp-hero-split__body">{body}</p>
        <div className="yp-hero-split__actions">
          {actions.map(a => <Button key={a.href} {...a} />)}
        </div>
      </div>
      {media && (
        <div className="yp-hero-split__media">
          <Image assetId={media.assetId} alt={media.alt} />
        </div>
      )}
    </section>
  )
}
```

```ts
// sections/HeroSplit/export.ts — Gutenberg serializer
export function toGutenberg(p: HeroSplitProps, ctx: ExportContext): string {
  return `
<!-- wp:group {"className":"yp-hero-split","layout":{"type":"default"}} -->
<div class="wp-block-group yp-hero-split">

  <!-- wp:group {"className":"yp-hero-split__copy"} -->
  <div class="wp-block-group yp-hero-split__copy">
    ${p.eyebrow ? gbParagraph(p.eyebrow, 'yp-hero-split__eyebrow') : ''}
    ${gbHeading(p.heading, 1, 'yp-hero-split__heading')}
    ${gbParagraph(p.body, 'yp-hero-split__body')}
    ${gbButtons(p.actions, 'yp-hero-split__actions')}
  </div>
  <!-- /wp:group -->

  ${p.media ? gbImage(ctx.mediaUrl(p.media.assetId), p.media.alt, 'yp-hero-split__media') : ''}

</div>
<!-- /wp:group -->`.trim()
}
```

```css
/* sections/HeroSplit/styles.css — shipped to BOTH the platform and the export */
.yp-hero-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  align-items: center;
  padding-block: var(--space-2xl);
}
.yp-hero-split__heading {
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
}
@media (max-width: 768px) {
  .yp-hero-split { grid-template-columns: 1fr; }
  .yp-hero-split__media { display: none; }
}
```

Result in the exported site: the asymmetric grid, the fluid type, the responsive rules — all intact. And another agency opens the page in stock WordPress and edits the heading, swaps the image, changes button labels, using native Gutenberg controls.

---

## 4. Three Export Tiers

Offer all three. Different departures need different things.

### Tier 1 — Static HTML archive
The compiled SSR output, zipped. Works on any host including S3 or Netlify. Not editable in WP.
**Use:** archival, or a client who just needs the site to keep serving.
**Effort:** near zero — the compiler already produces this.

### Tier 2 — Native WordPress export ← *the one that matters*
A standard WordPress site. Every page is native Gutenberg blocks. A companion stylesheet carries the layout. Any WordPress developer can maintain it.
**Use:** client moves to another agency. This is the default offer.
**Fidelity:** 90–95% visual, 100% content-editable.

### Tier 3 — Self-contained React theme
The React theme plus a standalone build of the renderer that reads a local JSON file. Pixel-perfect, still runs on any WP host, but editable only in code.
**Use:** a technically capable receiving agency who wants exact fidelity.
**Fidelity:** 100% visual, content editable only via code or a re-import.

---

## 5. What Tier 2 Actually Produces

```
pipepro-export-2026-08-25.zip
├── wordpress-export.xml           # WXR — pages as native Gutenberg blocks
├── theme/
│   └── pipepro/                   # standard classic-plus-FSE theme, no platform deps
│       ├── style.css
│       ├── theme.json             # design tokens → WP global styles
│       ├── functions.php          # enqueues sections.css, registers patterns
│       ├── assets/
│       │   └── sections.css       # ← the layout CSS, versioned
│       └── patterns/              # every section as a reusable block pattern
│           ├── hero-split.php
│           ├── services-grid.php
│           └── ...
├── uploads/                       # media pulled from S3, filenames preserved
├── plugins-manifest.json          # plugins the site depends on, with versions
└── HANDOFF.md                     # import steps, what's editable, known limits
```

**Details that matter in practice:**

- **`theme.json` carries the tokens.** Colors, fonts, spacing, radius land in WP global styles, so the site's design system survives and the new agency can adjust it from Appearance → Editor.
- **Sections ship as block patterns.** The new agency can insert a `HeroSplit` on a brand-new page. They inherit your library rather than losing it.
- **Media URLs are rewritten** from your S3 CDN to `wp-content/uploads` during export. Nothing points back at your infrastructure.
- **Gutenberg nodes export trivially.** Plugin blocks were already native — they pass through untouched. Same for WooCommerce products, orders, and settings.
- **`HANDOFF.md` is honest.** It states plainly which sections are layout-locked by CSS and how to change them. Agencies respect this far more than a claim of perfection.

---

## 6. Verifying Independence — Automated

The export is worthless if the exported site quietly phones home. Make this a CI gate, not a promise.

```
Export fidelity test (runs on every section, every build):

1. Build a fixture page containing the section
2. Screenshot it on the platform            → baseline.png
3. Run the exporter
4. Import into a clean WordPress container (no platform plugins)
5. Block all network egress to *.yourplatform.com at the container level
6. Screenshot the imported page             → exported.png
7. Assert: pixel diff < 3%
8. Assert: zero requests to platform domains, zero console errors
9. Assert: the page's content is editable — mutate the heading via WP REST,
           confirm the change renders
```

A section that fails any assertion does not ship. This turns "no lock-in" from marketing copy into a build-enforced property.

---

## 7. The Business Framing

Do not treat this as a defensive feature. Lead with it.

> **One-click export to standard WordPress. Your client's site, their property, always.**

Every competing AI builder — 10Web included — is vague here. 10Web says you can "export the site and move it anytime," but what you actually get is compiled `wvc-builds` bundles that only their theme knows how to render. It is technically an export and practically a dead end.

You can offer something materially different, and demonstrate it in a sales call in two minutes:

1. Export a site
2. Import it into a stock WordPress install on a competitor's hosting
3. Edit a heading in the native Gutenberg editor
4. Show the platform is unreachable

That demo closes agency deals, because the fear you just described is the fear every one of them has.

**Contract language worth adopting:** exports are always available, on any plan, including after cancellation, for a defined window (90 days is generous and cheap). Agencies read the cancellation clause before they sign.

---

## 8. Effect on the Build Plan

| Phase | Addition |
|---|---|
| **1 — spine** | `toGutenberg()` required for every section from section #1. Export fidelity test in CI. |
| **2 — Gutenberg interop** | Plugin nodes pass through the exporter unchanged (nearly free). |
| **3 — editor** | "Export site" in the agency dashboard: tier picker → queued job → download link. |
| **4 — AI** | No change — the AI produces schema, the exporter is downstream of it. |
| **5 — hardening** | Tier 3 self-contained theme; scheduled exports; export-on-cancellation automation. |

---

## 9. The Two Things That Will Erode This

**1. Sections that drift ahead of their serializer.**
A developer adds a prop to `HeroSplit.tsx` and forgets `export.ts`. Export silently loses the feature. Prevent it structurally: the Zod schema is the single source of truth, and the fidelity test fails on any prop the serializer does not consume.

**2. CSS that depends on the React runtime.**
A section using JS-driven layout — measuring the DOM, animating on scroll via a React hook — cannot be preserved by a stylesheet alone. Rule: **layout must be expressible in CSS.** JS is allowed for enhancement only, and the section must degrade gracefully without it. Enforce this in code review; it is the fastest way to accumulate un-exportable sections otherwise.
