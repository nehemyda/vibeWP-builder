import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * A durable record of what chat decided to do, and what happened next.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A FILE AND NOT console.info
 *
 * Every edit already logged its chosen operation to stdout. That was useless in
 * practice: the dev server is started by the desktop app, so its output goes to
 * a pipe nobody reads. Repeated reports of "chat isn't working" were therefore
 * met with guesses at the cause, one narrow fix per screenshot, because the one
 * artefact that would have said what actually happened was being written to
 * nowhere.
 *
 * Three fields matter and are recorded for every attempt: what the client
 * typed, which operation the planner chose, and whether applying it succeeded.
 * A wrong operation and a right operation that failed to apply look identical
 * from the outside and need opposite fixes.
 */

const LOG_PATH = join(process.cwd(), ".vibewp", "edits.jsonl");

export type EditLogEntry = {
  at: string;
  siteId: string;
  slug: string;
  instruction: string;
  /** The planner's chosen operation, verbatim. */
  op: unknown;
  outcome: "ok" | "refused" | "error";
  /** What the client was told. */
  message: string;
  /**
   * Where the change came from.
   *
   * Chat and the canvas fail in different ways — chat can misread a sentence,
   * the canvas cannot — so a log that does not distinguish them makes the
   * planner look worse than it is, and hides a canvas bug among the
   * misreadings. Absent means chat, which is everything logged before the
   * canvas could edit anything.
   */
  source?: "chat" | "canvas";
};

export async function logEdit(entry: Omit<EditLogEntry, "at">): Promise<void> {
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch {
    /*
     * Never let logging break an edit. Diagnostics that can take down the thing
     * they diagnose are worse than no diagnostics.
     */
  }
}
