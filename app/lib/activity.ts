import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

/**
 * Records one audit-trail row. Called from server actions after a mutation
 * succeeds — never blocks or throws into the caller's flow on failure, since
 * losing an audit entry shouldn't take down the mutation it's logging.
 */
export async function logActivity(entry: {
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await db.insert(activityLog).values({
      actorUserId: entry.actorUserId,
      actorName: entry.actorName,
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
