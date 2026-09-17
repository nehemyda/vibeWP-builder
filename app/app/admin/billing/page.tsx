import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { updatePlanAction, createPlanAction } from "@/app/actions/billing";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.87rem",
} as const;
const labelStyle = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  color: "var(--muted)",
} as const;

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;

  const plans = await db.query.plans.findMany();
  const sorted = plans.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/billing"
      userName={profile.fullName}
      userRole="Super admin"
      title="Billing & plans"
      subtitle="Plan catalogue — pricing, limits, and features shown across the app. No live payment processing."
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1.2rem" }}>
        {sorted.map((plan) => (
          <div key={plan.id} className={shell.panel} style={{ padding: "1.3rem" }}>
            <form action={updatePlanAction} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <input type="hidden" name="planId" value={plan.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={shell.idBadge}>{plan.key}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {/*
                    What separates Vibe from Vibe WordPress. A site can only be
                    in WordPress mode on a plan with this ticked, so it is the
                    one control that decides which tier sells a real install.
                  */}
                  <label
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}
                    title="Sites on this plan may be provisioned into a real WordPress"
                  >
                    <input
                      type="checkbox"
                      name="includesWordpress"
                      defaultChecked={plan.includesWordpress}
                    />
                    Includes WordPress
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                    <input type="checkbox" name="isActive" defaultChecked={plan.isActive} />
                    Active
                  </label>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Name</label>
                <input name="name" defaultValue={plan.name} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Price / month (USD)</label>
                <input
                  name="priceMonthly"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={(plan.priceMonthlyCents / 100).toFixed(2)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                <div>
                  <label style={labelStyle}>Site limit</label>
                  <input
                    name="siteLimit"
                    type="number"
                    min="0"
                    defaultValue={plan.siteLimit ?? ""}
                    placeholder="unlimited"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Seat limit</label>
                  <input
                    name="seatLimit"
                    type="number"
                    min="0"
                    defaultValue={plan.seatLimit ?? ""}
                    placeholder="unlimited"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Features (one per line)</label>
                <textarea
                  name="features"
                  rows={4}
                  defaultValue={plan.features.join("\n")}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
              <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
                Save {plan.name}
              </button>
            </form>
          </div>
        ))}
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", maxWidth: 420 }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Add a plan</h2>
        <form action={createPlanAction} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label style={labelStyle}>Key (internal, unique)</label>
            <input name="key" required placeholder="enterprise" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input name="name" required placeholder="Enterprise" style={inputStyle} />
          </div>
          <button type="submit" className={shell.btn}>
            Create plan
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
