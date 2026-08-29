import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-permission";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { resolveSection } from "@/lib/sections/resolve";
import { updateSectionAction } from "@/app/actions/sections";
import { sectionPreviewMarkup } from "@/lib/wp/serialize";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { SectionPreview } from "./SectionPreview";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "../sections.module.css";
import detail from "./detail.module.css";
import { ADMIN_NAV } from "../../nav";

/**
 * One section: what it looks like, what it holds, and the policy an admin can
 * change without a deploy.
 *
 * The preview is rendered live from the section's own serializer and the
 * theme's real stylesheet, not from a stored screenshot. A screenshot goes
 * stale the moment the CSS changes, and a library whose previews lie is worse
 * than one with no previews.
 */
export default async function SectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requirePermission("sections.manage");
  const { key } = await params;
  const { saved } = await searchParams;

  const section = await resolveSection(key);
  if (!section) notFound();

  const planRows = await db.select().from(plans);

  /*
   * The markup the exporter would write for this section's sample content.
   * Routed by placement, because header/footer sections are written to the
   * theme's template parts and schemaToGutenberg() correctly refuses them.
   */
  const sampleMarkup = sectionPreviewMarkup(section.nodeType, section.definition.sample);

  const fields = Object.entries(section.definition.fields);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/sections"
      userName={profile.fullName}
      userRole="Super admin"
      title={section.name}
      subtitle={section.description}
    >
      <Link href="/admin/sections" className={detail.back}>
        ← Section library
      </Link>

      {saved && <div className={styles.notice}>Saved.</div>}

      <div className={detail.split}>
        <div>
          <div className={detail.panel}>
            <div className={detail.panelHead}>
              <strong>Live preview</strong>
              <span className={shell.rowSub}>
                the section&apos;s own markup, in the theme&apos;s stylesheet
              </span>
            </div>
            <SectionPreview html={sampleMarkup} />
          </div>

          <div className={detail.panel}>
            <div className={detail.panelHead}>
              <strong>Content it holds</strong>
              <span className={shell.rowSub}>defined in code — the AI fills these</span>
            </div>
            <table className={detail.fields}>
              <tbody>
                {fields.map(([name, spec]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td>{spec.label}</td>
                    <td>
                      <span className={detail.type}>{spec.type}</span>
                      {spec.maxChars && (
                        <span className={detail.limit}>≤ {spec.maxChars} chars</span>
                      )}
                    </td>
                    <td className={shell.rowSub}>{spec.hint ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!section.definition.fromGutenberg && (
              <p className={detail.warn}>
                This section has no parser, so edits made to it in wp-admin cannot be pulled back
                into VibeWP. Sync will report it as unmodelled rather than discarding the change.
              </p>
            )}
          </div>
        </div>

        <form action={updateSectionAction} className={detail.panel}>
          <input type="hidden" name="key" value={section.key} />
          <div className={detail.panelHead}>
            <strong>Settings</strong>
            <span className={shell.rowSub}>changeable without a deploy</span>
          </div>

          <label className={detail.field}>
            <span>Name</span>
            <input name="name" defaultValue={section.name} />
          </label>

          <label className={detail.field}>
            <span>Description</span>
            <textarea name="description" rows={3} defaultValue={section.description} />
          </label>

          <div className={detail.row}>
            <label className={detail.field}>
              <span>Category</span>
              <input name="category" defaultValue={section.category} />
            </label>
            <label className={detail.field}>
              <span>Sort order</span>
              <input name="sortOrder" type="number" defaultValue={section.sortOrder} />
            </label>
          </div>

          <label className={detail.check}>
            <input type="checkbox" name="isActive" defaultChecked={section.isActive} />
            <span>
              Available in the builder
              <em>Turning this off hides it from new pages; existing pages keep it.</em>
            </span>
          </label>

          <label className={detail.field}>
            <span>Generation prompt</span>
            <textarea
              name="aiPromptOverride"
              rows={5}
              placeholder={section.definition.aiPrompt}
              defaultValue={section.aiPromptOverride ?? ""}
            />
            <em className={detail.help}>
              {section.aiPromptOverride
                ? "Overriding the built-in prompt. Clear this field to go back to the default shown as placeholder text."
                : "Using the built-in prompt shown above. Type here to override it."}
            </em>
          </label>

          <fieldset className={detail.field}>
            <span>Available on plans</span>
            <em className={detail.help}>Leave all unchecked to allow every plan.</em>
            {planRows.length === 0 && <em className={detail.help}>No plans configured yet.</em>}
            {planRows.map((p) => (
              <label className={detail.check} key={p.id}>
                <input
                  type="checkbox"
                  name="allowedPlans"
                  value={p.key}
                  defaultChecked={section.allowedPlans.includes(p.key)}
                />
                <span>{p.name}</span>
              </label>
            ))}
          </fieldset>

          <button type="submit" className={detail.save}>
            Save settings
          </button>

          <p className={detail.codeNote}>
            Markup, fields and stylesheet live in{" "}
            <code>lib/sections/{section.key}.ts</code> and the theme&apos;s{" "}
            <code>sections.css</code>. Changing those is a deploy.
          </p>
        </form>
      </div>
    </DashboardShell>
  );
}
