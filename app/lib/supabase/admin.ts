import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can call the admin.* auth APIs
 * (inviteUserByEmail, createUser, etc). Server-only; never import this from
 * a Client Component or expose the key it uses to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
