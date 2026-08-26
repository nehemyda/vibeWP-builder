import { redirect } from "next/navigation";

/** Old URL shape, kept as a thin self-healing redirect to the current nested route. */
export default async function AgencySiteDetailRedirect({
  params,
}: {
  params: Promise<{ partnerId: string; smbId: string }>;
}) {
  const { partnerId, smbId } = await params;
  redirect(`/agency/${partnerId}/sites/${smbId}`);
}
