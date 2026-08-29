import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-permission";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { listSections, reconcileSections } from "@/lib/sections/resolve";
import { deleteOrphanSectionAction } from "@/app/actions/sections";
import { sectionPreviewMarkup } from "@/lib/wp/serialize";
import { CardPreview } from "./CardPreview";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "./sections.module.css";
import { ADMIN_NAV } from "../nav";

/**
 * The library index.
 *
 * Built from the section registry, not from the database. The old page listed
 * table rows and offered a form to create more, which let an admin add an entry
 * pointing at a component that did not exist — it showed up here and rendered
 * nothing. Now a card exists because code exists; the database only adjusts it.
 */
export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; added?: string }>;
}) {
  const { profile } = await requirePermission("sections.manage");
  const { category, q, added } = await searchParams;

  // Deploying a section should make it manageable without a manual step.
  await reconcileSections();

  const { resolved, orphans } = await listSections();

  /*
   * Counts come from the unfiltered set, so a chip always shows how many
   * sections that category holds — not how many survive the current filter,
   * which would make every count read 0 for the categories you aren't in.
   *
   * Ordered by the sequence a page is actually assembled in rather than
   * alphabetically, so the list reads header → content → footer.
   */
  const CATEGORY_ORDER = [
    "Header",
    "Hero",
    "Content",
    "Social proof",
    "Conversion",
    "Support",
    "Contact",
    "Footer",
  ];
  const counts = new Map<string, number>();
  for (const s of resolved) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const categories = [...counts.keys()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );
  const needle = q?.trim().toLowerCase();
  const visible = resolved.filter((s) => {
    if (category && s.category !== category) return false;
    if (!needle) return true;
    return (
      s.name.toLowerCase().includes(needle) ||
      s.description.toLowerCase().includes(needle) ||
      s.key.includes(needle)
    );
  });

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/sections"
      userName={profile.fullName}
      userRole="Super admin"
      title="Section library"
      subtitle={`${resolved.length} section${resolved.length === 1 ? "" : "s"} available to the builder`}
    >
      {added && (
        <div className={styles.notice}>
          Registered {added} new section{added === "1" ? "" : "s"} from the latest deploy.
        </div>
      )}

      {/*
        An orphan means a section was renamed or removed in code while its
        settings row survived. Shown rather than hidden, because any page still
        referencing it will quietly fail to render that section.
      */}
      {orphans.length > 0 && (
        <div className={styles.orphans}>
          <strong>
            {orphans.length} settings row{orphans.length === 1 ? "" : "s"} with no matching section
            in code
          </strong>
          <p>
            These were created before sections came from the registry, or the section was renamed.
            Nothing will render them.
          </p>
          {orphans.map((o) => (
            <form action={deleteOrphanSectionAction} key={o.id} className={styles.orphanRow}>
              <input type="hidden" name="sectionId" value={o.id} />
              <input type="hidden" name="key" value={o.key} />
              <code>{o.key}</code>
              <span className={shell.rowSub}>expects component “{o.componentType}”</span>
              <button type="submit" className={styles.linkBtn}>
                Remove row
              </button>
            </form>
          ))}
        </div>
      )}

      <form className={styles.filters}>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search sections…"
          className={styles.search}
        />
        <div className={styles.chips}>
          <Link
            href="/admin/sections"
            className={`${styles.chip} ${!category ? styles.chipOn : ""}`}
          >
            All <span className={styles.chipCount}>{resolved.length}</span>
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/admin/sections?category=${encodeURIComponent(c)}`}
              className={`${styles.chip} ${category === c ? styles.chipOn : ""}`}
            >
              {c} <span className={styles.chipCount}>{counts.get(c)}</span>
            </Link>
          ))}
        </div>
      </form>

      <div className={styles.grid}>
        {visible.map((s) => (
          <Link href={`/admin/sections/${s.key}`} key={s.key} className={styles.card}>
            <div className={styles.thumb}>
              {/*
                A stored image wins if an admin has deliberately set one —
                useful for a section whose sample doesn't photograph well.
                Otherwise render the section for real, so a thumbnail can
                never disagree with the section it depicts.
              */}
              {s.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.previewImageUrl} alt={`${s.name} preview`} />
              ) : (
                <CardPreview html={sectionPreviewMarkup(s.nodeType, s.definition.sample)} />
              )}
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardTop}>
                <span className={styles.cardName}>{s.name}</span>
                <span className={s.isActive ? styles.pillOn : styles.pillOff}>
                  {s.isActive ? "Active" : "Off"}
                </span>
              </div>
              <span className={styles.cardCat}>{s.category}</span>
              <p className={styles.cardDesc}>{s.description}</p>
              <div className={styles.cardMeta}>
                <code>{s.key}</code>
                {s.aiPromptOverride && <span className={styles.tag}>custom prompt</span>}
                {s.allowedPlans.length > 0 && (
                  <span className={styles.tag}>{s.allowedPlans.length} plan(s)</span>
                )}
              </div>
            </div>
          </Link>
        ))}

        {visible.length === 0 && (
          <p className={shell.rowSub} style={{ padding: "1.3rem" }}>
            No sections match that filter.
          </p>
        )}
      </div>

      <p className={styles.footnote}>
        Sections are defined in code (<code>lib/sections/</code>) so each one ships with its own
        markup and stylesheet. This page controls how they are presented and who can use them —
        adding a new section type is a deploy.
      </p>
    </DashboardShell>
  );
}
