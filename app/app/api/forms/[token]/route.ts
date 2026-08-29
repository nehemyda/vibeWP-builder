import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDefinitions } from "@/lib/db/schema";

/**
 * The public definition of one form, for the embed script to render.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT RETURN
 *
 * The row also holds `siteId` and `notifyEmails`. Neither is any of the
 * visitor's business, and both would be readable by anyone who found a token
 * in page source — so the response is assembled field by field rather than
 * spread from the record. A `...form` here would leak the client's own inbox
 * addresses to every visitor, and nobody would notice, because the form would
 * still render perfectly.
 *
 * Open CORS is correct here, and only here: a form exists to be embedded on
 * pages we do not know about, and this returns nothing that is not already
 * visible in the rendered form. The SUBMIT endpoint is where origin matters.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const form = await db.query.formDefinitions.findFirst({
    where: eq(formDefinitions.embedToken, token),
  });

  // A paused form answers exactly as an unknown one does, so a token cannot be
  // tested for existence by watching which error comes back.
  if (!form || !form.isActive) {
    return NextResponse.json(
      { ok: false, error: "Unknown form." },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      form: {
        token,
        name: form.name,
        fields: form.fields,
        successMessage: form.successMessage ?? "Thanks — we'll be in touch.",
        style: (form as { style?: unknown }).style ?? null,
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        // Short: a client who edits a field expects to see it on their site
        // soon, and this is a small JSON document.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
