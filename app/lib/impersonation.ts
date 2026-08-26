import { cookies } from "next/headers";

export const IMPERSONATION_COOKIE = "vibewp_impersonator";

/**
 * What the impersonation cookie carries.
 *
 * The tokens are the admin's own session, backed up so it can be restored on
 * "Return to admin". The identity fields exist so audit logging can name the
 * real operator: once the session has been swapped to the target user there is
 * no other server-side trace of who is actually driving.
 *
 * Storing the id here rather than decoding it out of accessToken is deliberate
 * — it avoids either trusting an unverified JWT payload or paying a network
 * round trip to Supabase on every single log write.
 *
 * Both identity fields are optional because sessions started before they were
 * added are still live; those degrade to an unattributed impersonation rather
 * than breaking.
 */
export type ImpersonationSession = {
  accessToken: string;
  refreshToken: string;
  impersonatorId?: string;
  impersonatorName?: string;
};

export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get(IMPERSONATION_COOKIE)?.value;
}

/**
 * Reads the impersonation cookie, or null when not impersonating.
 *
 * Never throws: a malformed cookie must not break the request it appears on.
 * Callers that use this for audit attribution treat null as "not impersonating",
 * which is the safe reading — it under-claims rather than inventing an actor.
 */
export async function readImpersonationSession(): Promise<ImpersonationSession | null> {
  try {
    const raw = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonationSession;
    return parsed?.accessToken && parsed?.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}
