import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, formDefinitions, formSubmissions, siteInstallations } from "@/lib/db/schema";

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

/** Fields accepted when a site has no stored definition yet — the v1 section. */
const DEFAULT_FIELDS = ["name", "email", "phone", "message"];

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

/** Origins allowed to post for this site: its own domain and its WP install. */
function allowedOrigins(domain: string | null, installUrl: string | null): string[] {
  const out: string[] = [];
  for (const value of [domain, installUrl]) {
    if (!value) continue;
    try {
      out.push(new URL(value.startsWith("http") ? value : `https://${value}`).origin);
    } catch {
      // A malformed stored domain must not throw the request away.
    }
  }
  return out;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // Echo only an origin we recognise. Never "*": that would let any page on the
  // internet post leads into a client's dashboard.
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }
  return { Vary: "Origin" };
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const token = new URL(request.url).searchParams.get("site");
  if (!token) return new NextResponse(null, { status: 204 });

  const site = await db.query.sites.findFirst({ where: eq(sites.formToken, token) });
  if (!site) return new NextResponse(null, { status: 204 });

  const install = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin, allowedOrigins(site.domain, install?.url ?? null)),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

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
      if (key === "site" || key === "website" || key === "form") continue;
      data[key] = typeof value === "string" ? value : "";
    }
    body = {
      site: form.get("site"),
      form: form.get("form"),
      website: form.get("website"),
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

  const site = await db.query.sites.findFirst({ where: eq(sites.formToken, token) });
  /*
   * Same answer for "no such token" as for a token that exists but is wrong.
   * Distinguishing them turns this into an oracle for guessing valid tokens.
   */
  if (!site) return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });

  const install = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  const headers = corsHeaders(origin, allowedOrigins(site.domain, install?.url ?? null));

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(`site:${site.id}`) || rateLimited(`ip:${ip}`)) {
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
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  const elapsed = typeof body.elapsed === "number" ? body.elapsed : Number.MAX_SAFE_INTEGER;
  if (honeypot || elapsed < MIN_FILL_MS) {
    if (isFormPost) {
      const back = request.headers.get("referer");
      return NextResponse.redirect(back ? `${back.split("#")[0]}${back.includes("?") ? "&" : "?"}sent=1` : "/", 303);
    }
    return NextResponse.json({ ok: true, message: "Thanks — we'll be in touch." }, { headers });
  }

  // What this form is actually allowed to collect.
  const formId = typeof body.form === "string" ? body.form : null;
  const definition = formId
    ? await db.query.formDefinitions.findFirst({ where: eq(formDefinitions.id, formId) })
    : null;

  // A definition belonging to another site is not this form's definition.
  const usable = definition && definition.siteId === site.id ? definition : null;
  const declared = usable
    ? (usable.fields as Array<{ name?: string }>).map((f) => f.name).filter(Boolean)
    : DEFAULT_FIELDS;

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
    siteId: site.id,
    formId: usable?.id ?? null,
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
    { ok: true, message: usable?.successMessage || "Thanks — we'll be in touch." },
    { headers },
  );
}
