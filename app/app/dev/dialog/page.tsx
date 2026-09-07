import { notFound } from "next/navigation";
import { DialogHarness } from "./DialogHarness";

/**
 * The delete confirmation, with fixtures, outside the login.
 *
 * Same reason /dev/canvas exists: the Images tab is behind Supabase auth, so
 * a dialog inside it cannot be looked at without a session — and asking
 * someone else to log in and click it is not verification. This mounts the
 * real component with the real stylesheet; only the data is fixture.
 *
 * Development only — 404 in production.
 */
export default function DevDialogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DialogHarness />;
}
