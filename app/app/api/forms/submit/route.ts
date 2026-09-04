import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDefinitions, formSubmissions } from "@/lib/db/schema";

/**
 * Where a website's contact form posts.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED, BY DESIGN
 *
 * It is called by a stranger's browser on a client's website. The site token in
 * the page IDENTIFIES which site is submitting; it cannot AUTHENTICATE anything,
 * because it is visible in page source to anyone who presses View Source.
 *
 * So nothing here is trusted because it was presented. In particular:
 *
 *   - Fields are validated against the STORED definition. Whatever arrives that
 *     the form does not declare is dropped, not saved. Without this the leads
 *     table is a place any stranger can write arbitrary JSON.
 *   - Sizes are capped before anything is stored.
 *   - Submissions are rate-limited per site and per IP.
 *
 * A public write endpoint that trusts its input is the single most likely way
 * this platform gets abused, so the checks come first and the storage last.
 */

/** Nothing legitimate is longer; anything longer is someone probing. */
const MAX_FIELD_CHARS = 5000;
const MAX_FIELDS = 40;

/** A form nobody could have read and filled in this fast is not a person. */
const MIN_FILL_MS = 2000;

/*
 * In-memory rate limiting.
 *
 * HONEST LIMIT: this is per process. It is real protection for a single server
 * and no protection at all across several, so a multi-instance deployment needs
 * this moved to Redis or the database before launch. Written here rather than
 * omitted because "no limiter" is worse than "a limiter with a known ceiling",
 * and leaving it out invites forgetting it entirely.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

/*
 * Any origin may post, and that is the correct answer here.
 *
 * The point of an embeddable form is that it lives on pages we do not know
 * about — a client's WordPress, a landing page, someone else's platform. An
 * allow-list of the site's own domain blocked exactly the case the feature
 * exists for: a form embedded elsewhere failed with a CORS error the visitor
 * saw as "check your connection".
 *
 * Nothing is lost by opening it, because CORS was never the protection. It
 * constrains browsers only — the token is public, so anyone determined can
 * POST from a shell with no origin at all. What actually holds the line is
 * unchanged and does not care where the request came from: submissions are
 * validated against the form's own declared fields, rate-limited per form and
 * per IP, and screened by honeypot and timing.
 *
 * Safe as `*` specifically because this endpoint uses no cookies and no
 * credentials; there is no ambient authority for another origin to borrow.
 */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  // No lookup: the preflight reveals nothing and must not be a way to test
  // whether a token exists.
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  /*
   * Two content types, because the form genuinely works without JavaScript.
   *
   * The script sends JSON. A browser with scripting disabled sends the same
   * form as urlencoded, and that has to work — the section's whole claim to
   * being a real <form> rests on it. Without this branch the no-JS path would
   * have failed with a 400 that nobody would have noticed until a visitor with
   * scripts off tried to make an enquiry.
   */
  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded");

  let body: Record<string, unknown>;
  if (isFormPost) {
    const form = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key === "site" || key === "vw_hp" || key === "form") continue;
      data[key] = typeof value === "string" ? value : "";
    }
    body = {
      site: form.get("site"),
      form: form.get("form"),
      website: form.get("vw_hp"),
      // No timing signal without scripting, so the check cannot apply here.
      elapsed: Number.MAX_SAFE_INTEGER,
      page: request.headers.get("referer"),
      referrer: request.headers.get("referer"),
      data,
    };
  } else {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
    }
  }

  const token = typeof body.site === "string" ? body.site : "";
  if (!token) return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });

  /*
   * The token identifies a FORM, not a site.
   *
   * Same answer for "no such token", "wrong token" and "form switched off":
   * distinguishing them turns this into an oracle for guessing valid tokens,
   * and a deactivated form should look exactly like one that never existed.
   */
  const form = await db.query.formDefinitions.findFirst({
    where: eq(formDefinitions.embedToken, token),
  });
  if (!form || !form.isActive) {
    return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });
  }

  const headers = corsHeaders();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(`form:${form.id}`) || rateLimited(`ip:${ip}`)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again shortly." }, {
      status: 429,
      headers,
    });
  }

  /*
   * Both spam checks answer 200 with the ordinary success message.
   *
   * Telling a bot it was detected is free feedback for tuning around the check.
   * A person can never trip these — the honeypot is off-screen and nobody reads
   * and completes a form in two seconds — so silently discarding costs nothing.
   */
  /*
   * The old field was called "website" — a real autocomplete token, so browsers
   * filled it and genuine enquiries were discarded as spam. Pages exported
   * before the rename still send it; it is deliberately IGNORED rather than
   * honoured, because losing a real lead is worse than accepting some spam
   * until those pages are exported again.
   */
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  const elapsed = typeof body.elapsed === "number" ? body.elapsed : Number.MAX_SAFE_INTEGER;
  if (honeypot || elapsed < MIN_FILL_MS) {
    /*
     * Recorded, because this is the one path that throws a submission away and
     * answers as though it succeeded.
     *
     * That silence is deliberate — telling a bot it was detected is free
     * feedback for tuning around the check — but it also meant a honeypot
     * filled by browser AUTOFILL discarded real enquiries with nothing to see
     * anywhere. The client is still told "thanks"; we now know it happened.
     */
    console.warn(
      "[forms] submission discarded:",
      JSON.stringify({
        form: form.id,
        reason: honeypot ? "honeypot" : "too-fast",
        elapsed,
        ua: request.headers.get("user-agent")?.slice(0, 120) ?? null,
      }),
    );
    if (isFormPost) {
      const back = request.headers.get("referer");
      return NextResponse.redirect(back ? `${back.split("#")[0]}${back.includes("?") ? "&" : "?"}sent=1` : "/", 303);
    }
    return NextResponse.json({ ok: true, message: "Thanks — we'll be in touch." }, { headers });
  }

  // What this form is allowed to collect — its own declared fields.
  const declared = (form.fields as Array<{ name?: string }>).map((f) => f.name).filter(Boolean);
  if (declared.length === 0) {
    return NextResponse.json({ ok: false, error: "This form has no fields yet." }, { status: 400, headers });
  }

  const submitted = (body.data ?? {}) as Record<string, unknown>;
  if (Object.keys(submitted).length > MAX_FIELDS) {
    return NextResponse.json({ ok: false, error: "Too many fields." }, { status: 400, headers });
  }

  /*
   * Allow-list, not deny-list: build the record from what the FORM declares,
   * never from what the request contains. Anything else is dropped silently.
   */
  const data: Record<string, string> = {};
  for (const name of declared) {
    const raw = submitted[name as string];
    if (raw === undefined || raw === null) continue;
    data[name as string] = String(raw).slice(0, MAX_FIELD_CHARS);
  }

  if (Object.values(data).every((v) => v.trim() === "")) {
    return NextResponse.json({ ok: false, error: "Please fill in the form." }, { status: 400, headers });
  }

  await db.insert(formSubmissions).values({
    siteId: form.siteId,
    formId: form.id,
    data,
    meta: {
      ip,
      userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      page: typeof body.page === "string" ? body.page.slice(0, 500) : null,
      referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    },
  });

  /*
   * A form post gets a redirect, not JSON: without scripting the browser would
   * otherwise render our response body as the whole page. `?sent=1` back on the
   * page they came from lets the theme show a confirmation.
   */
  if (isFormPost) {
    const back = request.headers.get("referer");
    return NextResponse.redirect(back ? `${back.split("#")[0]}${back.includes("?") ? "&" : "?"}sent=1` : "/", 303);
  }

  return NextResponse.json(
    { ok: true, message: form.successMessage || "Thanks — we'll be in touch." },
    { headers },
  );
}
