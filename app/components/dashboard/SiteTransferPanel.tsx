import { eq, desc, asc, ne, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, siteTransfers, profiles, type sites } from "@/lib/db/schema";
import { transferSiteAction } from "@/app/actions/site-transfer";
import { formatCents } from "@/lib/billing";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import shell from "./dashboard-shell.module.css";

type Site = typeof sites.$inferSelect;

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

/**
 * Super-admin-only. Moves a client to a different agency, and shows the
 * history of previous moves — `sites.agencyId` alone only reveals where a
 * client sits today, not where it has been.
 */
export async function SiteTransferPanel({ site }: { site: Site }) {
  const [destinations, history, currentAgency] = await Promise.all([
    // Only active agencies: handing a client to a suspended or archived one
    // would lock them out of their own dashboard.
    db
      .select({ id: agencies.id, name: agencies.name, partnerId: agencies.partnerId })
      .from(agencies)
      .where(
        site.agencyId
          ? and(eq(agencies.status, "active"), ne(agencies.id, site.agencyId))
          : eq(agencies.status, "active"),
      )
      .orderBy(asc(agencies.name)),
    db
      .select()
      .from(siteTransfers)
      .where(eq(siteTransfers.siteId, site.id))
      .orderBy(desc(siteTransfers.createdAt)),
    site.agencyId
      ? db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) })
      : Promise.resolve(undefined),
  ]);

  // Resolve the names shown in the history table in one pass.
  const agencyIds = [
    ...new Set(history.flatMap((h) => [h.fromAgencyId, h.toAgencyId]).filter(Boolean) as string[]),
  ];
  const actorIds = [...new Set(history.map((h) => h.transferredByUserId).filter(Boolean) as string[])];
  const [agencyRows, actorRows] = await Promise.all([
    agencyIds.length
      ? db.select({ id: agencies.id, name: agencies.name, partnerId: agencies.partnerId }).from(agencies)
      : Promise.resolve([]),
    actorIds.length
      ? db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles)
      : Promise.resolve([]),
  ]);
  const agencyById = new Map(agencyRows.map((a) => [a.id, a]));
  const actorById = new Map(actorRows.map((p) => [p.id, p]));
  const label = (id: string | null) =>
    id ? `${agencyById.get(id)?.name ?? "Unknown"} (${agencyById.get(id)?.partnerId ?? "—"})` : "No agency";

  return (
    <div className={shell.panel} style={{ padding: "1.4rem", marginTop: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>Transfer to another agency</h2>
      <p className={shell.rowSub} style={{ marginTop: 0 }}>
        Currently managed by <strong>{currentAgency ? `${currentAgency.name} (${currentAgency.partnerId})` : "no agency — direct client"}</strong>.
        The client keeps their SMB ID <span className={shell.idBadge}>{site.smbId ?? "—"}</span>, their
        login, their team, pages and leads. Dashboard and builder links update themselves.
      </p>

      <form
        action={transferSiteAction.bind(null, site.id)}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 480, marginTop: "1rem" }}
      >
        <div>
          <label htmlFor="toAgencyId" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
            Move to
          </label>
          <select id="toAgencyId" name="toAgencyId" defaultValue="" required style={inputStyle}>
            <option value="" disabled>
              Choose a destination…
            </option>
            {destinations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.partnerId})
              </option>
            ))}
            {site.agencyId && <option value="none">No agency — make this a direct client</option>}
          </select>
        </div>

        <div>
          <label htmlFor="note" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
            Reason <span className={shell.rowSub}>(optional)</span>
          </label>
          <input id="note" name="note" placeholder="Why is this client moving?" style={inputStyle} />
        </div>

        <p className={shell.rowSub} style={{ margin: 0 }}>
          {site.customPriceMonthlyCents !== null ? (
            <>
              <strong>Pricing will reset.</strong> This client has a custom price of{" "}
              {formatCents(site.customPriceMonthlyCents)}/month agreed with their current agency. That
              deal will be cleared so the new agency&apos;s own plan pricing applies — the old figure is
              kept in the history below.
            </>
          ) : (
            <>The new agency&apos;s own plan pricing will apply from the moment of transfer.</>
          )}
        </p>

        <ConfirmSubmitButton
          confirmMessage={`Transfer ${site.name} to another agency? The current agency loses access immediately${
            site.customPriceMonthlyCents !== null ? ", and the custom price will be cleared" : ""
          }.`}
          className={`${shell.btn} ${shell.btnPrimary}`}
        >
          Transfer client
        </ConfirmSubmitButton>
      </form>

      {history.length > 0 && (
        <div style={{ marginTop: "1.6rem" }}>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.9rem" }}>Transfer history</h3>
          <div className={shell.tableWrap}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>From</th>
                  <th>To</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.createdAt.toLocaleDateString()}</td>
                    <td className={shell.rowSub}>{label(h.fromAgencyId)}</td>
                    <td className={shell.rowName}>{label(h.toAgencyId)}</td>
                    <td className={shell.rowSub}>
                      {h.transferredByUserId ? actorById.get(h.transferredByUserId)?.fullName ?? "Unknown" : "—"}
                    </td>
                    <td className={shell.rowSub}>
                      {h.note ?? "—"}
                      {h.previousCustomPriceMonthlyCents !== null && (
                        <> · cleared custom price {formatCents(h.previousCustomPriceMonthlyCents)}</>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
