import { redirect } from "next/navigation";
import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "../../nav";
import { loadPricingContext, formatCents, PRICE_SOURCE_LABEL } from "@/lib/billing";
import {
  updateAgencyPlanPricesAction,
  updateSitePriceOverrideAction,
} from "@/app/actions/billing-pricing";

const priceInputStyle = {
  width: 110,
  padding: "0.35rem 0.6rem",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: "0.82rem",
} as const;

function dollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export default async function AgencyBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { partnerId } = await params;
  const { profile, agency, role } = await requireAgency();
  const { saved } = await searchParams;

  if (!agency) {
    return (
      <DashboardShell
        navGroups={agencyNav("Your agency", null)}
        activeHref="/agency"
        userName={profile.fullName}
        userRole="Agency owner"
        title="Billing"
        subtitle="This account isn't linked to an agency yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Ask a super admin to link your account to an agency first.
        </div>
      </DashboardShell>
    );
  }

  const basePath = `/agency/${agency.partnerId}`;
  if (agency.partnerId !== partnerId) {
    redirect(`${basePath}/billing`);
  }

  const isOwner = role === "agency_owner";

  const [clientSites, pricing] = await Promise.all([
    db
      .select()
      .from(sites)
      .where(and(eq(sites.agencyId, agency.id), isNull(sites.deletedAt)))
      .orderBy(asc(sites.name)),
    loadPricingContext(agency.id),
  ]);

  const billed = clientSites.map((site) => ({ site, price: pricing.resolve(site) }));
  const clientMrrCents = billed.reduce((sum, b) => sum + b.price.cents, 0);
  const platformCostCents = pricing.platformPriceFor(agency.plan) ?? 0;
  const marginCents = clientMrrCents - platformCostCents;

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${basePath}/billing`}
      userName={profile.fullName}
      userRole="Agency owner"
      title="Billing"
      subtitle={
        <>
          What you pay VibeWP, and what you charge your clients · Partner{" "}
          <CopyableText value={agency.partnerId ?? ""}>
            <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
          </CopyableText>
        </>
      }
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Billed to clients</div>
          <div className={shell.value}>{formatCents(clientMrrCents)}</div>
          <div className={shell.rowSub}>per month across {billed.length} clients</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>You pay VibeWP</div>
          <div className={shell.value}>{formatCents(platformCostCents)}</div>
          <div className={shell.rowSub}>{agency.plan} plan</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Gross margin</div>
          <div className={shell.value} style={{ color: marginCents >= 0 ? "var(--good)" : "#b3261e" }}>
            {formatCents(marginCents)}
          </div>
          <div className={shell.rowSub}>per month, before your costs</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Clients</div>
          <div className={shell.value}>{billed.length}</div>
        </div>
      </div>

      <div className={shell.panel} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panelHead}>
          <h2>Your client price list</h2>
        </div>
        <div style={{ padding: "0 1.3rem 1.3rem" }}>
          <p className={shell.rowSub} style={{ marginTop: 0 }}>
            Set what you charge your own clients for each plan — it&apos;s independent of what VibeWP
            charges you, so the difference is your margin. Leave a field blank to just pass the
            platform price through.
          </p>
          <form action={updateAgencyPlanPricesAction}>
            <div className={shell.tableWrap}>
              <table className={shell.table}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>VibeWP charges you</th>
                    <th>You charge clients</th>
                    <th>Margin per client</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.plans.map((plan) => {
                    const yours = pricing.agencyPriceFor(plan.key);
                    const effective = yours ?? plan.priceMonthlyCents;
                    const perClientMargin = effective - plan.priceMonthlyCents;
                    return (
                      <tr key={plan.key}>
                        <td className={shell.rowName}>{plan.name}</td>
                        <td>{formatCents(plan.priceMonthlyCents)}</td>
                        <td>
                          {isOwner ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                              <span className={shell.rowSub}>$</span>
                              <input
                                name={`price_${plan.key}`}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={dollars(yours)}
                                placeholder={dollars(plan.priceMonthlyCents)}
                                style={priceInputStyle}
                              />
                            </span>
                          ) : (
                            formatCents(effective)
                          )}
                        </td>
                        <td
                          className={shell.rowSub}
                          style={{ color: perClientMargin > 0 ? "var(--good)" : undefined }}
                        >
                          {perClientMargin === 0 ? "—" : formatCents(perClientMargin)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isOwner && (
              <button
                type="submit"
                className={`${shell.btn} ${shell.btnPrimary}`}
                style={{ marginTop: "1rem" }}
              >
                Save price list
              </button>
            )}
          </form>
          {!isOwner && (
            <p className={shell.rowSub} style={{ marginTop: "1rem" }}>
              Only the agency owner can change pricing.
            </p>
          )}
        </div>
      </div>

      <div className={shell.panel} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panelHead}>
          <h2>Per-client pricing</h2>
        </div>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>SMB ID</th>
                <th>Client</th>
                <th>Plan</th>
                <th>Monthly price</th>
                <th>Source</th>
                {isOwner && <th>Custom price</th>}
              </tr>
            </thead>
            <tbody>
              {billed.map(({ site, price }) => (
                <tr key={site.id}>
                  <td>
                    <CopyableText value={site.smbId ?? ""}>
                      <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
                    </CopyableText>
                  </td>
                  <td className={shell.rowName}>{site.name}</td>
                  <td>{price.plan?.name ?? site.plan}</td>
                  <td className={shell.rowName}>{formatCents(price.cents)}</td>
                  <td className={shell.rowSub}>{PRICE_SOURCE_LABEL[price.source]}</td>
                  {isOwner && (
                    <td>
                      <form
                        action={updateSitePriceOverrideAction}
                        style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
                      >
                        <input type="hidden" name="siteId" value={site.id} />
                        <span className={shell.rowSub}>$</span>
                        <input
                          name="price"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={dollars(site.customPriceMonthlyCents)}
                          placeholder={dollars(price.cents)}
                          style={priceInputStyle}
                        />
                        <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                          Save
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {billed.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 6 : 5} className={shell.rowSub}>
                    No client sites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isOwner && (
          <p className={shell.rowSub} style={{ padding: "0 1.3rem 1.3rem", margin: 0 }}>
            A custom price overrides your plan price for that one client. Clear the field to go back
            to your plan price.
          </p>
        )}
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem" }}>
        <p className={shell.rowSub} style={{ margin: 0 }}>
          Pricing here is configuration only — VibeWP records what each client should be billed, but
          doesn&apos;t collect payment or issue invoices yet.
        </p>
      </div>
    </DashboardShell>
  );
}
