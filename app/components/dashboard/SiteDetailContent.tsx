import { CopyableText } from "@/components/dashboard/CopyableText";
import { Pagination } from "@/components/dashboard/Pagination";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import { upsertBusinessProfileAction } from "@/app/actions/business-profile";
import { updateSiteSettingsAction, deleteSiteAction } from "@/app/actions/sites";
import { totalPages } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import type { sites, leads as leadsTable, businessProfiles } from "@/lib/db/schema";

type Site = typeof sites.$inferSelect;
type Lead = typeof leadsTable.$inferSelect;
type BusinessProfile = typeof businessProfiles.$inferSelect;

function pillFor(status: string) {
  if (status === "live") return { cls: "pillLive" as const, label: "Live" };
  if (status === "trial") return { cls: "pillTrial" as const, label: "Trial" };
  return { cls: "pillDraft" as const, label: "Draft" };
}

/** Shared body for the Site/SMB detail page, rendered inside admin's or agency's own DashboardShell. */
export function SiteDetailContent({
  site,
  ownerName,
  leadsPage,
  leadsTotalCount,
  page,
  basePath,
  listPath,
  builderPath,
  businessProfile,
  canEditBusinessProfile,
}: {
  site: Site;
  ownerName: string | null;
  leadsPage: Lead[];
  leadsTotalCount: number;
  page: number;
  basePath: string;
  /** Where "Delete" sends you afterward — the detail page itself is gone once deleted. */
  listPath: string;
  /** Full path to the builder for this site — nested under the agency's Partner ID when agency-managed. */
  builderPath: string;
  businessProfile?: BusinessProfile | null;
  canEditBusinessProfile?: boolean;
}) {
  const pill = pillFor(site.status);

  return (
    <>
      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Status</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            <span className={`${shell.pill} ${shell[pill.cls]}`}>{pill.label}</span>
          </div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Leads</div>
          <div className={shell.value}>{leadsTotalCount}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Plan</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {site.plan}
          </div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Created</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {site.createdAt.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Site info</h2>
          <form action={deleteSiteAction.bind(null, site.id, listPath)}>
            <ConfirmSubmitButton
              confirmMessage={`Delete ${site.name}? This hides it but keeps all leads and builder content — recoverable.`}
              className={`${shell.btn} ${shell.btnSmall}`}
            >
              Delete site
            </ConfirmSubmitButton>
          </form>
        </div>
        <div className={shell.fieldLabel}>SMB ID</div>
        <p style={{ margin: "0 0 0.9rem" }}>
          <CopyableText value={site.smbId ?? ""}>
            <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
          </CopyableText>
        </p>
        <div className={shell.fieldLabel}>Owner</div>
        <p style={{ margin: "0 0 0.9rem" }}>
          {ownerName ? <CopyableText value={ownerName}>{ownerName}</CopyableText> : "—"}
        </p>
        <form
          action={updateSiteSettingsAction}
          style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 420 }}
        >
          <input type="hidden" name="siteId" value={site.id} />
          <input type="hidden" name="redirectTo" value={basePath} />
          <div>
            <label htmlFor="name" className={shell.fieldLabel} style={{ display: "block" }}>
              Site name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={site.name}
              required
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.87rem",
              }}
            />
          </div>
          <div>
            <label htmlFor="domain" className={shell.fieldLabel} style={{ display: "block" }}>
              Domain
            </label>
            <input
              id="domain"
              name="domain"
              defaultValue={site.domain ?? ""}
              placeholder="yourbusiness.com"
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.87rem",
              }}
            />
          </div>
          <button
            type="submit"
            className={`${shell.btn} ${shell.btnPrimary}`}
            style={{ alignSelf: "flex-start" }}
          >
            Save
          </button>
        </form>
      </div>

      {canEditBusinessProfile && (
        <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Business details</h2>
          <form
            action={upsertBusinessProfileAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <input type="hidden" name="ownerType" value="site" />
            <input type="hidden" name="ownerId" value={site.id} />
            <input type="hidden" name="redirectTo" value={basePath} />
            <BusinessDetailsFields profile={businessProfile ?? null} />
            <button
              type="submit"
              className={`${shell.btn} ${shell.btnPrimary}`}
              style={{ alignSelf: "flex-start" }}
            >
              Save business details
            </button>
          </form>
        </div>
      )}

      <div className={shell.panel}>
        <div className={shell.panelHead}>
          <h2>Leads</h2>
          <a className={`${shell.btn} ${shell.btnSmall}`} href={builderPath}>
            Open in builder
          </a>
        </div>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Message</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {leadsPage.map((lead) => (
                <tr key={lead.id}>
                  <td className={shell.rowName}>{lead.name}</td>
                  <td className={shell.rowSub}>{lead.message}</td>
                  <td>{lead.receivedAt.toLocaleDateString()}</td>
                </tr>
              ))}
              {leadsPage.length === 0 && (
                <tr>
                  <td colSpan={3} className={shell.rowSub}>
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages(leadsTotalCount)} basePath={basePath} />
      </div>
    </>
  );
}
