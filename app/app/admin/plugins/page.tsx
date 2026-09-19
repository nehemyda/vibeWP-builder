import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformPlugins, sites } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { savePluginAction } from "@/app/actions/plugins";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

/**
 * The plugins every client's WordPress is given.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS SCREEN HAS TO SAY OUT LOUD
 *
 * Two things neither of which is guessable from the controls:
 *
 *   A change reaches a site on its NEXT EXPORT, not now. An administrator who
 *   adds a plugin and checks a live client site a minute later should not
 *   conclude it is broken.
 *
 *   Deactivating a row UNINSTALLS NOTHING. It stops new installs; sites that
 *   already have the plugin keep it. The opposite would mean reaching into an
 *   install a client owns to undo a decision they did not make.
 *
 * And the limit that decides what may be on the list at all: only free
 * wordpress.org plugins can be installed from a slug. WP Rocket and Yoast
 * Premium need a licence key per install, so a row for either is a promise
 * wp-cli cannot keep.
 * ─────────────────────────────────────────────────────────────────────
 */
export default async function AdminPluginsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; unverified?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved, error, unverified } = await searchParams;

  const plugins = await db.select().from(platformPlugins).orderBy(asc(platformPlugins.sortOrder));
  const active = plugins.filter((p) => p.isActive).length;

  /*
   * How many sites this reaches, and how many it does not.
   *
   * A Vibe site has no WordPress, so it has no plugins and never will — the
   * entitlement check refuses the export before this step is reached. An
   * administrator looking at a checklist headed "every site" and then at a
   * Vibe site with none of it would be right to think something had failed.
   */
  const [{ wordpress }] = await db
    .select({ wordpress: sql<number>`count(*)::int` })
    .from(sites)
    .where(sql`${sites.deletedAt} is null and ${sites.mode} = 'wordpress'`);
  const [{ vibe }] = await db
    .select({ vibe: sql<number>`count(*)::int` })
    .from(sites)
    .where(sql`${sites.deletedAt} is null and ${sites.mode} = 'vibe'`);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/plugins"
      userName={profile.fullName}
      userRole="Super admin"
      title="Plugin checklist"
      subtitle={`${active} of ${plugins.length} installed into each of the ${wordpress} Vibe WordPress sites`}
    >
      {unverified && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1rem" }}>
          Added, but wordpress.org could not be reached to confirm the slug. If it is wrong,
          the install will fail at export and say so.
        </div>
      )}
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1rem", color: "var(--good)" }}>
          Saved. Sites pick this up on their next export.
        </div>
      )}
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1rem", color: "#b3261e" }}>
          {error === "duplicate"
            ? "That slug is already on the list."
            : error === "notfound"
              ? "wordpress.org has no plugin with that slug. Check the last part of its directory URL — Yoast SEO, for instance, is \u201cwordpress-seo\u201d."
              : error === "name"
                ? "Couldn\u2019t read a name from wordpress.org for that slug, so please type one."
                : "A wordpress.org slug is required."}
        </div>
      )}

      <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <p className={shell.rowSub} style={{ margin: 0 }}>
          These install when a site is exported to WordPress — including sites that already
          exist, on their next export. Turning one off stops new installs; it does not
          uninstall anything from a site that already has it. Only free wordpress.org
          plugins can be installed from a slug: anything paid needs a licence key entered
          on the install itself.
          {vibe > 0 && (
            <>
              {" "}
              The {vibe} Vibe {vibe === 1 ? "site" : "sites"} we host {vibe === 1 ? "is" : "are"}{" "}
              unaffected — they have no WordPress, so they have no plugins.
            </>
          )}
        </p>
      </div>

      {plugins.map((plugin) => (
        <div key={plugin.id} className={shell.panel} style={{ padding: "1.2rem", marginBottom: "0.9rem" }}>
          <form action={savePluginAction} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <input type="hidden" name="pluginId" value={plugin.id} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <span className={shell.idBadge}>{plugin.slug}</span>
              <div style={{ display: "flex", gap: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                  <input type="checkbox" name="isActive" defaultChecked={plugin.isActive} />
                  On the checklist
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}
                  title="Install and activate, rather than leaving it installed and dormant"
                >
                  <input type="checkbox" name="autoActivate" defaultChecked={plugin.autoActivate} />
                  Activate
                </label>
              </div>
            </div>
            <input name="name" defaultValue={plugin.name} required style={inputStyle} />
            <textarea
              name="purpose"
              defaultValue={plugin.purpose ?? ""}
              rows={2}
              placeholder="Why it is on the list"
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <button type="submit" className={`${shell.btn} ${shell.btnSmall}`} style={{ alignSelf: "flex-start" }}>
              Save
            </button>
          </form>
        </div>
      ))}

      <div className={shell.panel} style={{ padding: "1.3rem", marginTop: "1.4rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Add a plugin</h2>
        <form action={savePluginAction} style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 520 }}>
          <input name="slug" required placeholder="wordpress-seo" style={inputStyle} />
          <p className={shell.rowSub} style={{ margin: 0 }}>
            The wordpress.org slug — the last part of its directory URL.
          </p>
          <input name="name" placeholder="Yoast SEO — left blank, we read it from wordpress.org" style={inputStyle} />
          <textarea name="purpose" rows={2} placeholder="Why it is on the list" style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
              <input type="checkbox" name="isActive" defaultChecked />
              On the checklist
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
              <input type="checkbox" name="autoActivate" defaultChecked />
              Activate
            </label>
          </div>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
            Add to checklist
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
