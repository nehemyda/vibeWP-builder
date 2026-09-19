import { clonableSites } from "@/lib/sites/clone-source";

/**
 * "Start from an existing site", wherever a site is created.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT FETCHES ITS OWN LIST
 *
 * Same argument as PlanSelect: two forms offering a picker means two places to
 * get the eligibility rule wrong, and the rule here is not obvious — only
 * sites that actually HAVE pages can lend a structure, and an agency must only
 * ever be shown its own. Keeping the query beside the control means a caller
 * cannot pass the wrong list, and the server action re-checks the chosen value
 * anyway because a <select> is not a promise.
 *
 * WHY THE COPY SAYS WHAT IT SAYS
 *
 * A picker called "clone" invites the belief that the new site will look like
 * the old one on arrival, finished. It will not: only the SHAPE is taken, and
 * the words and photographs are written for the new business at build time.
 * Someone choosing this is choosing a layout, and the sentence under the
 * control is the only place they find that out before they choose.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function CloneFromSelect({
  agencyId,
  defaultValue,
  style,
  hintClassName,
}: {
  /** Restricts the list to one agency's sites. Omit for an admin. */
  agencyId?: string | null;
  /**
   * Preselected source, from `?cloneFrom=` — how the Duplicate action on a
   * site arrives here. Ignored unless it is one of the options, so a hand-
   * edited URL cannot preselect a site this creator may not start from.
   */
  defaultValue?: string | null;
  style?: React.CSSProperties;
  hintClassName?: string;
}) {
  const options = await clonableSites({ agencyId });

  /*
   * Nothing to start from is a real state — the first site an agency makes —
   * and an empty dropdown is worse than none at all: it reads as a feature
   * that is broken rather than one that has nothing to offer yet.
   */
  if (options.length === 0) return null;

  const preselected = options.some((s) => s.smbId === defaultValue) ? defaultValue! : "";

  return (
    <div>
      <label htmlFor="cloneFrom" style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}>
        Start from an existing site
      </label>
      <select id="cloneFrom" name="cloneFrom" defaultValue={preselected} style={style}>
        <option value="">Build from scratch</option>
        {options.map((s) => (
          <option key={s.id} value={s.smbId ?? ""}>
            {s.name} — {s.pageCount} page{s.pageCount === 1 ? "" : "s"}
          </option>
        ))}
      </select>
      <p className={hintClassName} style={{ marginTop: "0.4rem" }}>
        Uses that site&rsquo;s layout — which sections, in which order. The words and
        photographs are written for this business when the site is built, so
        nothing of the other client&rsquo;s content comes across.
      </p>
    </div>
  );
}
