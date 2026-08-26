import { redirect } from "next/navigation";
import { requireAgency } from "@/lib/auth/require-agency";

/** Old flat URL, kept as a thin self-healing redirect to the current nested route. */
export default async function AgencySettingsRedirect() {
  const { agency } = await requireAgency();
  redirect(agency ? `/agency/${agency.partnerId}/settings` : "/agency");
}
