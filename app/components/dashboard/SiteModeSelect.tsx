import type { SiteMode } from "@/lib/db/schema";

/**
 * Vibe, or Vibe WordPress — chosen when a site is created.
 *
 * The wording is the product decision, so it lives in one place rather than
 * being retyped on each creation form. What separates the two is not features
 * but where the finished site runs: our platform, or a WordPress install the
 * client owns and is billed monthly for.
 *
 * Deliberately a plain <select> with two literal options and no catalogue
 * lookup — unlike PlanSelect, these are not data. A third mode would be a
 * schema change and a migration, not an admin ticking a box.
 */
export function SiteModeSelect({
  id = "mode",
  name = "mode",
  defaultValue = "vibe",
  style,
}: {
  id?: string;
  name?: string;
  defaultValue?: SiteMode;
  style?: React.CSSProperties;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue} style={style}>
      <option value="vibe">Vibe — hosted by us</option>
      <option value="wordpress">Vibe WordPress — their own install</option>
    </select>
  );
}
