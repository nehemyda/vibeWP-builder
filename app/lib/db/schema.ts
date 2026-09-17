import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "super_admin",
  "agency_owner",
  "agency_member",
  "smb_owner",
  "smb_member",
]);

export const siteOwnerTypeEnum = pgEnum("site_owner_type", ["agency", "smb"]);
export const siteStatusEnum = pgEnum("site_status", [
  "draft",
  "live",
  "trial",
]);

/**
 * How a site is delivered.
 *
 * "vibe"      — served by this platform. No WordPress exists for it.
 * "wordpress" — provisioned into a real WordPress the client owns.
 *
 * Separate from `plan` because it is a product choice, not a price tier: it
 * decides which machinery a site uses, and the plan decides whether that
 * machinery is paid for. Separate from `status` because a site in either mode
 * can be draft or live.
 */
export const siteModeEnum = pgEnum("site_mode", ["vibe", "wordpress"]);

export type SiteMode = (typeof siteModeEnum.enumValues)[number];

/** active = normal. suspended = temporarily locked out, recoverable. archived = read-only, recoverable. deleted = soft-deleted, hidden everywhere, recoverable. */
export const agencyStatusEnum = pgEnum("agency_status", [
  "active",
  "suspended",
  "archived",
  "deleted",
]);

export const businessProfileOwnerTypeEnum = pgEnum(
  "business_profile_owner_type",
  ["agency", "site"],
);

/** Mirrors auth.users — one row per signed-up user. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // == auth.users.id
  fullName: text("full_name").notNull(),
  role: roleEnum("role").notNull().default("smb_owner"),
  /** Deactivated accounts keep their row (and their auth login is banned) but lose access. */
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Partner ID — 4-char alphanumeric partner code (e.g. "BRDL", "TG83"). */
  partnerId: text("partner_id").unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => profiles.id),
  status: agencyStatusEnum("status").notNull().default("active"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agencyMembers = pgTable("agency_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  agencyId: uuid("agency_id")
    .notNull()
    .references(() => agencies.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id),
  role: text("role").notNull().default("member"),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** SMB ID — "AG-" + 10-char alphanumeric client code (e.g. "AG-QV4RNHSF2T"). */
  smbId: text("smb_id").unique(),
  ownerType: siteOwnerTypeEnum("owner_type").notNull(),
  agencyId: uuid("agency_id").references(() => agencies.id),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  domain: text("domain"),
  status: siteStatusEnum("status").notNull().default("draft"),
  /**
   * Vibe, or Vibe WordPress — chosen when the site is created.
   *
   * Defaults to "vibe": a site with no WordPress behind it is the honest
   * description of every site before it is exported, and making the paid
   * mode the thing someone opts into keeps the charge deliberate.
   */
  mode: siteModeEnum("mode").notNull().default("vibe"),
  /**
   * Where a Vibe site is served: <subdomain>.<VIBEWP_SITES_HOST>.
   *
   * Assigned at publish rather than at creation, so an abandoned draft never
   * squats on the name a real business wants. Unique across the platform
   * because it IS the address — two sites answering one host would serve
   * whichever the query happened to return first.
   */
  vibeSubdomain: text("vibe_subdomain").unique(),
  plan: text("plan").notNull().default("starter"),
  /**
   * What this specific client is billed per month, overriding whatever the
   * agency's plan price list says. Null = no override, fall back to the
   * agency price list, then the platform list price. See lib/billing.ts.
   */
  customPriceMonthlyCents: integer("custom_price_monthly_cents"),
  /**
   * The site's header and footer, one section node each.
   *
   * Site-wide rather than per page, because that is what a template part is:
   * every template pulls parts/header.html in, so one header serves every page
   * and editing it is a single edit. Null until the first generation chooses
   * one, at which point export writes them into the theme.
   */
  headerSchemaJson: jsonb("header_schema_json"),
  footerSchemaJson: jsonb("footer_schema_json"),
  /**
   * Brand palette. The key records which preset was chosen; the colours are
   * stored resolved, so editing a preset later never silently restyles a site
   * that was already built and signed off.
   */
  brandPaletteKey: text("brand_palette_key"),
  brandColors: jsonb("brand_colors"),
  /**
   * Design values the client set by hand — heading scale, spacing, radius.
   *
   * Multipliers rather than sizes, so they compose with each section's own
   * design instead of flattening 62 of them onto one value. Absent means "as
   * designed", which is why an at-default control stores nothing: pinning
   * today's default would freeze a site against a stylesheet that may improve.
   * Sanitised on the way in and again on the way out — see lib/design/tokens.ts.
   */
  designTokens: jsonb("design_tokens"),
  /** Set when the intake form is first submitted — drives Build vs Edit. */
  intakeCompletedAt: timestamp("intake_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Soft delete — hidden from listings when set, recoverable. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Page schema shaped like docs/hybrid-renderer.md so a real renderer can read it later. */
export const sitePages = pgTable("site_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  slug: text("slug").notNull().default("home"),
  /** Human label for the page; falls back to the slug when absent. */
  title: text("title"),
  schemaJson: jsonb("schema_json").notNull(),
  /** The WordPress post this page is bound to, once exported. */
  wpPostId: integer("wp_post_id"),
  /**
   * The schema both sides agreed on at the last successful sync — the common
   * ancestor for a three-way comparison.
   *
   * This is what distinguishes the four states. Diffing WordPress against
   * VibeWP alone can only say "they differ"; against a shared base it can say
   * WHICH side moved, and therefore whether pulling is safe or a genuine
   * conflict needs a human.
   *
   * A schema rather than a markup hash on purpose: WordPress re-serializes on
   * every editor save (escaping hyphens in block attributes, inserting blank
   * lines, leaving empty paragraphs), so byte comparison would report a
   * conflict on every page a client had merely opened. See lib/wp/serialize.ts.
   */
  syncedSchemaJson: jsonb("synced_schema_json"),
  /**
   * What search engines are told about this page. See migrate-batch27.ts.
   *
   * Null means nobody has written one; empty means someone cleared it. The
   * generator needs that difference to leave a deliberately blank field alone.
   */
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  noIndex: boolean("no_index").notNull().default(false),
  /**
   * The phrase this page is meant to be found by.
   *
   * An intention rather than a fact, which is why it is stored: two people can
   * reasonably target different phrases for one page, and the choice has to
   * survive the next regeneration. See migrate-batch29.ts.
   */
  focusKeyword: text("focus_keyword"),
  /** An override for WordPress's own canonical. Null means "core decides". */
  canonicalUrl: text("canonical_url"),
  /** When the model last wrote these, so a client's own words can be spared. */
  metaGeneratedAt: timestamp("meta_generated_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The builder chat transcript for a site.
 *
 * Kept per site rather than per page: the conversation covers the whole
 * build ("create a services page") and would be nonsense split up. Held in
 * the database rather than component state so reloading the builder does
 * not silently erase what was discussed.
 */
export const builderMessages = pgTable("builder_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  role: text("role").notNull(),
  text: text("text").notNull(),
  /** The generation step lines shown under an assistant message. */
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A snapshot of a page taken immediately BEFORE it is overwritten.
 *
 * Generation replaces a page's whole schema, so without this a single
 * mistaken prompt destroys work with no way back. Every write records what
 * was there first, which is what makes undo possible.
 */
/**
 * Undo/redo for the header and footer.
 *
 * Separate from pageRevisions because chrome belongs to the site, not a page —
 * page_revisions.page_id is NOT NULL and there is no page to point at. Header
 * and footer share one row so they are always restored as the pair the client
 * actually saw.
 */
export const siteRevisions = pgTable("site_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  headerSchemaJson: jsonb("header_schema_json"),
  footerSchemaJson: jsonb("footer_schema_json"),
  /** "undo" or "redo" — the same two stacks pageRevisions uses. */
  kind: text("kind").notNull(),
  reason: text("reason"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pageRevisions = pgTable("page_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => sitePages.id),
  schemaJson: jsonb("schema_json").notNull(),
  /**
   * Which stack this snapshot belongs to.
   *
   * This is what makes undo a real stack rather than a toggle. Previously
   * every row was undifferentiated and undo restored the newest row, so after
   * one undo the newest row WAS the state you had just left — a second undo
   * returned to it and older states became unreachable.
   *
   *   save: push current onto 'undo', and discard the whole 'redo' stack,
   *         because editing forks history and the old redo branch is dead.
   *   undo: newest 'undo' row becomes current; the outgoing current moves to 'redo'.
   *   redo: newest 'redo' row becomes current; the outgoing current moves to 'undo'.
   */
  kind: text("kind").notNull().default("undo"),
  /** What caused the change, e.g. the prompt text — so history is legible. */
  reason: text("reason"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const installationStatusEnum = pgEnum("installation_status", [
  "provisioning",
  "ready",
  "failed",
]);

/**
 * Where a site's actual WordPress lives.
 *
 * One row per site, created the first time someone exports. Its absence is
 * what tells the export action to provision rather than update — that is the
 * whole "first time installs, returning visit updates" rule.
 *
 * `driver` records which backend produced it, so local installs and a future
 * hosted one can coexist without the rest of the app caring.
 */
/**
 * The site's own image library.
 *
 * Files live in Supabase Storage; this is everything about them that a
 * filename cannot hold — alt text, dimensions, provenance — and the only
 * thing that can be ordered, filtered or joined. See migrate-batch26.ts.
 */
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  alt: text("alt"),
  /** Shown on hover. Beside alt, not instead of it — see migrate-batch28.ts. */
  title: text("title"),
  /** "upload" | "stock" | "wordpress" — where the file came from. */
  source: text("source").notNull().default("upload"),
  photographer: text("photographer"),
  photographerUrl: text("photographer_url"),
  /** sha-256 of the bytes, so the same picture is not stored twice. */
  checksum: text("checksum"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Soft: a page may still reference the file, and a broken image is worse. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const siteInstallations = pgTable("site_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .unique()
    .references(() => sites.id),
  driver: text("driver").notNull().default("local"),
  status: installationStatusEnum("status").notNull().default("provisioning"),
  /** Filesystem path of the WordPress root (local driver only). */
  installPath: text("install_path"),
  /** Where the site is reachable, e.g. http://localhost:8801 */
  url: text("url"),
  port: integer("port"),
  dbName: text("db_name"),
  adminUser: text("admin_user"),
  /** Set when provisioning fails, so the UI can explain rather than hang. */
  lastError: text("last_error"),
  lastExportedAt: timestamp("last_exported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * History of a site changing hands.
 *
 * A site's SMB ID is permanent and identifies the client forever; which
 * agency manages it is not. `sites.agencyId` only ever holds the CURRENT
 * agency, so without this table a move would erase the record that it
 * happened. Both agency columns are nullable because a site can move from
 * an agency to being directly owned, or the reverse.
 */
export const siteTransfers = pgTable("site_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  fromAgencyId: uuid("from_agency_id").references(() => agencies.id),
  toAgencyId: uuid("to_agency_id").references(() => agencies.id),
  transferredByUserId: uuid("transferred_by_user_id").references(() => profiles.id),
  /**
   * What the client was being charged before the move. The move clears the
   * per-site override — it was the old agency's private deal — so the figure
   * is kept here rather than silently lost.
   */
  previousCustomPriceMonthlyCents: integer("previous_custom_price_monthly_cents"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Team members on an individual SMB site — mirrors agencyMembers, scoped to one site instead of one agency. */
export const siteMembers = pgTable("site_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id),
  role: text("role").notNull().default("member"),
});

export const aiProviderEnum = pgEnum("ai_provider", [
  "mock",
  "gemini",
  "openai",
  "claude",
]);

/** Singleton row (there's only ever one) holding the platform's active AI provider + keys. */
export const aiProviderSettings = pgTable("ai_provider_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  activeProvider: aiProviderEnum("active_provider").notNull().default("mock"),
  geminiApiKey: text("gemini_api_key"),
  openaiApiKey: text("openai_api_key"),
  claudeApiKey: text("claude_api_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Fixed catalogue of things a role can be granted the ability to do. */
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(), // e.g. "agencies.manage"
  label: text("label").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
});

/** Presence of a (role, permissionKey) row means that role is granted that permission. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: roleEnum("role").notNull(),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key),
  },
  (t) => [primaryKey({ columns: [t.role, t.permissionKey] })],
);

/**
 * A form's fields, as data.
 *
 * The drag-and-drop builder edits THIS, never markup — same reason sections
 * own their serializer: a definition can be validated, previewed, exported to
 * Gutenberg and parsed back, and free-form HTML can do none of those.
 */
export const formDefinitions = pgTable("form_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  name: text("name").notNull().default("Contact form"),
  /** Ordered field specs: type, label, name, required, width, options. */
  fields: jsonb("fields").notNull().default([]),
  /**
   * The id in the embed snippet. Public, and identity only — the endpoint
   * still validates every submission against this form's own fields.
   *
   * On the form rather than the site: one form may be embedded in several
   * places and must be revocable without disturbing the others.
   */
  embedToken: text("embed_token"),
  /** Styling as tokens (background, radius, accent…), never raw CSS. */
  style: jsonb("style").notNull().default({}),
  /** Turns submissions off without deleting the form or its leads. */
  isActive: boolean("is_active").notNull().default(true),
  notifyEmails: text("notify_emails"),
  successMessage: text("success_message"),
  redirectUrl: text("redirect_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One person who filled the form in.
 *
 * `formId` is nullable and set null on delete: a lead is someone who asked to
 * be contacted, and removing the form they used must never remove them.
 */
export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  formId: uuid("form_id").references(() => formDefinitions.id, { onDelete: "set null" }),
  /** Answers keyed by field name — arbitrary, so a new field needs no migration. */
  data: jsonb("data").notNull().default({}),
  /** Page, referrer, user agent, IP: context for judging a lead, and for spam. */
  meta: jsonb("meta").notNull().default({}),
  spamScore: integer("spam_score").notNull().default(0),
  /**
   * Where this enquiry has got to: new | contacted | qualified | won | lost.
   *
   * On the submission because it is a fact about this enquiry, not about the
   * form that produced it — and it must survive the form being deleted, which
   * form_id already does by going null.
   */
  status: text("status").notNull().default("new"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  /** What a won enquiry was worth, so a dashboard can total it. */
  valueCents: integer("value_cents"),
  readAt: timestamp("read_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What was done about a lead, and when.
 *
 * A table rather than a text column: "called, left voicemail" is only useful
 * with a date and a name on it, and two people working the same lead would
 * overwrite each other in one field.
 *
 * Cascades with the submission — a note about an enquiry that no longer exists
 * has nothing to describe.
 */
export const leadNotes = pgTable("lead_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => formSubmissions.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorUserId: uuid("author_user_id"),
  /** Kept as text so a note still says who wrote it after they leave. */
  authorName: text("author_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  name: text("name").notNull(),
  message: text("message").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Shared "Business details" block — one row per agency or site. Kept as its
 * own polymorphic table (rather than columns on `agencies` and `sites`) so
 * the same form/component covers both entity types without duplicating the
 * field list.
 */
export const businessProfiles = pgTable(
  "business_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: businessProfileOwnerTypeEnum("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    country: text("country"),
    websiteAddress: text("website_address"),
    businessCategories: text("business_categories"),
    tags: text("tags"),
    timezone: text("timezone"),
    phoneNumber: text("phone_number"),
    email: text("email"),
    /** Structured week: [{ day, open, close, closed }] — see lib/business/hours.ts. */
    openingHours: jsonb("opening_hours"),
    /** What the business does, in the owner's own words. */
    aboutText: text("about_text"),
    /** Authoritative service names: [{ name }]. Generation describes, never invents. */
    services: jsonb("services"),
    seoKeywords: text("seo_keywords"),
    /** The business logo as a data URL — see migrate-batch19.ts for why. */
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("business_profiles_owner_key").on(t.ownerType, t.ownerId)],
);

/** Append-only audit trail. Written by lib/activity.ts, never edited. */
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id"),
  actorName: text("actor_name").notNull(),
  /**
   * The real human behind the action, when it was taken while impersonating.
   *
   * Impersonation swaps the live Supabase session to the target user, so from
   * that moment auth.getUser() — and therefore actorUserId above — resolves to
   * the CLIENT. Without these two columns an admin could impersonate anyone,
   * change whatever they liked, and the log would credit it entirely to that
   * client. Null on ordinary actions; set automatically by logActivity().
   */
  impersonatorUserId: uuid("impersonator_user_id"),
  impersonatorName: text("impersonator_name"),
  /** Dot-namespaced, e.g. "agency.suspended", "user.deactivated", "auth.login". */
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  targetLabel: text("target_label"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Plan catalogue — configuration/reference data only, no payment processing. */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  /** JSON array of feature strings, editable as one-per-line in the admin UI. */
  features: jsonb("features").$type<string[]>().notNull().default([]),
  /**
   * Whether this plan may run a site in WordPress mode.
   *
   * Lives on the plan rather than being hardcoded so which tier sells
   * WordPress is editable at /admin/billing, like every other plan field.
   * The recurring charge is the plan's own price — there is no separate
   * WordPress fee to keep in step.
   */
  includesWordpress: boolean("includes_wordpress").notNull().default(false),
  siteLimit: integer("site_limit"),
  seatLimit: integer("seat_limit"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * An agency's own price list — what it resells each plan tier to its SMB
 * clients for, which is independent of what the agency pays the platform.
 * A missing row for a plan means "no markup set", so the platform list
 * price stands in. Keyed by plans.key (lowercase).
 */
export const agencyPlanPrices = pgTable(
  "agency_plan_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    planKey: text("plan_key").notNull(),
    priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("agency_plan_prices_agency_plan_key").on(t.agencyId, t.planKey)],
);

/** Reusable page-building blocks (e.g. "HeroSplit") — reference catalogue, managed only by super admins. */
export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  /** Matches a renderer component type, e.g. "HeroSplit". */
  componentType: text("component_type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * ─────────────────────────────────────────────────────────────────
   * This table OVERLAYS lib/sections/*, it does not define sections.
   *
   * Structure — fields, markup, parsing, CSS — lives in code, because it needs
   * review and a matching stylesheet. This row carries only what an admin
   * changes without a deploy. A row whose `key` has no registry entry is an
   * orphan: it can be shown, but nothing will render it.
   * ─────────────────────────────────────────────────────────────────
   */
  /** Replaces the section's built-in generation guidance. Null = use the code default. */
  aiPromptOverride: text("ai_prompt_override"),
  /** Thumbnail for the library grid; the detail view renders live instead. */
  previewImageUrl: text("preview_image_url"),
  /**
   * Plan slugs allowed to use this section. Empty = available on every plan,
   * which is the sane default for a brand-new section.
   */
  allowedPlans: jsonb("allowed_plans").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Singleton row (there's only ever one) holding the platform's outbound SMTP config. */
export const smtpSettings = pgTable("smtp_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  host: text("host"),
  port: integer("port").notNull().default(587),
  username: text("username"),
  password: text("password"),
  fromEmail: text("from_email"),
  fromName: text("from_name").notNull().default("VibeWP"),
  secure: boolean("secure").notNull().default(false),
  /**
   * Which level this row serves: "global", "agency" or "site".
   *
   * One table for all three so the resolution chain is a single query pattern
   * rather than three shapes that can disagree. Existing rows default to
   * global, which is what they have always been.
   */
  scope: text("scope").notNull().default("global"),
  agencyId: uuid("agency_id"),
  siteId: uuid("site_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Singleton row (there's only ever one) holding platform-wide settings. */
export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformName: text("platform_name").notNull().default("VibeWP"),
  supportEmail: text("support_email"),
  defaultTimezone: text("default_timezone").notNull().default("America/New_York"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  /**
   * What clients point their domain at. Null until an administrator sets them.
   *
   * Shown in the builder's site panel as the records to enter at a registrar,
   * so they must be the real targets for this platform's hosting — never a
   * placeholder, which would send a live domain to the wrong server.
   */
  hostingIpv4: text("hosting_ipv4"),
  hostingCname: text("hosting_cname"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
