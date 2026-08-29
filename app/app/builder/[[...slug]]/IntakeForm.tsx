"use client";

import { useEffect, useState } from "react";
import styles from "./intake.module.css";
import { saveIntakeAction, type IntakeData } from "@/app/actions/intake";
import { PALETTES, paletteByKey, isHexColor } from "@/lib/brand/palettes";
import { extractPalette, type LogoPalette } from "@/lib/brand/logo-colors";
import { LOGO_MAX_BYTES } from "@/lib/business/logo";
import { DAY_LABELS, DAYS, type Day, type OpeningHours } from "@/lib/business/hours";
import {
  detectBusinessDriftAction,
  pullBusinessDetailsAction,
  type BusinessFieldDrift,
} from "@/app/actions/business-sync";

/**
 * The intake form, over the whole builder.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A FULL COVER AND NOT A MODAL
 *
 * On a first build there is nothing behind this worth seeing — an empty canvas
 * and a chat with one greeting. A translucent modal over that shows the client
 * a half-lit empty page while asking them to concentrate on eleven fields. So
 * this covers completely and opaquely: while the form is open, the form is the
 * screen.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THREE STEPS
 *
 * Eleven fields in one column reads as paperwork and gets abandoned. Grouped as
 * "who you are / what you sell / how it looks" each step is answerable without
 * scrolling, and the last one is a colour choice — ending on the enjoyable part
 * rather than on SEO keywords.
 */

type Step = 0 | 1 | 2;

export function IntakeForm({
  siteId,
  initial,
  isFirstBuild,
  onDone,
  onCancel,
}: {
  siteId: string;
  initial: IntakeData;
  /** Changes the copy and hides Cancel: a first build has nothing to go back to. */
  isFirstBuild: boolean;
  /**
   * `rebuild` says whether to regenerate the page as well as save.
   *
   * Two different intentions, so two different buttons. Correcting a phone
   * number and rewriting every word on the site are not the same request, and
   * a rebuild would discard any copy already edited by hand.
   */
  onDone: (summary: string, rebuild: boolean, facts: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<IntakeData>(initial);
  const [saving, setSaving] = useState<null | "save" | "rebuild">(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Fields the client has changed in WordPress since the last export.
   *
   * Checked when the form opens, matching how page content already announces a
   * WordPress-side edit. Without it, opening this form showed stale values and
   * saving would quietly push them back over the client's correction.
   */
  const [drift, setDrift] = useState<BusinessFieldDrift[]>([]);
  const [pulling, setPulling] = useState(false);
  /** Colours read out of the logo, offered on the colour step. */
  const [logoPalette, setLogoPalette] = useState<LogoPalette | null>(null);
  const [logoNote, setLogoNote] = useState<string | null>(null);

  /**
   * Reads a picked logo: downscale, store as a data URL, and suggest colours.
   *
   * All of it happens in the browser. The file is already here, so uploading it
   * merely to be told what colour it is would be a round trip for nothing — and
   * the downscale is what keeps the stored data URL small enough to live in a
   * database column.
   */
  async function onLogoPicked(file: File | null) {
    if (!file) return;
    setLogoNote(null);

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setLogoNote("Use a PNG, JPG or WebP. SVG isn't supported.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);

      /*
       * Fit the file to the budget instead of rejecting it.
       *
       * Asking a client to go and shrink their own logo is asking them to do a
       * job the browser can do instantly, and "under 400KB" is not a fact most
       * people know about their own files. So this steps down until it fits:
       * 512px as PNG (which keeps transparency), then WebP — which also keeps
       * transparency and compresses several times better — at falling quality,
       * then smaller dimensions.
       *
       * A 12-megapixel photo dropped in by mistake therefore still works; it
       * just ends up as a small WebP.
       */
      const attempts: Array<{ size: number; type: string; quality?: number }> = [
        { size: 512, type: "image/png" },
        { size: 512, type: "image/webp", quality: 0.92 },
        { size: 512, type: "image/webp", quality: 0.8 },
        { size: 384, type: "image/webp", quality: 0.8 },
        { size: 256, type: "image/webp", quality: 0.75 },
        { size: 192, type: "image/webp", quality: 0.7 },
      ];

      let dataUrl = "";
      let ctx: CanvasRenderingContext2D | null = null;
      let w = 0;
      let h = 0;

      for (const attempt of attempts) {
        const scale = Math.min(1, attempt.size / Math.max(bitmap.width, bitmap.height));
        w = Math.max(1, Math.round(bitmap.width * scale));
        h = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext("2d", { willReadFrequently: true });
        if (!c) throw new Error("no canvas context");
        c.drawImage(bitmap, 0, 0, w, h);

        const candidate = canvas.toDataURL(attempt.type, attempt.quality);
        ctx = c;
        dataUrl = candidate;
        if (candidate.length <= LOGO_MAX_BYTES) break;
      }

      if (!ctx || dataUrl.length > LOGO_MAX_BYTES) {
        setLogoNote("Couldn't compress that image small enough. Try a simpler logo file.");
        return;
      }

      set("logoUrl", dataUrl);

      const palette = extractPalette(ctx.getImageData(0, 0, w, h));
      setLogoPalette(palette);

      if (!palette) {
        setLogoNote(
          "That logo is black and white, so there's no brand colour to take from it — pick a palette below.",
        );
        return;
      }

      // Auto-fill, as asked: the suggestion is applied rather than merely offered.
      setData((d) => ({ ...d, colors: { ...d.colors, primary: palette.primary } }));
      setLogoNote(
        palette.adjustedForContrast
          ? "Taken your logo's colour and deepened it slightly so button text stays readable."
          : "Colour taken from your logo.",
      );
    } catch {
      setLogoNote("Couldn't read that image. Try a different file.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void detectBusinessDriftAction(siteId)
      .then((r) => {
        if (!cancelled && r.ok) setDrift(r.drift);
      })
      // Detection is advisory: a site that was never exported, or a WordPress
      // that is down, must not stop anyone editing their details.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  async function pullFromWordPress() {
    setPulling(true);
    setError(null);
    try {
      const result = await pullBusinessDetailsAction(siteId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      /*
       * Apply to the open form as well as the database, so what is on screen
       * matches what was just taken. Only the pullable fields move; address and
       * hours stay for the client to retype, and their WordPress values remain
       * on show until they do.
       */
      const remaining = drift.filter((d) => !d.pullable);
      setData((d) => {
        const next = { ...d };
        for (const item of drift) {
          if (!item.pullable) continue;
          if (item.field === "business_name") next.businessName = item.wordpress;
          if (item.field === "phone") next.phone = item.wordpress;
          if (item.field === "email") next.email = item.wordpress;
        }
        return next;
      });
      setDrift(remaining);
    } finally {
      setPulling(false);
    }
  }

  const set = <K extends keyof IntakeData>(key: K, value: IntakeData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  function setDay(day: Day, patch: Partial<OpeningHours[number]>) {
    set(
      "hours",
      data.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    );
  }

  function choosePalette(key: string) {
    // Take the preset's colours wholesale — a half-applied palette (new accent,
    // old ink) is the one combination nobody designed.
    setData((d) => ({ ...d, paletteKey: key, colors: { ...paletteByKey(key).colors } }));
  }

  const services = data.services;
  const canSubmit = data.businessName.trim().length > 0;

  async function submit(rebuild: boolean) {
    if (!canSubmit || saving) return;
    setSaving(rebuild ? "rebuild" : "save");
    setError(null);
    try {
      const result = await saveIntakeAction({ siteId, data });
      if (result.ok) onDone(result.summary, rebuild, result.facts);
      else setError(result.error);
    } catch {
      setError("Couldn't save those details. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={styles.cover} role="dialog" aria-modal="true" aria-label="Business details">
      <div className={styles.panel}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>
              {isFirstBuild ? "Tell us about your business" : "Business details"}
            </h1>
            <p className={styles.sub}>
              {isFirstBuild
                ? "Everything here goes straight into your site — and nothing gets invented, so the more you fill in, the better it comes out."
                : "Update these and they'll flow through to your site."}
            </p>
          </div>
          {!isFirstBuild && (
            <button type="button" className={styles.close} onClick={onCancel} aria-label="Close">
              ✕
            </button>
          )}
        </header>

        <nav className={styles.steps} aria-label="Progress">
          {["Your business", "What you offer", "How it looks"].map((label, i) => (
            <button
              key={label}
              type="button"
              className={`${styles.stepChip} ${step === i ? styles.stepOn : ""}`}
              onClick={() => setStep(i as Step)}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>

        {drift.length > 0 && (
          <div className={styles.drift}>
            <strong className={styles.driftTitle}>
              {drift.length === 1
                ? "One detail was changed in WordPress"
                : `${drift.length} details were changed in WordPress`}
            </strong>
            <p className={styles.driftNote}>
              Someone edited these on the live site. Saving without taking them would push
              these older values back over their change.
            </p>
            <ul className={styles.driftList}>
              {drift.map((d) => (
                <li key={d.field}>
                  <span className={styles.driftLabel}>{d.label}</span>
                  <span className={styles.driftWas}>{d.vibewp || "(empty)"}</span>
                  <span className={styles.driftArrow}>→</span>
                  <span className={styles.driftNow}>{d.wordpress}</span>
                  {!d.pullable && (
                    <em className={styles.driftManual}>
                      type this in below — VibeWP stores it in separate fields
                    </em>
                  )}
                </li>
              ))}
            </ul>
            {drift.some((d) => d.pullable) && (
              <button
                type="button"
                className={styles.driftBtn}
                onClick={() => void pullFromWordPress()}
                disabled={pulling}
              >
                {pulling ? "Taking…" : "Use the WordPress values"}
              </button>
            )}
          </div>
        )}

        <div className={styles.body}>
          {step === 0 && (
            <div className={styles.grid}>
              <div className={styles.span2}>
                <p className={styles.legend}>Logo</p>
                <p className={styles.legendHint}>
                  Optional. If you add one we&rsquo;ll take your brand colour from it, and it
                  replaces the business name at the top of your site.
                </p>
                <div className={styles.logoRow}>
                  <div className={styles.logoPreview}>
                    {data.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.logoUrl} alt="Your logo" />
                    ) : (
                      <span className={styles.logoEmpty}>No logo</span>
                    )}
                  </div>
                  <div className={styles.logoActions}>
                    <label className={styles.logoBtn}>
                      {data.logoUrl ? "Replace logo" : "Upload a logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => void onLogoPicked(e.target.files?.[0] ?? null)}
                        hidden
                      />
                    </label>
                    {data.logoUrl && (
                      <button
                        type="button"
                        className={styles.logoRemove}
                        onClick={() => {
                          set("logoUrl", "");
                          setLogoPalette(null);
                          setLogoNote(null);
                        }}
                      >
                        Remove
                      </button>
                    )}
                    <span className={styles.logoHint}>PNG, JPG or WebP</span>
                  </div>
                </div>
                {logoNote && <p className={styles.logoNote}>{logoNote}</p>}
              </div>

              <Field label="Business name" required span2>
                <input
                  className={styles.input}
                  value={data.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                  placeholder="Sunrise Bakery"
                />
              </Field>
              <Field label="Phone" hint="Shown on the site and used for click-to-call">
                <input
                  className={styles.input}
                  value={data.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="01225 000 000"
                />
              </Field>
              <Field label="Email">
                <input
                  className={styles.input}
                  type="email"
                  value={data.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="hello@example.com"
                />
              </Field>
              <Field label="Street address" span2>
                <input
                  className={styles.input}
                  value={data.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="14 Market Street"
                />
              </Field>
              <Field label="Town or city">
                <input
                  className={styles.input}
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="Bath"
                />
              </Field>
              <Field label="Postcode">
                <input
                  className={styles.input}
                  value={data.postcode}
                  onChange={(e) => set("postcode", e.target.value)}
                  placeholder="BA1 1AA"
                />
              </Field>

              <div className={styles.span2}>
                <p className={styles.legend}>Opening hours</p>
                <div className={styles.hours}>
                  {DAYS.map((day) => {
                    const h = data.hours.find((x) => x.day === day)!;
                    return (
                      <div key={day} className={styles.hourRow}>
                        <span className={styles.dayName}>{DAY_LABELS[day]}</span>
                        <label className={styles.closedBox}>
                          <input
                            type="checkbox"
                            checked={h.closed}
                            onChange={(e) => setDay(day, { closed: e.target.checked })}
                          />
                          Closed
                        </label>
                        <input
                          type="time"
                          className={styles.time}
                          value={h.open}
                          disabled={h.closed}
                          onChange={(e) => setDay(day, { open: e.target.value })}
                        />
                        <span className={styles.dash}>–</span>
                        <input
                          type="time"
                          className={styles.time}
                          value={h.close}
                          disabled={h.closed}
                          onChange={(e) => setDay(day, { close: e.target.value })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className={styles.grid}>
              <div className={styles.span2}>
                <p className={styles.legend}>Services</p>
                <p className={styles.legendHint}>
                  Name them as a customer would search for them. We&rsquo;ll write the
                  descriptions — we won&rsquo;t add services you don&rsquo;t offer.
                </p>
                <div className={styles.services}>
                  {services.map((s, i) => (
                    <div key={i} className={styles.serviceRow}>
                      <input
                        className={styles.input}
                        value={s.name}
                        onChange={(e) =>
                          set(
                            "services",
                            services.map((x, j) => (j === i ? { name: e.target.value } : x)),
                          )
                        }
                        placeholder="Wedding cakes"
                      />
                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => set("services", services.filter((_, j) => j !== i))}
                        aria-label={`Remove service ${i + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => set("services", [...services, { name: "" }])}
                  >
                    + Add a service
                  </button>
                </div>
              </div>

              <Field label="About the business" span2 hint="A few sentences in your own words">
                <textarea
                  className={styles.textarea}
                  rows={5}
                  value={data.about}
                  onChange={(e) => set("about", e.target.value)}
                  placeholder="We've baked on Market Street since 2011. Everything is made on site each morning…"
                />
              </Field>

              <Field
                label="Search keywords"
                span2
                hint="What people type into Google to find a business like yours, comma separated"
              >
                <input
                  className={styles.input}
                  value={data.seoKeywords}
                  onChange={(e) => set("seoKeywords", e.target.value)}
                  placeholder="bakery bath, sourdough, birthday cakes"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className={styles.legend}>Colours</p>
              <p className={styles.legendHint}>
                Pick a palette, then fine-tune the main colour if you have a brand shade to
                match.
              </p>

              <div className={styles.palettes}>
                {PALETTES.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    className={`${styles.palette} ${data.paletteKey === p.key ? styles.paletteOn : ""}`}
                    onClick={() => choosePalette(p.key)}
                  >
                    <span className={styles.swatches}>
                      <span style={{ background: p.colors.primary }} />
                      <span style={{ background: p.colors.ink }} />
                      <span style={{ background: p.colors["surface-2"] }} />
                    </span>
                    <span className={styles.paletteName}>{p.name}</span>
                    <span className={styles.paletteDesc}>{p.description}</span>
                  </button>
                ))}
              </div>

              {logoPalette && (
                <div className={styles.fromLogo}>
                  <p className={styles.fromLogoTitle}>From your logo</p>
                  <div className={styles.fromLogoSwatches}>
                    {logoPalette.candidates.map((c) => (
                      <button
                        type="button"
                        key={c.hex}
                        className={`${styles.logoSwatch} ${
                          data.colors.primary.toLowerCase() === c.hex.toLowerCase()
                            ? styles.logoSwatchOn
                            : ""
                        }`}
                        style={{ background: c.hex }}
                        title={c.hex}
                        aria-label={`Use ${c.hex}`}
                        onClick={() => set("colors", { ...data.colors, primary: c.hex })}
                      />
                    ))}
                  </div>
                  {logoPalette.adjustedForContrast && (
                    <p className={styles.fromLogoNote}>
                      Your logo&rsquo;s exact shade was too light for button text, so the
                      applied colour is a little deeper. The original is still offered above.
                    </p>
                  )}
                </div>
              )}

              <div className={styles.customRow}>
                <label className={styles.customLabel} htmlFor="brandColor">
                  Main colour
                </label>
                <input
                  id="brandColor"
                  type="color"
                  className={styles.colorInput}
                  value={data.colors.primary}
                  onChange={(e) => set("colors", { ...data.colors, primary: e.target.value })}
                />
                <input
                  className={styles.hexInput}
                  value={data.colors.primary}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Accept it while typing; the action drops anything that
                    // isn't a hex value, so a half-typed "#f5" can't be saved.
                    set("colors", { ...data.colors, primary: v });
                  }}
                  aria-invalid={!isHexColor(data.colors.primary)}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={() => choosePalette(data.paletteKey)}
                >
                  Reset
                </button>
              </div>

              <div
                className={styles.previewCard}
                style={{
                  background: data.colors.surface,
                  borderColor: data.colors.line,
                }}
              >
                <p className={styles.previewEyebrow} style={{ color: data.colors.primary }}>
                  PREVIEW
                </p>
                <p className={styles.previewHeading} style={{ color: data.colors.ink }}>
                  {data.businessName.trim() || "Your business"}
                </p>
                <p className={styles.previewBody} style={{ color: data.colors["ink-2"] }}>
                  This is roughly how your headings, body text and buttons will sit together.
                </p>
                <span
                  className={styles.previewBtn}
                  style={{
                    background: isHexColor(data.colors.primary) ? data.colors.primary : "#f54900",
                    color: data.colors["primary-fg"],
                  }}
                >
                  Get in touch
                </span>
              </div>
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <footer className={styles.foot}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
            disabled={step === 0}
          >
            Back
          </button>

          <span className={styles.footSpacer} />

          {step < 2 ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setStep((s) => ((s + 1) as Step))}
            >
              Continue
            </button>
          ) : isFirstBuild ? (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void submit(true)}
              disabled={!canSubmit || Boolean(saving)}
            >
              {saving ? "Building…" : "Build my site"}
            </button>
          ) : (
            <>
              {/*
                Rebuilding is offered but never the default. It is the right
                choice after adding a service — the copy has to mention it — and
                the wrong one after fixing a typo in a phone number, since it
                rewrites every word on the page.
              */}
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => void submit(true)}
                disabled={!canSubmit || Boolean(saving)}
                title="Saves, then writes the page again from scratch"
              >
                {saving === "rebuild" ? "Rebuilding…" : "Save and rebuild page"}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void submit(false)}
                disabled={!canSubmit || Boolean(saving)}
              >
                {saving === "save" ? "Saving…" : "Save details"}
              </button>
            </>
          )}
        </footer>

        {!canSubmit && step === 2 && (
          <p className={styles.hintFoot}>A business name is needed before we can build.</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  span2,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={span2 ? styles.span2 : undefined}>
      <span className={styles.label}>
        {label}
        {required && <span className={styles.req}> *</span>}
      </span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
