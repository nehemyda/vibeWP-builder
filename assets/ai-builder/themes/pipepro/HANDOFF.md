# PIPEPRO — theme handoff

A standard WordPress block theme. It has no dependency on the platform that
generated it: no phone-home, no proprietary format, no required plugins.
Any WordPress developer can maintain it.

---

## Install

1. Zip this folder and upload it at **Appearance → Themes → Add New → Upload Theme**, or drop the folder into `wp-content/themes/`.
2. Activate **PIPEPRO**.
3. Create a page, open the inserter, and add the **Hero — Split with badge and stats** pattern from the *PIPEPRO sections* category.

Requires WordPress 6.5+ and PHP 7.4+.

---

## What is editable, and how

| You want to change | Where |
|---|---|
| Headings, body copy, list items, button labels and links | Block editor, directly on the page — they are native Gutenberg blocks |
| The hero image | Select the image block, replace it as usual |
| Brand colours site-wide | **Appearance → Editor → Styles → Colours**. Each token in `assets/sections.css` reads its theme.json preset first, so changing the palette restyles everything |
| Fonts and base sizes | `theme.json` under `settings.typography` |
| Section layout — the grid, the overlapping badge, the stats rail | `assets/sections.css` |

Everything a client would normally ask for is editable without touching code.
Only the *arrangement* lives in CSS.

---

## How this theme is put together

Page content is ordinary Gutenberg core blocks — group, heading, paragraph,
list, image, buttons. Nothing custom, nothing dynamic.

The **layout** is not in the blocks. Blocks carry content inside containers
with stable class names (`yp-hero__grid`, `yp-hero__copy`), and
`assets/sections.css` does the grid, spacing and positioning. That split is
deliberate: Gutenberg is reliable at holding content and unreliable at
generating layout, so it is only asked to do the first.

Practically, that means you can edit any text in the editor and the design
holds. If you want a different arrangement, you edit the CSS.

---

## Two things to know before you change the CSS

**1. Do not remove the `.yp-page` class from `<body>`.**

Every selector in `sections.css` is prefixed with `.yp-page`. That prefix is
what gives section rules two classes of specificity, so they outrank the
layout CSS WordPress prints inline at render time:

```css
body .is-layout-flex         { gap: 24px }              /* WordPress, (0,1,1) */
body .is-layout-flow > * + * { margin-block-start: 24px } /* WordPress, (0,1,1) */
.yp-page .yp-hero__copy      { gap: 1.4rem }            /* this theme, (0,2,0) */
```

The class is added by `pipepro_body_class()` in `functions.php`. Remove it and
the layout collapses into a plain vertical stack.

If you add new rules, prefix them the same way.

**2. Do not re-enqueue `wp-block-library` normally.**

`functions.php` dequeues WordPress's block stylesheet and re-imports it into
`@layer plugins`, which puts it *below* this theme's styles. Unlayered CSS
outranks layered CSS regardless of specificity, so if that stylesheet is
loaded the usual way it will win on `box-sizing`, margins and button padding,
and the design will drift.

To subordinate a plugin's stylesheet the same way:

```php
pipepro_layer_plugin_style( 'contact-form-7' );
```

---

## Adding plugins

Plugins work normally. Their blocks can be inserted into any page alongside
the sections in this theme — a form, a booking widget, a map. They render as
themselves.

If a plugin's styling fights the design, pass its style handle to
`pipepro_layer_plugin_style()` as shown above rather than adding `!important`.

---

## Verification

This theme's rendering was checked against the original design at two
viewports, including a simulated re-save in the block editor (which is when
WordPress stamps its layout classes onto the markup):

```
DESKTOP  1440×1100   pixel diff 0.000%   external requests 0   console errors 0
MOBILE    480×1400   pixel diff 0.000%   external requests 0   console errors 0
```

Zero external requests means the rendered page fetches nothing from the
platform that generated it. It is fully self-contained.

---

## File map

```
pipepro/
├── style.css              theme header only — no styles here
├── functions.php          enqueues, cascade layers, body class, patterns
├── theme.json             design tokens → WordPress global styles
├── screenshot.png
├── assets/
│   ├── sections.css       the layout — read the comment at the top
│   └── hero.jpg
├── patterns/
│   └── hero-split.php     the hero section, re-insertable
├── templates/
│   ├── index.html
│   ├── page.html
│   └── front-page.html
└── parts/
    ├── header.html
    └── footer.html
```
