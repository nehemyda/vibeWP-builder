import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { formatCents } from "@/lib/billing";
import { downgradePreflightAction } from "@/app/actions/site-lifecycle";
import { vibeSiteUrl } from "@/lib/render/hosting";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import type { sites } from "@/lib/db/schema";
import { DeliveryActions } from "./DeliveryActions";

/**
 * Where a site is delivered, and how to change it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY SETTINGS AND NOT THE BUILDER
 *
 * This is a commercial decision taken roughly once in a site's life: it
 * changes what the client is billed and which machinery their site runs on.
 * The builder is where someone edits copy. Putting a "move your site" control
 * beside the words they are writing invites it to be pressed absentmindedly,
 * which is exactly what the one-time mode question at intake was shaped to
 * avoid.
 *
 * WHY THE DOWNGRADE COST IS COMPUTED HERE, BEFORE ANYONE ASKS
 *
 * downgradePreflightAction is read-only, so the page can say what a move
 * would lose before it is started. A confirmation dialog listing the damage
 * only after the button is pressed is a worse version of the same
 * information — by then someone has already decided.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function DeliveryPanel({
  site,
  settingsPath,
}: {
  site: typeof sites.$inferSelect;
  settingsPath: string;
}) {
  const catalogue = await db.select().from(plans);
  const active = catalogue.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const current = catalogue.find((p) => p.key === site.plan);

  const wordpressPlans = active.filter((p) => p.includesWordpress);
  const vibePlans = active.filter((p) => !p.includesWordpress);

  const isWordPress = site.mode === "wordpress";
  const preflight = isWordPress ? await downgradePreflightAction(site.smbId ?? "") : null;
  const liveUrl = site.mode === "vibe" ? vibeSiteUrl(site.vibeSubdomain) : null;

  return (
    <div className={shell.panel} style={{ maxWidth: 720, padding: "1.4rem", marginTop: "1.2rem" }}>
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1rem" }}>Delivery</h2>
      <p className={shell.rowSub} style={{ margin: "0 0 1.2rem" }}>
        {isWordPress
          ? "This site runs on its own WordPress install, which you own and can edit in wp-admin."
          : "This site is hosted by us. Everything you build is live without a WordPress to maintain."}
      </p>

      <div className={shell.fieldLabel}>Current</div>
      <p style={{ margin: "0.2rem 0 1rem", fontSize: "1.05rem", fontWeight: 700 }}>
        {isWordPress ? "Vibe WordPress" : "Vibe"}
        {current ? (
          <span className={shell.rowSub} style={{ fontWeight: 400 }}>
            {" "}
            · {current.name} · {formatCents(current.priceMonthlyCents)}
          </span>
        ) : null}
      </p>

      {liveUrl && (
        <p className={shell.rowSub} style={{ marginTop: 0 }}>
          Served at{" "}
          <a href={liveUrl} target="_blank" rel="noreferrer">
            {liveUrl}
          </a>
        </p>
      )}

      <DeliveryActions
        smbId={site.smbId ?? ""}
        mode={site.mode}
        settingsPath={settingsPath}
        upgradePlans={wordpressPlans.map((p) => ({ key: p.key, name: p.name, price: formatCents(p.priceMonthlyCents) }))}
        downgradePlans={vibePlans.map((p) => ({ key: p.key, name: p.name, price: formatCents(p.priceMonthlyCents) }))}
        preflight={preflight}
      />
    </div>
  );
}
