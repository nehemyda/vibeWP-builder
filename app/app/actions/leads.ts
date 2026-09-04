"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formSubmissions, leadNotes, profiles } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";

/**
 * Working a lead: where it has got to, and what was done about it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FIVE STATUSES, NOT A CONFIGURABLE PIPELINE
 *
 * New, contacted, qualified, won, lost is what a small business actually
 * tracks. Letting each site define its own stages sounds generous and turns
 * every later feature — the dashboard total, "leads going cold", a conversion
 * rate — into something that cannot be computed across sites.
 */
export async function setLeadStatusAction(
  smbId: string,
  submissionId: string,
  status: string,
  valuePounds?: string,
): Promise<{ ok: boolean }> {
  const { site } = await requireSiteAccess(smbId);
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { ok: false };

  /*
   * Value is only meaningful on a won lead, and is cleared otherwise — a
   * figure left behind on a lead later marked lost would quietly inflate any
   * total built from these.
   */
  const pounds = Number(String(valuePounds ?? "").replace(/[^\d.]/g, ""));
  const valueCents =
    status === "won" && Number.isFinite(pounds) && pounds > 0 ? Math.round(pounds * 100) : null;

  await db
    .update(formSubmissions)
    .set({ status, statusChangedAt: new Date(), valueCents })
    // Ownership in the WHERE clause, so a mismatched id changes nothing.
    .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.siteId, site.id)))
    .execute();

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function addLeadNoteAction(
  smbId: string,
  submissionId: string,
  formData: FormData,
): Promise<void> {
  const { site, user } = await requireSiteAccess(smbId);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  // The note belongs to a submission on THIS site, checked before writing.
  const submission = await db.query.formSubmissions.findFirst({
    where: and(eq(formSubmissions.id, submissionId), eq(formSubmissions.siteId, site.id)),
  });
  if (!submission) return;

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });

  await db.insert(leadNotes).values({
    submissionId,
    body: body.slice(0, 4000),
    authorUserId: user.id,
    /* Stored as text, so a note still says who wrote it after they leave. */
    authorName: profile?.fullName ?? "Someone",
  });

  revalidatePath("/dashboard", "layout");
}

export async function deleteLeadNoteAction(smbId: string, noteId: string): Promise<void> {
  const { site } = await requireSiteAccess(smbId);
  const note = await db.query.leadNotes.findFirst({ where: eq(leadNotes.id, noteId) });
  if (!note) return;
  const owns = await db.query.formSubmissions.findFirst({
    where: and(eq(formSubmissions.id, note.submissionId), eq(formSubmissions.siteId, site.id)),
  });
  if (!owns) return;
  await db.delete(leadNotes).where(eq(leadNotes.id, noteId));
  revalidatePath("/dashboard", "layout");
}
