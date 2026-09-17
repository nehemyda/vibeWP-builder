import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { planKeyOf } from "@/lib/billing";

/**
 * The plan picker, everywhere a plan is chosen.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS ONE COMPONENT AND NOT FOUR <select>s
 *
 * Four pages each hardcoded the same three options:
 *
 *     <select name="plan" defaultValue="Starter">
 *       <option>Starter</option><option>Growth</option><option>Scale</option>
 *
 * With no `value`, an <option> submits its own text — so those forms wrote
 * "Starter" into a column whose canonical form is the lowercase `plans.key`.
 * `sectionsForPlan` compared that raw string against `sections.allowedPlans`,
 * which stores keys, so plan-gating a section hid it from every site rather
 * than from the cheaper plans. See planKeyOf() in lib/billing.ts.
 *
 * The list was also a lie in the other direction: /admin/billing can create a
 * plan at runtime, and a plan that no form offers cannot be assigned to
 * anyone. Reading the catalogue fixes both — the options ARE the plans, and
 * their values are keys.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function PlanSelect({
  id = "plan",
  name = "plan",
  defaultValue,
  style,
}: {
  id?: string;
  name?: string;
  /** A stored plan value, in whatever case it happens to be on that row. */
  defaultValue?: string | null;
  style?: React.CSSProperties;
}) {
  const rows = await db
    .select({ key: plans.key, name: plans.name, isActive: plans.isActive })
    .from(plans)
    .orderBy(asc(plans.sortOrder));

  const selected = planKeyOf(defaultValue);

  /*
   * An inactive plan is hidden from the list but kept when it is the row's
   * current plan — otherwise opening the form on a site whose plan was since
   * retired would silently reassign it to whatever sorts first on save.
   */
  const options = rows.filter((p) => p.isActive || p.key === selected);

  return (
    <select id={id} name={name} defaultValue={selected} style={style}>
      {options.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
