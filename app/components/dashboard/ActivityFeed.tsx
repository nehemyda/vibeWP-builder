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
          </span>
          <span className={shell.rowSub}>
            {e.createdAt.toLocaleDateString()} {e.createdAt.toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
