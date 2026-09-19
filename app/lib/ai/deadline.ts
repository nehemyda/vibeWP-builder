/**
 * How long a model call may take before we stop waiting for it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Every call into the provider was made with no deadline of any kind. A
 * request that never came back never came back: the server action did not
 * resolve and did not reject, so the builder's own try/catch — which is
 * correct, and which already writes "I couldn't reach the generator" —
 * could not fire, because there was nothing for it to catch.
 *
 * What a client saw was "Building your page…" forever. Not an error, not a
 * retry, not a page. Observed once against a healthy server: idle CPU,
 * answering other requests in 200ms, nothing written to the database, and a
 * spinner that would still be turning now.
 *
 * A hang is the one failure that cannot report itself. Everything downstream
 * of a THROW is already handled — ai-generate.ts catches a provider failure
 * and degrades to a hero with an explanation — so the whole fix is to make
 * sure a stalled call eventually throws.
 *
 * WHY 60 SECONDS
 *
 * A whole page is many sections of copy in one request, and on a slow day a
 * real answer has taken tens of seconds. The budget has to sit above the
 * slowest ANSWER we would still want, not the average one — cutting off a
 * reply that was coming is a worse failure than waiting a little longer for
 * one that is not. Sixty seconds is comfortably past observed completions
 * and far short of a client concluding the product is broken.
 *
 * NOTE ON BILLING: aborting is client-side. It stops us waiting; it does not
 * stop the provider working, and usage may still be charged.
 * ─────────────────────────────────────────────────────────────────────
 */
export const MODEL_TIMEOUT_MS = 60_000;

/**
 * The deadline to hand a model call, as `abortSignal` in its config.
 *
 * A fresh signal per call — a timeout signal starts counting the moment it is
 * created, so one shared between calls would give the second call whatever
 * time the first had left.
 */
export function modelDeadline(): AbortSignal {
  return AbortSignal.timeout(MODEL_TIMEOUT_MS);
}

/**
 * Whether a rejection is this deadline firing rather than the provider
 * refusing, so a caller can say which happened.
 *
 * "It took too long" and "it said no" lead to different actions — wait and
 * retry, versus check the key — and a client told only "the AI provider
 * failed" cannot tell them apart.
 */
export function isModelTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Why a call ended, in words that belong in front of a client. */
export function modelFailureReason(err: unknown): string {
  return isModelTimeout(err)
    ? `the AI provider didn't answer within ${Math.round(MODEL_TIMEOUT_MS / 1000)} seconds`
    : "the AI provider failed";
}
