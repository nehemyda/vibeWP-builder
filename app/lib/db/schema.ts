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
  plan: text("plan").notNull().default("starter"),
  /**
   * What this specific client is billed per month, overriding whatever the
   * agency's plan price list says. Null = no override, fall back to the
   * agency price list, then the platform list price. See lib/billing.ts.
   */
  customPriceMonthlyCents: integer("custom_price_monthly_cents"),
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
export const pageRevisions = pgTable("page_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => sitePages.id),
  schemaJson: jsonb("schema_json").notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
