/**
 * The pipeline stages, as plain data.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THESE ARE NOT IN THE ACTIONS FILE
 *
 * A "use server" module may export only async functions. A constant array or
 * object there compiles fine and passes tsc, then fails the production build —
 * the exact fault LOGO_MAX_BYTES caused in this project once already. Values
 * shared between server and client live in a plain module.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY FIVE FIXED STAGES
 *
 * New, contacted, qualified, won, lost is what a small business actually
 * tracks. Letting each site define its own sounds generous and makes every
 * later feature — a dashboard total, "leads going cold", a conversion rate —
 * impossible to compute across sites.
 */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

/** Won and lost are the only two that end, and read as endings. */
export const STATUS_TONE: Record<LeadStatus, { bg: string; fg: string }> = {
  new: { bg: "#eef2ff", fg: "#3730a3" },
  contacted: { bg: "#f1f5f9", fg: "#334155" },
  qualified: { bg: "#fef3c7", fg: "#92400e" },
  won: { bg: "#dcfce7", fg: "#166534" },
  lost: { bg: "#f3f4f6", fg: "#6b7280" },
};
