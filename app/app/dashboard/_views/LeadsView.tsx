import Link from "next/link";
import { eq, desc, sql, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { formSubmissions, formDefinitions, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { totalPages, PAGE_SIZE, pageOffset } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "../nav";
import { FormsTab } from "./FormsTab";
import { FormEditor } from "./FormEditor";
import type { FormFieldSpec } from "@/app/actions/forms";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

/**
 * Reads whichever field looks like a person's name, then falls back.
 *
 * Answers are stored keyed by field name, and a client can rename or remove
 * any of them — a form asking only "your email" is perfectly valid. So the
 * column has to degrade rather than assume: a submission with no name field
 * shows its email, and one with neither still shows something identifying
 * rather than an empty cell.
 */
function personOf(data: Record<string, unknown>): string {
  for (const key of ["name", "fullName", "full_name", "firstName", "email"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Someone";
}

/** The longest free-text answer — nearly always the actual message. */
function summaryOf(data: Record<string, unknown>): string {
  let best = "";
  for (const [key, value] of Object.entries(data)) {
    if (key === "name" || key === "email") continue;
    if (typeof value === "string" && value.trim().length > best.length) best = value.trim();
  }
  return best;
}

export async function LeadsView({
  profile,
  role,
  site,
  paths,
  page,
  tab,
  formId,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
  page: number;
  /** "submissions" (default) or "forms". */
  tab?: string;
  /** A form id opens the field editor for it. */
  formId?: string;
}) {
  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title="Leads & forms"
        subtitle="You don't have a site yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Start building your site from the landing page first.
        </div>
      </DashboardShell>
    );
  }

  const showForms = tab === "forms";

  const [rows, [{ count: totalCount }], [{ count: unreadCount }], forms, perForm] = await Promise.all([
    db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.siteId, site.id))
      .orderBy(desc(formSubmissions.receivedAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(eq(formSubmissions.siteId, site.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.siteId, site.id), isNull(formSubmissions.readAt))),
    db.select().from(formDefinitions).where(eq(formDefinitions.siteId, site.id)),
    db
      .select({ formId: formSubmissions.formId, count: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(eq(formSubmissions.siteId, site.id))
      .groupBy(formSubmissions.formId),
  ]);

  // A form with no submissions after a week is usually one nobody embedded.
  const countByForm = new Map(perForm.filter((r) => r.formId).map((r) => [r.formId as string, r.count]));

  const editing = formId ? forms.find((f) => f.id === formId) : undefined;

  const tabStyle = (active: boolean) => ({
    padding: "0.55rem 0.1rem",
    marginRight: "1.4rem",
    fontSize: "0.9rem",
    fontWeight: active ? 700 : 500,
    color: active ? "var(--ink, #12151c)" : "var(--muted, #79808f)",
    borderBottom: `2px solid ${active ? "var(--ink, #12151c)" : "transparent"}`,
    textDecoration: "none",
    display: "inline-block",
  });

  return (
    <DashboardShell
      navGroups={smbNav(paths, Boolean(site.intakeCompletedAt))}
      activeHref={paths.leadsPath}
      userName={profile.fullName}
      userRole={site.name}
      title="Leads & forms"
      subtitle={
        unreadCount > 0
          ? `${unreadCount} unread of ${totalCount} from ${site.name}`
          : `${totalCount} ${totalCount === 1 ? "submission" : "submissions"} from ${site.name}`
      }
    >
      {/*
        One destination, two jobs. Reading enquiries is a daily inbox; managing
        forms is rare setup, and mixing them clutters the thing checked every
        morning with the thing touched twice a year.
      */}
      {!editing && (
      <nav style={{ borderBottom: "1px solid var(--line, #e6e8ee)", marginBottom: "1.1rem" }}>
        <Link href={paths.leadsPath} style={tabStyle(!showForms)}>
          Submissions
        </Link>
        <Link href={`${paths.leadsPath}?tab=forms`} style={tabStyle(showForms)}>
          Forms {forms.length > 0 && `(${forms.length})`}
        </Link>
      </nav>
      )}

      {editing ? (
        <FormEditor
          smbId={site.smbId ?? ""}
          formId={editing.id}
          backHref={`${paths.leadsPath}?tab=forms`}
          initial={{
            name: editing.name,
            fields: (editing.fields as FormFieldSpec[]) ?? [],
            successMessage: editing.successMessage ?? "",
            notifyEmails: editing.notifyEmails ?? "",
          }}
        />
      ) : showForms ? (
        <FormsTab
          smbId={site.smbId ?? ""}
          leadsPath={paths.leadsPath}
          forms={forms.map((f) => ({
            id: f.id,
            name: f.name,
            fieldCount: (f.fields as unknown[]).length,
            embedToken: f.embedToken,
            isActive: f.isActive,
            submissionCount: countByForm.get(f.id) ?? 0,
          }))}
        />
      ) : (
        <div className={shell.panel}>
          <div className={shell.tableWrap}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Message</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const data = (row.data ?? {}) as Record<string, unknown>;
                  const unread = !row.readAt;
                  return (
                    <tr key={row.id}>
                      {/* Unread is carried by weight, not a badge — the list is
                          scanned, and a column of pills is harder to read. */}
                      <td className={shell.rowName} style={{ fontWeight: unread ? 700 : 500 }}>
                        {personOf(data)}
                      </td>
                      <td className={shell.rowSub}>{summaryOf(data) || "—"}</td>
                      <td>{row.receivedAt.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className={shell.rowSub}>
                      No submissions yet. Enquiries from your site&rsquo;s contact form
                      appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages(totalCount)} basePath={paths.leadsPath} />
        </div>
      )}
    </DashboardShell>
  );
}
