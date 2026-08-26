import { cookies } from "next/headers";

export const IMPERSONATION_COOKIE = "vibewp_impersonator";

export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get(IMPERSONATION_COOKIE)?.value;
}
