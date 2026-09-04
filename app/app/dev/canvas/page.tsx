import { notFound } from "next/navigation";
import { CanvasHarness } from "./CanvasHarness";

/**
 * A canvas with no site behind it, for working on the canvas itself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The builder is behind Supabase auth, so the selection UI could not be looked
 * at without a logged-in session — and "log in and click it yourself" is not
 * verification, it is asking someone else to do it. This mounts the real
 * PreviewFrame and the real CanvasOverlay over a fixture page, so clicking,
 * outlining and the toolbar's geometry can be checked directly.
 *
 * It is NOT a mock: the markup comes from schemaToGutenberg and the styling
 * from the theme's own sections.css, exactly as the builder's canvas does. The
 * only things missing are the server actions, which the buttons report instead
 * of performing.
 *
 * Development only — 404 in production. A route that renders a page builder
 * over fixture content has no business being reachable on a live deployment.
 * ─────────────────────────────────────────────────────────────────────
 */
export default function DevCanvasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CanvasHarness />;
}
