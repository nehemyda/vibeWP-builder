/**
 * Demo data matching the original mockups (Northbound Digital, PIPEPRO
 * Plumbing, etc.) so the dashboards read from real Postgres rows instead of
 * hardcoded arrays.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * DATABASE_URL in .env.local — run with: npx tsx lib/db/seed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db } from "./index";
import { profiles, agencies, sites, sitePages, leads } from "./schema";
import { generatePartnerId, generateSmbId } from "../ids";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Idempotent: safe to re-run after a partial failure (e.g. a dropped DB connection). */
async function createDemoUser(email: string, fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "demo-password-123",
    email_confirm: true,
  });

  let userId: string;
  if (error) {
    if (error.code !== "email_exists") throw error;
    const { data: list, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email === email);
    if (!existing) throw new Error(`${email} reported as existing but not found in listUsers()`);
    userId = existing.id;
  } else {
    userId = data.user.id;
  }

  await db
    .insert(profiles)
    .values({ id: userId, fullName, role: "smb_owner" }) // role overwritten per-caller below
    .onConflictDoNothing();

  return userId;
}

function heroSchema(opts: {
  eyebrow: string;
  heading: string;
  body: string;
  primaryLabel: string;
  outlineLabel: string;
}) {
  return {
    schemaVersion: "1.0",
    nodes: [
      {
        id: "n_hero",
        kind: "react",
        type: "HeroSplit",
        props: {
          eyebrow: opts.eyebrow,
          heading: opts.heading,
          body: opts.body,
          actions: [
            { label: opts.primaryLabel, href: "#", variant: "primary" },
            { label: opts.outlineLabel, href: "#", variant: "outline" },
          ],
        },
      },
    ],
  };
}

async function main() {
  console.log("Seeding demo data…");

  // Super admin
  const adminId = await createDemoUser("admin@vibewp.dev", "Nehemiah C.");
  await db
    .update(profiles)
    .set({ role: "super_admin" })
    .where(eq(profiles.id, adminId));

  // Agency owner — Northbound Digital
  const agencyOwnerId = await createDemoUser(
    "owner@northbound.dev",
    "Nehemiah C.",
  );
  await db
    .update(profiles)
    .set({ role: "agency_owner" })
    .where(eq(profiles.id, agencyOwnerId));

  let agency = await db.query.agencies.findFirst({
    where: eq(agencies.ownerUserId, agencyOwnerId),
  });
  if (!agency) {
    [agency] = await db
      .insert(agencies)
      .values({
        partnerId: await generatePartnerId(),
        name: "Northbound Digital",
        plan: "Scale",
        ownerUserId: agencyOwnerId,
      })
      .returning();
  }

  const agencyClientSites = [
    {
      name: "PIPEPRO Plumbing",
      domain: "pipepro.com",
      status: "live" as const,
      hero: heroSchema({
        eyebrow: "24/7 LIVE DISPATCH ACTIVE IN SPRINGFIELD",
        heading: "Rapid Emergency Repairs & Precision Plumbing Installation",
        body: "Licensed master technicians with transparent upfront pricing and guaranteed code compliance.",
        primaryLabel: "Call (555) 123-4567",
        outlineLabel: "Request Inspection Quote",
      }),
    },
    {
      name: "Caldwell & Rose Law",
      domain: "caldwellrose.com",
      status: "live" as const,
      hero: heroSchema({
        eyebrow: "FREE CASE EVALUATION",
        heading: "Trial-Tested Litigation Counsel for Serious Injury Claims",
        body: "Decades of courtroom experience representing plaintiffs against insurers who don't want to pay.",
        primaryLabel: "Call (555) 987-6543",
        outlineLabel: "Request Case Review",
      }),
    },
    {
      name: "Northgate Dental",
      domain: "northgatedental.com",
      status: "draft" as const,
      hero: heroSchema({
        eyebrow: "NEW PATIENTS WELCOME",
        heading: "Friendly, Modern Dental Care for the Whole Family",
        body: "Same-week appointments, gentle hygienists, and painless checkups your kids won't dread.",
        primaryLabel: "Book an Appointment",
        outlineLabel: "View Services",
      }),
    },
    {
      name: "Riverside Auto Detail",
      domain: "riversideautodetail.com",
      status: "live" as const,
      hero: heroSchema({
        eyebrow: "MOBILE DETAILING AVAILABLE",
        heading: "Showroom-Quality Detailing, At Your Driveway",
        body: "Ceramic coating, paint correction, and interior deep-cleans booked in under two minutes.",
        primaryLabel: "Get a Quote",
        outlineLabel: "See Packages",
      }),
    },
    {
      name: "Maple & Co. Bakery",
      domain: null,
      status: "draft" as const,
      hero: heroSchema({
        eyebrow: "FRESH DAILY, ZERO PRESERVATIVES",
        heading: "Small-Batch Bread and Pastries Baked Before Sunrise",
        body: "Order ahead for pickup, or stop by the counter — we sell out most afternoons.",
        primaryLabel: "Order Ahead",
        outlineLabel: "View Menu",
      }),
    },
  ];

  let pipeproSiteId = "";
  for (const s of agencyClientSites) {
    let site = await db.query.sites.findFirst({
      where: (t, { eq, and }) => and(eq(t.agencyId, agency.id), eq(t.name, s.name)),
    });
    if (!site) {
      [site] = await db
        .insert(sites)
        .values({
          smbId: await generateSmbId(),
          ownerType: "agency",
          agencyId: agency.id,
          ownerUserId: agencyOwnerId,
          name: s.name,
          domain: s.domain,
          status: s.status,
          plan: "Scale",
        })
        .returning();
      await db
        .insert(sitePages)
        .values({ siteId: site.id, slug: "home", schemaJson: s.hero });
    }
    if (s.name === "PIPEPRO Plumbing") pipeproSiteId = site.id;
  }

  // SMB owner — Jordan Lee, runs PIPEPRO Plumbing directly (illustrates the
  // smb_owner path even though this particular site is agency-managed above)
  const smbOwnerId = await createDemoUser("jordan@pipepro.dev", "Jordan Lee");
  await db
    .update(profiles)
    .set({ role: "smb_owner" })
    .where(eq(profiles.id, smbOwnerId));

  let smbSite = await db.query.sites.findFirst({
    where: eq(sites.ownerUserId, smbOwnerId),
  });
  if (!smbSite) {
    [smbSite] = await db
      .insert(sites)
      .values({
        smbId: await generateSmbId(),
        ownerType: "smb",
        ownerUserId: smbOwnerId,
        name: "PIPEPRO Plumbing",
        domain: "pipepro.com",
        status: "live",
        plan: "Growth",
      })
      .returning();
    await db.insert(sitePages).values({
      siteId: smbSite.id,
      slug: "home",
      schemaJson: agencyClientSites[0].hero,
    });
    await db.insert(leads).values([
      {
        siteId: smbSite.id,
        name: "Alicia Ferns",
        message: "Need an emergency drain inspection…",
      },
      {
        siteId: smbSite.id,
        name: "Marcus Boyd",
        message: "Quote request for water heater install",
      },
      {
        siteId: smbSite.id,
        name: "Dana Whitfield",
        message: "Following up on last week's estimate",
      },
    ]);
  }

  void pipeproSiteId;
  console.log("Seed complete.");
  console.log("Demo logins (password: demo-password-123):");
  console.log("  super_admin  → admin@vibewp.dev");
  console.log("  agency_owner → owner@northbound.dev");
  console.log("  smb_owner    → jordan@pipepro.dev");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
