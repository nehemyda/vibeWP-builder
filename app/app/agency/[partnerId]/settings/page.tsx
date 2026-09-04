import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfiles, plans, smtpSettings } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { SmtpForm } from "@/components/dashboard/SmtpForm";
import { saveAgencySmtpAction, testSmtpAction } from "@/app/actions/smtp-scoped";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "../../nav";
import { updateAgencyNameAction } from "@/app/actions/agency";
import { upsertBusinessProfileAction } from "@/app/actions/business-profile";

export default async function AgencySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { partnerId } = await params;
  const { profile, agency } = await requireAgency();
  const { saved } = await searchParams;

  if (!agency) {
    return (
      <DashboardShell
        navGroups={agencyNav("Your agency", null)}
        activeHref="/agency"
        userName={profile.fullName}
        userRole="Agency owner"
        title="Settings"
        subtitle="This account isn't linked to an agency yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Ask a super admin to link your account to an agency first.
        </div>
      </DashboardShell>
    );
  }

  const basePath = `/agency/${agency.partnerId}`;

  /*
   * The agency's own mail account, and what actually sends.
   *
   * "Configured" and "in use" differ: an agency row only takes effect for a
   * client that has not set up its own, so the sentence has to describe the
   * chain rather than just this row.
   */
  const ownSmtp = await db.query.smtpSettings.findFirst({
    where: and(eq(smtpSettings.scope, "agency"), eq(smtpSettings.agencyId, agency.id)),
  });
  if (agency.partnerId !== partnerId) {
    redirect(`${basePath}/settings`);
  }

  const [planDetails, businessProfile] = await Promise.all([
    db.query.plans.findFirst({ where: eq(plans.name, agency.plan) }),
    db.query.businessProfiles.findFirst({
      where: and(eq(businessProfiles.ownerType, "agency"), eq(businessProfiles.ownerId, agency.id)),
    }),
  ]);

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${basePath}/settings`}
      userName={profile.fullName}
      userRole="Agency owner"
      title="Settings"
      subtitle={agency.name}
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.twoCol} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Agency</h2>
          <form
            action={updateAgencyNameAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Partner ID
              </div>
              <CopyableText value={agency.partnerId ?? ""}>
                <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
              </CopyableText>
            </div>

            <div>
              <label
                htmlFor="name"
                style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
              >
                Agency name
              </label>
              <input
                id="name"
                name="name"
                defaultValue={agency.name}
                required
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
              Save
            </button>
          </form>
        </div>

        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Plan &amp; billing</h2>
          <div className={shell.fieldLabel}>Current plan</div>
          <p style={{ margin: "0.2rem 0 0.9rem", fontSize: "1.1rem", fontWeight: 700 }}>{agency.plan}</p>
          {planDetails ? (
            <>
              <div className={shell.fieldLabel}>Price</div>
              <p style={{ margin: "0.2rem 0 0.9rem" }}>
                {planDetails.priceMonthlyCents === 0
                  ? "Free"
                  : `$${(planDetails.priceMonthlyCents / 100).toFixed(2)}/mo`}
              </p>
              <div className={shell.fieldLabel}>Limits</div>
              <p style={{ margin: "0.2rem 0 0.9rem" }}>
                {planDetails.siteLimit ? `${planDetails.siteLimit} sites` : "Unlimited sites"} ·{" "}
                {planDetails.seatLimit ? `${planDetails.seatLimit} seats` : "Unlimited seats"}
              </p>
              {planDetails.features.length > 0 && (
                <>
                  <div className={shell.fieldLabel}>Included</div>
                  <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>
                    {planDetails.features.map((f) => (
                      <li key={f} style={{ fontSize: "0.87rem", marginBottom: "0.2rem" }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className={shell.rowSub}>No plan details on file.</p>
          )}
          <p className={shell.rowSub} style={{ marginTop: "1rem" }}>
            Plan changes aren&apos;t self-serve yet — contact support.
          </p>
        </div>
      </div>

      <div className={shell.panel} style={{ padding: "1.4rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Business details</h2>
        <form
          action={upsertBusinessProfileAction}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <input type="hidden" name="ownerType" value="agency" />
          <input type="hidden" name="ownerId" value={agency.id} />
          <input type="hidden" name="redirectTo" value={`${basePath}/settings`} />
          <BusinessDetailsFields profile={businessProfile ?? null} />
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
            Save business details
          </button>
        </form>
      </div>
      <div style={{ marginTop: "1.6rem" }}>
        {/* One name at every level — this is the same setting whether it is set
            by the platform, an agency or a client. */}
        <h2 style={{ margin: "0 0 0.7rem", fontSize: "1rem", fontWeight: 700 }}>
          SMTP configuration
        </h2>
        <SmtpForm
          action={saveAgencySmtpAction.bind(null, agency.partnerId ?? "")}
          testAction={testSmtpAction.bind(null, "agency", agency.partnerId ?? "")}
          testDefaultTo=""
          ownLabel="your agency"
          activeLevel={ownSmtp?.host ? "agency" : "global"}
          activeFrom={
            ownSmtp?.host && ownSmtp.fromEmail
              ? `${ownSmtp.fromName} <${ownSmtp.fromEmail}>`
              : "the platform's address"
          }
          current={
            ownSmtp
              ? {
                  host: ownSmtp.host,
                  port: ownSmtp.port,
                  username: ownSmtp.username,
                  fromEmail: ownSmtp.fromEmail,
                  fromName: ownSmtp.fromName,
                  secure: ownSmtp.secure,
                  hasPassword: Boolean(ownSmtp.password),
                }
              : null
          }
        />
        <p style={{ marginTop: "0.7rem", fontSize: "0.78rem", color: "var(--muted, #79808f)" }}>
          Used for every client site that hasn&rsquo;t set up its own.
        </p>
      </div>
    </DashboardShell>
  );
}
