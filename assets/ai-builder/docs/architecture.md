# AI WordPress Builder — Full Technical Architecture
**For: Large SaaS Platform | Target Users: Agencies & SMBs**

---

## 1. System Overview

Your builder is a **multi-tenant SaaS platform** that takes a user's business description and outputs a fully hosted, editable WordPress site — with an AI pipeline driving generation and a custom drag-and-drop editor for refinement.

```
User Input (business description)
        ↓
  AI Orchestration Layer  (multi-agent pipeline)
        ↓
  WordPress Generation Layer  (WP provisioning + content injection)
        ↓
  Frontend Editor  (drag-and-drop, AI Co-Pilot)
        ↓
  Multi-Tenant Hosting Infrastructure  (isolated WP installs per site)
        ↓
  Agency Dashboard / SMB Self-Serve Portal
```

---

## 2. Core Architecture Pillars

### Pillar 1 — AI Orchestration Layer

This is the brain. A multi-agent pipeline where each agent owns one domain and passes structured output (not raw text) to the next.

#### Agent Team

| Agent | Responsibility | Output |
|---|---|---|
| **Intent Agent** | Parse business type, goals, audience, brand voice | Structured brief JSON |
| **Sitemap Agent** | Propose pages, navigation, user journeys | Sitemap + page briefs |
| **Design Agent** | Generate design system (fonts, colors, spacing, layout rules) | Design tokens JSON |
| **Content Agent** | Write page copy, CTAs, meta descriptions, blog posts | Content JSON per page |
| **Image Agent** | Generate or curate hero images, section visuals, icons | Image asset list |
| **WordPress Agent** | Translate design + content into WP theme + page structure | WP config + page JSON |
| **SEO Agent** | Schema markup, keyword mapping, Core Web Vitals config | SEO config JSON |
| **WooCommerce Agent** | (SMB e-commerce) Product setup, checkout, payment config | WooCommerce JSON |
| **QA Agent** | Validate output — mobile, accessibility, page speed | QA report + fixes |

#### Orchestration Framework

```
LangGraph (recommended) or custom orchestrator
  - Each agent = a graph node
  - Structured output enforced via Pydantic/JSON Schema
  - State machine: each agent reads prior agent's validated output
  - Retry logic per agent (max 3 attempts before fallback)
  - Parallel execution where possible (Content + Image agents run together)
```

#### LLM Strategy

```
Primary Generation:   OpenAI GPT-4o or Anthropic Claude Sonnet (structured output)
Fast/Cheap Tasks:     GPT-4o-mini or Claude Haiku (metadata, SEO tags, short copy)
Image Generation:     DALL-E 3 or Flux (via Replicate API) or stock via Unsplash API
Embeddings:           text-embedding-3-small (for template similarity, content reuse)
```

#### Prompt Engineering Approach

- Each agent has a **system prompt** defining its role and output schema
- Business brief passed as structured context to all agents (not re-described each time)
- Use **few-shot examples** per vertical (restaurant, law firm, real estate, etc.)
- Output enforced as **JSON Schema** — no freeform text between agents
- Store prompt versions in a **Prompt Registry** (database table) for A/B testing and rollback

---

### Pillar 2 — WordPress Generation Layer

This is how the AI output becomes a real WordPress site.

#### WordPress Provisioning

```
Each new site = isolated WordPress install
  ├── Provisioned via WP-CLI (command line automation)
  ├── One database per site (MySQL/MariaDB, isolated)
  ├── Runs in containerized environment (Docker/Kubernetes pod)
  └── Automated by a Site Provisioning Service (internal microservice)
```

#### Site Provisioning Service (internal microservice)

```python
# Responsibilities:
- Receive site creation request (from AI pipeline)
- Spin up WP install via WP-CLI
- Install required plugins (programmatically)
- Import theme + design tokens
- Inject generated pages via WP REST API
- Configure permalink structure, SEO, caching
- Return site URL + admin credentials to platform
```

#### Theme Architecture

Build a **base theme** that your AI controls via design tokens:

```
your-platform-theme/
├── style.css           ← base styles
├── theme.json          ← Gutenberg/FSE design tokens (AI fills this)
├── functions.php
├── block-patterns/     ← reusable section patterns (AI selects + fills)
│    ├── hero-1.php
│    ├── hero-2.php
│    ├── services-grid.php
│    ├── testimonials.php
│    └── ... (100+ patterns)
└── templates/          ← full page templates
     ├── home.html
     ├── about.html
     └── contact.html
```

The AI's Design Agent outputs a `theme.json` override that injects brand colors, fonts, and spacing — every block inherits these automatically.

#### Page Injection

Use **WordPress REST API** or **WP-CLI** to create pages:

```bash
# Via WP-CLI (fast, server-side)
wp post create --post_title="Home" --post_content="[block JSON here]" --post_status=publish

# Via WP REST API (for remote provisioning)
POST /wp-json/wp/v2/pages
{ "title": "Home", "content": "[block JSON]", "status": "publish" }
```

Pages are built from **Gutenberg block JSON** — the AI outputs structured block definitions, not raw HTML.

#### Plugin Stack (pre-installed on every site)

| Plugin | Purpose |
|---|---|
| Your Custom Editor Plugin | Bridge between your frontend editor and WP |
| Yoast SEO or RankMath | SEO (pre-configured by SEO Agent) |
| WP Rocket or LiteSpeed Cache | Performance |
| WooCommerce | E-commerce (activated for SMB commerce sites) |
| Wordfence | Security |
| UpdraftPlus | Backups |
| Custom AI Co-Pilot Plugin | In-editor AI assistance (your own plugin) |

---

### Pillar 3 — Frontend Editor

This is what your users see and interact with. Two modes: **Agency Mode** (power user) and **SMB Mode** (simplified).

#### Editor Architecture

```
Frontend Stack:
  ├── React (editor UI)
  ├── TypeScript
  ├── Tailwind CSS
  ├── Zustand or Redux (editor state management)
  └── Iframe bridge to live WordPress preview

Editor Core Components:
  ├── Canvas (iframe showing live WP site)
  ├── Left Panel: Page/Section navigator
  ├── Right Panel: Element properties + style controls
  ├── Top Bar: Page selector, device preview, undo/redo, publish
  ├── AI Co-Pilot Sidebar: Chat interface for AI edits
  └── Block Library: Drag-and-drop section/widget panel
```

#### Iframe Bridge (Critical Architecture Decision)

Your editor wraps the live WP site in an iframe and communicates via `postMessage`:

```javascript
// Editor → WP site: update a block
iframe.contentWindow.postMessage({
  type: 'UPDATE_BLOCK',
  blockId: 'hero-1',
  attributes: { heading: 'New Title', backgroundColor: '#FF5733' }
}, '*')

// WP site → Editor: selection event
window.parent.postMessage({
  type: 'BLOCK_SELECTED',
  blockId: 'hero-1',
  rect: { top: 120, left: 0, width: 1200, height: 600 }
}, '*')
```

Your custom WordPress plugin handles the WP side of this bridge.

#### AI Co-Pilot (In-Editor)

```
User types: "Make the hero section more professional and add a CTA button"
  ↓
Co-Pilot Agent reads current page block JSON
  ↓
Sends to LLM with context (business type, brand voice, current blocks)
  ↓
Returns updated block JSON diff
  ↓
Editor applies changes live in iframe
  ↓
User accepts or reverts
```

#### Agency vs SMB Mode

| Feature | Agency Mode | SMB Mode |
|---|---|---|
| Block-level editing | Full | Simplified (sections only) |
| CSS/code access | Yes | No |
| Multi-page management | Full | Guided |
| Client workspace | Yes | No |
| White-labeling | Yes | No |
| AI Co-Pilot | Advanced | Simplified chat |
| Template override | Full | Preset options |

---

### Pillar 4 — Multi-Tenant Hosting Infrastructure

Every site gets an isolated WordPress environment.

#### Infrastructure Stack

```
Cloud Provider: AWS or GCP (your choice)

Compute:
  ├── Kubernetes (EKS/GKE) — orchestrates WP containers
  ├── Each WP site = Kubernetes pod (PHP-FPM + Nginx)
  ├── Horizontal autoscaling per site (handle traffic spikes)
  └── Spot instances for dev/staging environments (cost saving)

Database:
  ├── Amazon RDS (MySQL) — one DB per site, multi-tenant cluster
  ├── ProxySQL for connection pooling
  └── Automated daily snapshots

Storage:
  ├── AWS S3 or GCS — media uploads per site (mapped via WP offload media)
  ├── CDN: Cloudflare or AWS CloudFront
  └── Persistent volumes for WP file system

Networking:
  ├── Each site: subdomain on your platform (site123.yourplatform.com)
  ├── Custom domain: DNS CNAME pointing to your platform
  ├── SSL: Let's Encrypt via cert-manager (auto-renewed)
  └── DDoS protection via Cloudflare

Caching:
  ├── Redis (object caching per site)
  ├── Nginx FastCGI page caching
  └── Cloudflare edge caching (static assets)
```

#### Site Isolation Model

```
Namespace per customer (Kubernetes):
  customer-001/
    ├── wp-site-a (pod)
    ├── wp-site-b (pod)
    └── shared Redis (namespace-scoped)

  customer-002/
    ├── wp-site-c (pod)
    └── ...
```

#### Provisioning Flow (End-to-End)

```
1. User submits business description
2. Platform API creates site record (status: provisioning)
3. Site Provisioning Service spins up K8s pod
4. WP-CLI installs WordPress + base plugins
5. AI Pipeline runs (2-5 min) → returns theme.json + page block JSON
6. Provisioning service injects AI output via WP REST API
7. Status updated to: ready
8. User redirected to editor with live site
Total time target: under 5 minutes
```

---

### Pillar 5 — Platform Services (Backend)

#### Microservices Architecture

```
API Gateway (Kong or AWS API Gateway)
  ├── Auth Service          — JWT + OAuth, team/role management
  ├── Site Service          — CRUD for sites, metadata, status
  ├── Provisioning Service  — WP install automation
  ├── AI Pipeline Service   — orchestrates agent pipeline
  ├── Editor Service        — saves/loads editor state, block snapshots
  ├── Domain Service        — custom domain + DNS + SSL management
  ├── Billing Service       — Stripe integration, plan limits
  ├── Analytics Service     — site performance, usage metrics
  └── Notification Service  — webhooks, email, in-app alerts
```

#### Backend Tech Stack

```
API Framework:    Node.js (NestJS) or Python (FastAPI) — FastAPI preferred for AI services
Database:         PostgreSQL (platform data) + MySQL (per-site WordPress DBs)
Cache:            Redis
Queue:            BullMQ (Node) or Celery (Python) — for async AI pipeline jobs
Search:           Elasticsearch or Meilisearch (template/content search)
Auth:             Clerk or Auth0, or custom JWT
Storage:          S3-compatible (AWS S3 or MinIO self-hosted)
Monitoring:       Datadog or Grafana + Prometheus
Logging:          ELK Stack or Datadog Logs
```

---

### Pillar 6 — Agency Dashboard

Agencies manage multiple clients from one place.

#### Features

```
Agency Dashboard:
  ├── Client workspace management (create/invite/remove clients)
  ├── Site portfolio view (all client sites, status, last edited)
  ├── White-label settings (custom logo, colors, domain for editor)
  ├── Template library (agency's own saved templates)
  ├── Bulk operations (update plugins across all sites)
  ├── Staging → Live push per site
  ├── Client access controls (what clients can/cannot edit)
  ├── Reporting (PageSpeed scores, uptime, SEO metrics per site)
  └── Reseller billing (agencies bill their clients, you bill the agency)
```

---

### Pillar 7 — SMB Self-Serve Portal

Simpler, guided experience for non-technical users.

#### SMB Onboarding Flow

```
Step 1: "Tell us about your business" (name, type, description, location)
Step 2: Pick a style preference (3-5 visual directions shown)
Step 3: AI generates site (progress screen: "Building your site...")
Step 4: Review generated site → "Looks great" or "Change something"
Step 5: Connect domain or use free subdomain
Step 6: Publish
```

---

## 3. Full Tech Stack Summary

| Layer | Technology |
|---|---|
| **AI Orchestration** | LangGraph + Python |
| **LLMs** | GPT-4o, Claude Sonnet, Haiku (multi-model) |
| **Image Generation** | DALL-E 3 / Flux via Replicate |
| **Backend API** | FastAPI (AI services) + NestJS (platform services) |
| **Frontend Editor** | React + TypeScript + Tailwind |
| **State Management** | Zustand |
| **WordPress Layer** | WP-CLI + WP REST API + Custom Gutenberg Theme |
| **Database (platform)** | PostgreSQL |
| **Database (per-site WP)** | MySQL / MariaDB |
| **Cache** | Redis |
| **Queue** | Celery (Python) / BullMQ (Node) |
| **Containers** | Docker + Kubernetes (EKS/GKE) |
| **Cloud** | AWS or GCP |
| **CDN** | Cloudflare |
| **Storage** | AWS S3 |
| **SSL** | Let's Encrypt + cert-manager |
| **Monitoring** | Grafana + Prometheus + Datadog |
| **Auth** | JWT + OAuth (Clerk or custom) |
| **Payments** | Stripe |
| **CI/CD** | GitHub Actions + ArgoCD |

---

## 4. Phased Development Roadmap

### Phase 1 — Foundation (Months 1–3)
- [ ] Multi-tenant WordPress provisioning service (WP-CLI automation)
- [ ] Base WordPress theme with design token system (theme.json)
- [ ] 50+ Gutenberg block patterns library
- [ ] Basic AI pipeline: Intent → Sitemap → Content → WordPress injection
- [ ] Simple frontend editor (iframe + basic property editing)
- [ ] Auth, billing, site management backend
- [ ] Subdomain provisioning + SSL automation
- **Goal:** User can describe a business → get a live WP site in <5 min

### Phase 2 — Editor & AI Co-Pilot (Months 3–6)
- [ ] Full drag-and-drop editor (block reorder, add/remove sections)
- [ ] AI Co-Pilot (in-editor chat for content/design changes)
- [ ] Design Agent (brand colors, fonts, full design system)
- [ ] Image generation pipeline (DALL-E / Flux integration)
- [ ] Mobile preview + responsive controls
- [ ] Undo/redo history
- [ ] Staging environment per site
- **Goal:** Editor is polished enough for agency use

### Phase 3 — Agency Features (Months 6–9)
- [ ] Agency dashboard (client workspaces, portfolio view)
- [ ] White-label editor (custom branding per agency)
- [ ] Template library (save/share/sell templates)
- [ ] Bulk site management
- [ ] Client permission controls
- [ ] Staging → Live push workflow
- [ ] Reseller billing model
- **Goal:** Agencies can run their whole client operation on your platform

### Phase 4 — SMB & E-Commerce (Months 9–12)
- [ ] Simplified SMB onboarding flow
- [ ] WooCommerce AI setup (product pages, checkout, Stripe)
- [ ] SEO dashboard (per-site audit, keyword suggestions)
- [ ] Site analytics (GA4 integration, built-in dashboard)
- [ ] Blog/content AI generator
- [ ] Custom domain management UI
- **Goal:** SMBs can self-serve from zero to live store

### Phase 5 — Scale & Intelligence (Months 12–18)
- [ ] Vertical-specific AI templates (restaurants, lawyers, real estate, etc.)
- [ ] AI personalization (site updates based on performance data)
- [ ] A/B testing for generated content
- [ ] Multilingual site generation
- [ ] Marketplace (third-party templates, plugins, add-ons)
- [ ] Advanced analytics + conversion tracking
- **Goal:** Platform is industry-differentiated, not just feature-parity

---

## 5. Team Structure Recommendation

| Team | Size | Focus |
|---|---|---|
| AI/ML Engineers | 3–4 | Agent pipeline, prompt engineering, LLM integration |
| Backend Engineers | 4–5 | Platform services, provisioning, APIs |
| WordPress Engineers | 2–3 | Theme, plugins, WP-CLI automation, Gutenberg blocks |
| Frontend Engineers | 3–4 | Editor, dashboards, SMB portal |
| DevOps/Infrastructure | 2–3 | Kubernetes, provisioning, CDN, monitoring |
| Product + Design | 2–3 | UX, agency/SMB flows, design system |

**Total: ~16–22 engineers** for a serious v1 in 12 months

---

## 6. Key Differentiators to Build In (vs 10Web)

| Gap in 10Web | Your Opportunity |
|---|---|
| Template sameness | Vertical-specific AI that generates truly unique layouts |
| Manual post-gen editing | Conversational AI Co-Pilot that refines the site through chat |
| Hidden ecommerce costs | Native WooCommerce AI setup included in base plan |
| Support gaps | Automated health monitoring + proactive site issue alerts |
| No agency reseller model | Built-in white-label + reseller billing from day one |
| No performance loop | AI that suggests improvements based on real traffic data |

---

*Document Version: 1.0 | Architecture for internal planning use*
