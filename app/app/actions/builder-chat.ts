"use server";

import { eq, asc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { builderMessages } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";

export type StoredMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  steps: string[];
};

async function requireEditor(siteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }
}

/**
 * Appends one message to the transcript.
 *
 * Deliberately fire-and-forget from the caller's point of view: failing to
 * record chat should never block or undo a generation that already
 * succeeded.
 */
export async function appendBuilderMessageAction(opts: {
  siteId: string;
  role: "user" | "ai";
  text: string;
  steps?: string[];
}): Promise<void> {
  const { siteId, role, text, steps } = opts;
  await requireEditor(siteId);
  await db.insert(builderMessages).values({
    siteId,
    role,
    text: text.slice(0, 4000),
    steps: steps ?? [],
  });
}

export async function loadBuilderMessagesAction(siteId: string): Promise<StoredMessage[]> {
  await requireEditor(siteId);
  const rows = await db
    .select()
    .from(builderMessages)
    .where(eq(builderMessages.siteId, siteId))
    .orderBy(asc(builderMessages.createdAt));

  return rows.map((r) => ({
    id: r.id,
    role: r.role === "user" ? "user" : "ai",
    text: r.text,
    steps: r.steps ?? [],
  }));
}

/** Clears the transcript for a site — the chat's "start over". */
export async function clearBuilderMessagesAction(siteId: string): Promise<void> {
  await requireEditor(siteId);
  await db.delete(builderMessages).where(eq(builderMessages.siteId, siteId));
}
