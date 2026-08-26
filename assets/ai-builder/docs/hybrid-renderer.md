# Hybrid React + Gutenberg Rendering Architecture
**AI WordPress Builder — Technical Specification v1.0**

The core idea: **one page, two kinds of sections.** AI-generated brand sections render as React components. Third-party plugin content renders as native Gutenberg blocks. A single renderer walks the page tree and dispatches each node to the right engine.

```
Page Tree
 ├── { kind: "react",     type: "HeroSplit"    }   → your React component library
 ├── { kind: "react",     type: "ServicesGrid" }   → your React component library
 ├── { kind: "gutenberg", block: "bookly/form" }   → WP server-render → hydrated island
 ├── { kind: "react",     type: "Testimonials" }   → your React component library
 └── { kind: "gutenberg", block: "wpforms/form"}   → WP server-render → hydrated island
```

---

## 1. The Page Schema

Everything flows from this. The AI outputs it, the editor mutates it, the compiler consumes it, the renderer walks it.

```jsonc
{
  "schemaVersion": "1.0",
  "pageId": 12,
  "slug": "home",
  "title": "Home",
  "seo": {
    "title": "Emergency Plumbing in Springfield | PIPEPRO",
    "description": "24/7 licensed master plumbers...",
    "schema": { "@type": "Plumber", "...": "..." }
  },
  "theme": {
    "tokens": {
      "--primary": "oklch(64.6% 0.222 41.1)",
      "--primary-foreground": "oklch(98.5% 0 0)",
      "--radius": "8px",
      "--font-sans": "'Plus Jakarta Sans', system-ui, sans-serif"
    },
    "darkTokens": { "--primary": "oklch(70.1% 0.19 41.1)" }
  },
  "nodes": [
    {
      "id": "n_a1b2c3",
      "kind": "react",
      "type": "HeroSplit",
      "props": {
        "eyebrow": "24/7 LIVE DISPATCH ACTIVE IN SPRINGFIELD",
        "heading": "Rapid Emergency Repairs & Precision Plumbing Installation",
        "body": "When water lines break or drains back up...",
        "media": { "assetId": 341, "alt": "Master plumber on site" },
        "actions": [
          { "label": "Call (555) 123-4567", "href": "tel:5551234567", "variant": "primary" },
          { "label": "Request Inspection Quote", "href": "/contact", "variant": "outline" }
        ]
      },
      "style": {
        "spacing": { "paddingBlock": "5.06rem" },
        "background": "var(--background)"
      },
      "responsive": {
        "md": { "style": { "spacing": { "paddingBlock": "3.38rem" } } },
        "sm": { "props": { "media": null } }
      },
      "children": []
    },
    {
      "id": "n_d4e5f6",
      "kind": "gutenberg",
      "block": "wpforms/form-selector",
      "attrs": { "formId": 7, "displayTitle": false },
      "innerHTML": null,          // filled by server-render at compile time
      "hydration": "island",      // "static" | "island" | "iframe"
      "style": { "spacing": { "paddingBlock": "3.38rem" } }
    }
  ]
}
```

### Field contract

| Field | Meaning |
|---|---|
| `kind` | `"react"` or `"gutenberg"` — the dispatch key |
| `type` | React component name (must exist in your registry) |
| `block` | Gutenberg block name (`namespace/name`) |
| `props` / `attrs` | Component props vs. block attributes — kept separate deliberately |
| `style` | Design-token-referencing style overrides only. Never raw hex/px for color. |
| `responsive` | Breakpoint overrides, merged over base at render |
| `hydration` | How a Gutenberg block gets to the browser (see §4) |
| `children` | Nested nodes — containers, columns, grids |

**Rule:** `style` may only reference CSS variables (`var(--primary)`), never literal colors. This is what guarantees a theme change repaints the whole site.

---

## 2. The Component Registry

The bridge between a `type` string and real React code. This is also what constrains the AI.

```ts
// registry/index.ts
import { z } from 'zod'

export const registry = {
  HeroSplit: {
    component: () => import('./sections/HeroSplit'),
    schema: z.object({
      eyebrow: z.string().max(60).optional(),
      heading: z.string().max(120),
      body: z.string().max(400),
      media: z.object({ assetId: z.number(), alt: z.string() }).nullable(),
      actions: z.array(z.object({
        label: z.string().max(40),
        href: z.string(),
        variant: z.enum(['primary','outline','ghost'])
      })).max(2)
    }),
    category: 'hero',
    // What the AI sees when choosing sections
    aiHint: 'Split hero: copy left, image right. Use for service businesses needing a strong CTA above the fold.'
  },
  ServicesGrid: { /* ... */ },
  Testimonials: { /* ... */ },
  StatsBar:     { /* ... */ },
  FAQAccordion: { /* ... */ },
  // ...100+ sections
} as const
```

**Three jobs this does:**

1. **Validates AI output** — if Gemini hallucinates a prop, Zod rejects it and the agent retries with the error message.
2. **Feeds the AI** — the `aiHint` + Zod schema are serialized into the Design Agent's prompt so it only ever picks real components with real props.
3. **Powers the editor** — the right-hand properties panel is generated from the Zod schema. Add a component, the editor UI comes free.

---

## 3. The Dual Renderer

One function, two branches. Lives in your React theme package.

```tsx
// renderer/PageRenderer.tsx
import { registry } from '../registry'
import { GutenbergNode } from './GutenbergNode'

export function PageRenderer({ page }: { page: PageSchema }) {
  return (
    <ThemeProvider tokens={page.theme.tokens} darkTokens={page.theme.darkTokens}>
      {page.nodes.map(node => <Node key={node.id} node={node} />)}
    </ThemeProvider>
  )
}

function Node({ node }: { node: PageNode }) {
  if (node.kind === 'gutenberg') {
    return <GutenbergNode node={node} />
  }

  const entry = registry[node.type]
  if (!entry) return <MissingComponent type={node.type} />   // never crash the page

  const Comp = lazy(entry.component)
  return (
    <SectionShell id={node.id} style={node.style} responsive={node.responsive}>
      <Comp {...node.props}>
        {node.children?.map(c => <Node key={c.id} node={c} />)}
      </Comp>
    </SectionShell>
  )
}
```

`SectionShell` is what makes the editor work — it stamps `data-node-id` on the DOM element, which is how a click in the iframe maps back to a schema node.

---

## 4. Gutenberg Interop — The Hard Part

A plugin block is PHP that expects to run inside WordPress's render loop. Three strategies, picked per block:

### Strategy A — `static` (best, use when possible)

Block has **no frontend JS**. Compile-time: call WP, get HTML, inline it.

```php
// wp-plugin/class-block-renderer.php
public function render_block_to_html( $block_name, $attrs ) {
    $block = [ 'blockName' => $block_name, 'attrs' => $attrs, 'innerBlocks' => [] ];
    return render_block( $block );   // WP core — runs the plugin's render_callback
}
```

Exposed as a REST endpoint your compiler calls:

```
POST /wp-json/yourplatform/v1/render-block
{ "block": "core/table", "attrs": {...} }
→ { "html": "<figure class=\"wp-block-table\">...</figure>", "assets": { "css": [...], "js": [] } }
```

Renderer output: `<div dangerouslySetInnerHTML={{ __html: node.innerHTML }} />`

Covers: `core/*` blocks, most SEO/schema blocks, static content blocks.

### Strategy B — `island` (the workhorse)

Block **has frontend JS** (forms, sliders, accordions, maps). Server-render the HTML, then let the plugin's own script hydrate that DOM subtree after mount.

```tsx
// renderer/GutenbergNode.tsx
export function GutenbergNode({ node }: { node: GutenbergNodeType }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (node.hydration !== 'island') return
    // Load the plugin's registered assets, then fire the events it listens for
    loadAssets(node.assets).then(() => {
      document.dispatchEvent(new CustomEvent('yourplatform:block-mounted', {
        detail: { root: ref.current, block: node.block }
      }))
      // jQuery-era plugins listen on document ready — re-trigger it scoped
      if (window.jQuery) window.jQuery(document).trigger('yourplatform:rehydrate', [ref.current])
    })
  }, [node.id])

  return (
    <SectionShell id={node.id} style={node.style}>
      <div ref={ref} data-wp-block={node.block}
           dangerouslySetInnerHTML={{ __html: node.innerHTML }} />
    </SectionShell>
  )
}
```

`loadAssets` is a deduping loader — if three blocks all need jQuery, it loads once.

Covers: WPForms, Contact Form 7, Gravity Forms, sliders, tabs, most modern blocks.

### Strategy C — `iframe` (escape hatch)

Block is deeply coupled to WP's full page context — global CSS resets, `wp_footer` dependencies, admin-ajax flows that assume a full WP page. Render it in a real WP page inside a same-origin iframe with auto-height.

```tsx
<iframe
  src={`/?yourplatform_block_frame=1&node=${node.id}`}
  onLoad={e => autoHeight(e.currentTarget)}
  style={{ width: '100%', border: 0 }}
  title={node.block}
/>
```

The `yourplatform_block_frame` query param makes WP serve a minimal template containing just that one block with full WP context.

Covers: LMS (LearnDash), membership (MemberPress), booking (Amelia, Bookly), directories.

### Picking the strategy — automatic

Run this once per block type at plugin-install time and cache the verdict:

```php
function classify_block( $block_name ) {
    $type = WP_Block_Type_Registry::get_instance()->get_registered( $block_name );
    if ( ! $type ) return 'iframe';                       // unknown → safest
    if ( empty( $type->view_script_handles ) &&
         empty( $type->script_handles ) )    return 'static';
    if ( block_declares_full_page_deps( $type ) ) return 'iframe';
    return 'island';
}
```

Store results in `wp_options` as your **block compatibility matrix**. Surface it in the agency dashboard: *"Bookly — renders in compatibility mode (iframe)."* Honest, and it sets expectations.

---

## 5. The Compiler Service

Node.js service. Takes page schema → emits a per-page bundle. This is 10Web's `wvc-builds` equivalent, done cleanly.

```
POST /compile
{ siteId, pageId, schema }
        ↓
1. Validate schema (Zod) — reject bad nodes early
2. Resolve Gutenberg nodes:
     for each kind:"gutenberg" node →
       POST {site}/wp-json/yourplatform/v1/render-block
       → fill node.innerHTML + node.assets
3. Tree-shake: collect only the React components this page uses
4. Emit entry file:
     import { PageRenderer } from '@yourplatform/renderer'
     import schema from './schema.json'
     hydrateRoot(document.getElementById('page-root'), <PageRenderer page={schema} />)
5. Vite build (library mode, SSR pass + client pass)
     → Home.html   (pre-rendered markup — this is what SEO crawlers get)
     → Home.js     (hydration bundle)
     → Home.css    (only the CSS this page needs)
6. Write to /wp-content/uploads/yourplatform-builds/build_{buildId}/{Page}/
7. PATCH the page row: build_id = {buildId}
```

**Key decisions:**

- **SSR the React tree at compile time.** The `.html` file is complete markup — this is why 10Web scores 90+ on PageSpeed. The JS bundle only hydrates interactive parts.
- **Immutable build IDs.** Never overwrite. `build_1767694` → `build_1767695`. Instant rollback, and CDN caching is trivial (`Cache-Control: immutable`).
- **Per-page CSS.** Vite splits it. The Contact page doesn't ship the ServicesGrid styles.
- **Queue it.** BullMQ. A compile takes 2–8s; the editor shouldn't block on it. Optimistic UI in the editor, compile in background, swap on completion.

---

## 6. WordPress Side

### Content storage — custom table, not `post_content`

```sql
CREATE TABLE wp_yp_pages (
  id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id       BIGINT UNSIGNED NOT NULL,
  schema_json   LONGTEXT NOT NULL,
  build_id      VARCHAR(32) NULL,
  version       INT UNSIGNED NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  KEY post_id_version (post_id, version)
);
```

Every save inserts a new row. Version history and undo come free. `post_content` stays empty (or holds a fallback notice, like 10Web does).

### The theme — thin PHP shell

```php
<?php // wvc-style theme: single-page.php
$build = yp_get_build_for_post( get_the_ID() );
$dir   = wp_upload_dir()['baseurl'] . "/yourplatform-builds/{$build['id']}/{$build['page']}";
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
  <?php wp_head(); // ← Yoast, schema, analytics all still work here ?>
  <link rel="stylesheet" href="<?= esc_url("$dir/{$build['page']}.css") ?>">
  <style><?= yp_render_theme_tokens( $build['tokens'] ) // :root { --primary: ... } ?></style>
</head>
<body <?php body_class(); ?>>
  <div id="page-root"><?= yp_get_prerendered_html( $build ) ?></div>
  <script>window.YP = <?= wp_json_encode( yp_client_config() ) ?>;</script>
  <script type="module" src="<?= esc_url("$dir/{$build['page']}.js") ?>"></script>
  <?php wp_footer(); // ← plugin scripts land here, islands pick them up ?>
</body>
</html>
```

`wp_head()` and `wp_footer()` staying intact is exactly what keeps SEO plugins, analytics, and island hydration working.

### REST surface (your plugin registers these)

```
GET    /yp/v1/pages/{id}              → schema + build info
PUT    /yp/v1/pages/{id}              → save schema, enqueue compile
POST   /yp/v1/render-block            → server-render one Gutenberg block
GET    /yp/v1/blocks/available        → installed blocks + compatibility verdicts
GET    /yp/v1/theme                   → design tokens
PUT    /yp/v1/theme                   → update tokens, recompile all pages
POST   /yp/v1/media                   → upload → returns assetId
GET    /yp/v1/menus                   → nav structure
```

---

## 7. Editor Integration

The editor already knows how to handle React nodes. Gutenberg nodes need two extra pieces.

### Adding a plugin block

```
User clicks "+ Add Section"
  ↓
Panel has two tabs:
  [ Sections ]  ← your React library, AI-suggested first
  [ Plugins  ]  ← GET /yp/v1/blocks/available
  ↓
User picks "WPForms → Contact Form"
  ↓
Editor needs the block's settings UI. Two options:
  (a) Block has a `block.json` with typed attributes → auto-generate the form
  (b) Block has a custom React edit UI → mount @wordpress/block-editor in a panel
  ↓
Save → node { kind:"gutenberg", block:"wpforms/form-selector", attrs:{formId:7} }
  ↓
Editor calls /render-block for live preview, compiler does it again at build
```

For (b), you mount a minimal `@wordpress/block-editor` instance scoped to a single block — you get every plugin's native settings UI for free. This is the piece that makes plugin support feel first-class rather than bolted on.

### Click-to-edit, unified

```js
// inside the preview iframe
document.addEventListener('click', e => {
  const el = e.target.closest('[data-node-id]')
  if (!el) return
  e.preventDefault()
  parent.postMessage({
    type: 'NODE_SELECTED',
    nodeId: el.dataset.nodeId,
    kind:   el.dataset.nodeKind,        // 'react' | 'gutenberg'
    rect:   el.getBoundingClientRect().toJSON()
  }, location.origin)
})
```

The editor then loads either the Zod-generated props panel (React) or the block settings panel (Gutenberg). Same interaction, two panels.

### AI Co-Pilot scope

The Co-Pilot edits **React nodes only**. When a user asks it to change a plugin block, it responds honestly: *"That's a WPForms block — open its settings to edit the form fields."* Trying to have the AI rewrite plugin attributes is where this architecture would get fragile.

---

## 8. Where This Beats 10Web

| Limitation in 10Web | This architecture |
|---|---|
| Only 7 core shortcodes supported | Full Gutenberg block ecosystem via 3 hydration strategies |
| No LMS / membership / booking | `iframe` strategy covers them, honestly labeled |
| Plugin content can't enter the page | First-class node kind in the schema |
| Agencies must abandon their plugin stack | Agencies keep their stack |
| Content locked in proprietary format | Schema is documented JSON; export to Gutenberg is a pure function |

That last row matters for agency trust: because every React node maps to a section, you can write a one-way exporter that converts a page to native Gutenberg blocks. An agency can always leave. Say so in your marketing — it removes the biggest objection to adopting a proprietary builder.

---

## 9. Build Order

**Phase 1 — the spine (6–8 weeks)**
Schema + Zod validation → registry with 15 sections → PageRenderer (React branch only) → compiler service → thin WP theme → save/compile/serve loop working end to end.

**Phase 2 — Gutenberg interop (4–6 weeks)**
`/render-block` endpoint → block classifier → `static` strategy → `island` strategy + asset loader → compatibility matrix in the dashboard.

**Phase 3 — editor (6–8 weeks)**
Iframe bridge → click-to-select → Zod-generated props panels → `@wordpress/block-editor` panel for plugin blocks → theme token editor → undo/redo off the version table.

**Phase 4 — AI (4–6 weeks)**
Registry serialized into Gemini prompts → sitemap/design/content agents → schema output validated against Zod → retry loop on validation failure → Co-Pilot for React nodes.

**Phase 5 — hardening**
`iframe` strategy → Gutenberg exporter → per-site block allowlists → agency template library.

---

## 10. The Three Things That Will Bite You

**1. CSS collisions between plugin styles and your token system.**
Plugin CSS is written for a full WP theme context and will fight your tokens. Fix: wrap every Gutenberg node in a scoping container and load plugin CSS inside a `@layer plugins` that sits below your `@layer theme`. Cascade layers solve this cleanly — use them from day one, retrofitting is painful.

**2. jQuery-era plugins that hard-bind on `document.ready`.**
They fire before your island mounts, find nothing, and silently do nothing. The `yourplatform:rehydrate` event in §4B is the workaround, but some plugins won't listen. Those get classified `iframe`. Accept it early rather than fighting each one.

**3. Compile latency at scale.**
A theme token change triggers a recompile of every page on the site. An agency with 200 client sites changing a shared template is a thundering herd. Fix: token changes only recompile CSS (cheap, no JS rebuild), and queue with per-site rate limiting. Design this in now — it's very hard to add later.
