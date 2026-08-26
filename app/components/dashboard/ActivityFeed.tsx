import shell from "./dashboard-shell.module.css";
import type { activityLog } from "@/lib/db/schema";

type Entry = typeof activityLog.$inferSelect;

export const ACTION_LABEL: Record<string, string> = {
  "auth.login": "logged in",
  "agency.created": "created agency",
  "agency.edited": "edited agency",
  "agency.suspended": "suspended agency",
  "agency.reactivated": "reactivated agency",
  "agency.archived": "archived agency",
  "agency.restored": "restored agency",
  "agency.deleted": "deleted agency",
  "agency.business_details_updated": "updated agency business details",
  "site.business_details_updated": "updated site business details",
  "site.created": "created site",
  "site.edited": "edited site",
  "site.deleted": "deleted site",
  "user.created": "created user",
  "user.edited": "edited user",
  "user.deactivated": "deactivated user",
  "user.reactivated": "reactivated user",
  "team.role_updated": "changed team member role",
  "team.suspended": "suspended team member",
  "team.reactivated": "reactivated team member",
  "team.invited": "invited team member",
  "plan.created": "created plan",
  "plan.edited": "edited plan",
  "settings.edited": "edited platform settings",
  "section.created": "created section",
  "section.edited": "edited section",
  "smtp.edited": "edited SMTP settings",
  "smtp.test_sent": "sent a test email",
  // Builder and WordPress actions. These already existed in the log but had no
  // labels, so they rendered as raw keys ("wordpress.exported").
  // Rendered as "<actor> <label> — <target>", so these read as verb + object
  // with no trailing preposition, matching every other entry above.
  "page.created": "created a page",
  "page.edited": "edited a page",
  "page.reverted": "reverted a page",
  "wordpress.provisioned": "set up WordPress",
  "wordpress.exported": "exported to WordPress",
  "site.published": "published site",
  "impersonation.started": "started viewing as",
  "impersonation.stopped": "stopped viewing as",
};

/** Renders a list of activity_log rows as "Actor <verb> Target — time". */
export function ActivityFeed({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <p className={shell.rowSub} style={{ padding: "1.3rem" }}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {entries.map((e) => (
        <li
          key={e.id}
          style={{
            padding: "0.85rem 1.3rem",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>{e.actorName}</strong> {ACTION_LABEL[e.action] ?? e.action}
            {e.targetLabel ? <> — {e.targetLabel}</> : null}
            {/*
              The row above names the account the action ran as. When that was
              an admin wearing someone else's session, saying so here is the
              whole point of the impersonator columns — the data existing in the
              database is no use if the log still reads as the client acting
              alone. Suppressed on the impersonation start/stop rows themselves,
              where actor and impersonator are the same person.
            */}
            {e.impersonatorName && !e.action.startsWith("impersonation.") ? (
              <em
                className={shell.rowSub}
                style={{ marginLeft: "0.45rem", fontStyle: "normal" }}
              >
                (via {e.impersonatorName}, impersonating)
              </em>
            ) : null}
          </span>
          <span className={shell.rowSub}>
            {e.createdAt.toLocaleDateString()} {e.createdAt.toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
