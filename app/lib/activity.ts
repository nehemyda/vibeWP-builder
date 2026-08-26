import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { readImpersonationSession } from "@/lib/impersonation";

/**
 * Records one audit-trail row. Called from server actions after a mutation
 * succeeds — never blocks or throws into the caller's flow on failure, since
 * losing an audit entry shouldn't take down the mutation it's logging.
 *
 * IMPERSONATION: the real operator is resolved here rather than at each call
 * site, and deliberately so. Impersonation swaps the live Supabase session to
 * the target user, so every caller's `actorUserId` is already the client by the
 * time it reaches this function — there is nothing a call site could pass to
 * correct that. Reading the impersonation cookie at this single chokepoint
 * means every action in the app, including ones added later, is attributed
 * truthfully without the author having to remember anything.
 *
 * Callers may still pass `impersonator` explicitly, which start/stop of
 * impersonation itself needs: at those two moments the cookie is either not yet
 * written or about to be cleared.
 */
export async function logActivity(entry: {
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Overrides cookie detection. Only impersonation start/stop should need this. */
  impersonator?: { id: string | null; name: string } | null;
}) {
  try {
    let impersonatorUserId = entry.impersonator?.id ?? null;
    let impersonatorName = entry.impersonator?.name ?? null;

    if (!entry.impersonator) {
      const session = await readImpersonationSession();
      if (session) {
        impersonatorUserId = session.impersonatorId ?? null;
        // A session opened before the identity fields existed is still an
        // impersonated action; say so rather than logging it as ordinary.
        impersonatorName = session.impersonatorName ?? "Unknown administrator";
      }
    }

    await db.insert(activityLog).values({
      actorUserId: entry.actorUserId,
      actorName: entry.actorName,
      impersonatorUserId,
      impersonatorName,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("logActivity failed", err);
  }
}
