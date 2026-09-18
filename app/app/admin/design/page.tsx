import { sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getPlatformSettings } from "@/lib/platform-settings";
import { savePlatformDesignAction } from "@/app/actions/design";
import { DESIGN_TOKENS, TOKEN_GROUPS, sanitiseTokens } from "@/lib/design/tokens";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

/**
 * The platform's design defaults.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE CONTROLS ARE REBUILT HERE RATHER THAN LIFTED FROM StylePanel
 *
 * The thing worth sharing is DESIGN_TOKENS, and it IS shared: every range,
 * step, label and hint below comes from the same spec list the builder's panel
 * reads, so the two cannot offer different limits for one token.
 *
 * What is not shared is the chrome. StylePanel is built around the builder's
 * live-preview contract — a continuous onPreview while dragging and a separate
 * onCommit on release, against an iframe this page does not have — and its own
 * CSS module. Bending one component to serve both would mean passing class
 * names in as props to make it wear two skins. A form that posts is the right
 * shape here, and it is twenty lines.
 *
 * WHAT THIS PAGE HAS TO SAY OUT LOUD
 *
 * How many sites it reaches, because "every site" is the actual blast radius
 * and a number is more honest than the phrase. And that a site's own choices
 * still win — otherwise moving a slider and seeing a styled site not budge
 * reads as a bug rather than as the design.
 * ─────────────────────────────────────────────────────────────────────
 */
export default async function AdminDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;

  const settings = await getPlatformSettings();
  const tokens = sanitiseTokens(settings.designTokens);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sites)
    .where(isNull(sites.deletedAt));
  const [{ styled }] = await db
    .select({ styled: sql<number>`count(*)::int` })
    .from(sites)
    .where(sql`${sites.deletedAt} is null and ${sites.designTokens} is not null`);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/design"
      userName={profile.fullName}
      userRole="Super admin"
      title="Global design"
      subtitle={`Defaults for all ${total} sites — each site can still override them`}
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved. Vibe sites show it immediately; a WordPress site takes it on its next export.
        </div>
      )}

      <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <p className={shell.rowSub} style={{ margin: 0 }}>
          These are the values every section starts from. {styled} of {total} sites have set
          design values of their own — those keep theirs, key by key, and follow these for
          anything they have not changed.
        </p>
      </div>

      <form action={savePlatformDesignAction}>
        {TOKEN_GROUPS.map((group) => (
          <div key={group} className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>{group}</h2>
            {DESIGN_TOKENS.filter((t) => t.group === group).map((spec) => {
              const value = tokens[spec.name] ?? spec.unset;
              return (
                <div key={spec.name} style={{ marginBottom: "1.1rem", maxWidth: 520 }}>
                  <label
                    htmlFor={`tok-${spec.name}`}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <span>{spec.label}</span>
                    <span className={shell.rowSub}>
                      {spec.kind === "px" ? `${value}px` : `${Math.round(value * 100)}%`}
                      {value === spec.unset ? " · default" : ""}
                    </span>
                  </label>
                  <input
                    id={`tok-${spec.name}`}
                    name={spec.name}
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    defaultValue={value}
                    style={{ width: "100%", marginTop: "0.4rem" }}
                  />
                  {spec.hint && (
                    <p className={shell.rowSub} style={{ margin: "0.2rem 0 0" }}>
                      {spec.hint}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Save defaults
          </button>
          {/*
            Reset is its own submit because null is a state dragging cannot
            reach: every slider sitting at its default looks identical to
            "never set", and only one of those keeps following the stylesheet
            if a designer improves it later.
          */}
          <button type="submit" name="reset" value="1" className={`${shell.btn} ${shell.btnSmall}`}>
            Reset to stylesheet defaults
          </button>
        </div>
      </form>
    </DashboardShell>
  );
}
