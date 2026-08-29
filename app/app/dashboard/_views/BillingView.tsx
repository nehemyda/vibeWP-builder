import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { loadPricingContext, formatCents } from "@/lib/billing";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "../nav";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div className={shell.fieldLabel}>{label}</div>
      <div style={{ marginTop: "0.2rem" }}>{value}</div>
    </div>
  );
}

export async function BillingView({
  profile,
  role,
  site,
  paths,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
}) {
  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title="Billing"
        subtitle="You don't have a site yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Start building your site from the landing page first.
        </div>
      </DashboardShell>
    );
  }

  const agency = site.agencyId
    ? await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) })
    : null;

  // Priced through the agency that manages this site, so the client sees
  // their agency's rate rather than the platform list price.
  const pricing = await loadPricingContext(site.agencyId);
  const price = pricing.resolve(site);
  const plan = price.plan;
  const billedBy = agency?.name ?? "VibeWP";

  return (
    <DashboardShell
      navGroups={smbNav(paths, Boolean(site.intakeCompletedAt))}
      activeHref={paths.billingPath}
      userName={profile.fullName}
      userRole={site.name}
      title="Billing"
      subtitle={`${site.name} · billed by ${billedBy}`}
    >
      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Monthly price</div>
          <div className={shell.value}>{formatCents(price.cents)}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Plan</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {plan?.name ?? site.plan}
          </div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Billed by</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {billedBy}
          </div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Status</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {site.status === "trial" ? "Trial" : "Active"}
          </div>
        </div>
      </div>

      <div className={shell.twoCol}>
        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1.2rem", fontSize: "1rem" }}>Your subscription</h2>
          <DetailRow label="Plan" value={plan?.name ?? site.plan} />
          <DetailRow label="Monthly price" value={formatCents(price.cents)} />
          <DetailRow
            label="SMB ID"
            value={
              <CopyableText value={site.smbId ?? ""}>
                <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
              </CopyableText>
            }
          />
          {agency && (
            <DetailRow
              label="Partner ID"
              value={
                <CopyableText value={agency.partnerId ?? ""}>
                  <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
                </CopyableText>
              }
            />
          )}
          <DetailRow label="Customer since" value={site.createdAt.toLocaleDateString()} />
          <p className={shell.rowSub} style={{ marginTop: "1.2rem", marginBottom: 0 }}>
            {agency
              ? `${agency.name} manages this site and sets your pricing — contact them to change plans.`
              : "Plan changes aren't self-serve yet — contact support."}
          </p>
        </div>

        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1.2rem", fontSize: "1rem" }}>What&apos;s included</h2>
          {plan ? (
            <>
              <DetailRow
                label="Limits"
                value={`${plan.siteLimit ? `${plan.siteLimit} sites` : "Unlimited sites"} · ${
                  plan.seatLimit ? `${plan.seatLimit} seats` : "Unlimited seats"
                }`}
              />
              {plan.features.length > 0 ? (
                <>
                  <div className={shell.fieldLabel}>Features</div>
                  <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ fontSize: "0.87rem", marginBottom: "0.25rem" }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={shell.rowSub}>No feature list on file for this plan.</p>
              )}
            </>
          ) : (
            <p className={shell.rowSub}>No plan details on file.</p>
          )}
        </div>
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", marginTop: "1.2rem" }}>
        <p className={shell.rowSub} style={{ margin: 0 }}>
          This is a record of what you&apos;re billed — VibeWP doesn&apos;t collect payment or issue
          invoices yet.
        </p>
      </div>
    </DashboardShell>
  );
}
