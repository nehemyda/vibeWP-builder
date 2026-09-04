/**
 * VibeWP form embed.
 *
 * One snippet on any page:
 *   <div data-vibewp-form="frm_..."></div>
 *   <script src="https://…/embed.js" async></script>
 *
 * ─────────────────────────────────────────────────────────────────────
 * RENDERED INLINE, NOT IN AN IFRAME
 *
 * An iframe would be simpler and fully isolated, but it never inherits the
 * host page's typeface or colour, so it always reads as a foreign box bolted
 * onto someone's site. Inline markup inherits them for free — which is the
 * whole point of embedding rather than linking.
 *
 * The cost is that the host's stylesheet can reach these elements. Every rule
 * is therefore scoped to .vibewp-form and expressed through custom properties
 * with fallbacks, so a client can restyle it deliberately while a stray
 * `input { }` on their site cannot wreck it.
 *
 * NO DEPENDENCIES, NO GLOBALS
 *
 * This runs on other people's websites. It must not assume a framework, must
 * not collide with anything already loaded, and must fail quietly: a form that
 * cannot load leaves the page exactly as it found it.
 */
(function () {
  "use strict";

  var ORIGIN = (function () {
    // Where this script was served from IS the API — nothing to configure,
    // and it keeps a self-hosted deployment working without an edit.
    var el = document.currentScript;
    if (el && el.src) { try { return new URL(el.src).origin; } catch (e) { /* fall through */ } }
    return "";
  })();

  var STYLE_ID = "vibewp-form-style";

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".vibewp-form{--vwf-gap:14px;--vwf-radius:10px;--vwf-border:#d9dde5;--vwf-accent:#111;" +
      "--vwf-accent-text:#fff;--vwf-label:inherit;--vwf-bg:transparent;--vwf-pad:0;" +
      "display:grid;grid-template-columns:repeat(12,1fr);gap:var(--vwf-gap);" +
      "background:var(--vwf-bg);padding:var(--vwf-pad);border-radius:var(--vwf-radius);" +
      "max-width:var(--vwf-max,none);box-sizing:border-box}" +
      ".vibewp-form *{box-sizing:border-box}" +
      ".vibewp-form__field{display:flex;flex-direction:column;gap:6px;min-width:0}" +
      ".vibewp-form__label{font-size:var(--vwf-label-size,.85rem);font-weight:var(--vwf-label-weight,600);color:var(--vwf-label)}" +
      ".vibewp-form__req{color:var(--vwf-accent);margin-left:2px}" +
      ".vibewp-form__control{width:100%;font:inherit;font-size:var(--vwf-input-size,.95rem);" +
      "padding:var(--vwf-input-pad,10px 12px);border:1px solid var(--vwf-border);" +
      "border-radius:var(--vwf-radius);background:var(--vwf-input-bg,#fff);color:inherit}" +
      ".vibewp-form__control:focus{outline:none;border-color:var(--vwf-accent);" +
      "box-shadow:0 0 0 3px color-mix(in srgb,var(--vwf-accent) 20%,transparent)}" +
      ".vibewp-form textarea.vibewp-form__control{resize:vertical;min-height:var(--vwf-textarea-height,120px)}" +
      /* Placeholder is its own size and colour: at the input's size it competes
         with a real answer, which is how people mistake it for filled in. */
      ".vibewp-form__control::placeholder{font-size:var(--vwf-ph-size,inherit);color:var(--vwf-ph-color,#8a91a0);opacity:1}" +
      ".vibewp-form__check{flex-direction:row;align-items:center;gap:8px}" +
      ".vibewp-form__check .vibewp-form__control{width:auto}" +
      ".vibewp-form__submit{grid-column:span 12;justify-self:var(--vwf-btn-justify,start);" +
      "font:inherit;font-size:var(--vwf-btn-size,.95rem);font-weight:600;cursor:pointer;" +
      "padding:var(--vwf-btn-pad,11px 22px);border:0;border-radius:var(--vwf-radius);" +
      "background:var(--vwf-accent);color:var(--vwf-accent-text)}" +
      ".vibewp-form__submit[disabled]{opacity:.6;cursor:default}" +
      ".vibewp-form__hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
      ".vibewp-form__status{grid-column:span 12;margin:0;font-size:.9rem}" +
      ".vibewp-form__status[data-state=error]{color:#b3261e}" +
      "@media(max-width:560px){.vibewp-form__field{grid-column:span 12 !important}}";
    var tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /** Clamped, because a bad span would collapse a row or overflow it. */
  function spanOf(f) {
    /* Type-aware default: 6 for everything put a textarea at half width, which
       is what a form saved before spans existed still renders as. */
    var fallback = f.width === "full" || f.type === "textarea" ? 12 : 6;
    var n = typeof f.span === "number" ? f.span : fallback;
    return Math.min(12, Math.max(1, Math.round(n)));
  }

  /*
   * Built with createElement and textContent, never innerHTML.
   *
   * Labels and choices are client-authored text. Interpolating them into an
   * HTML string would let a form's own label inject script onto every page it
   * is embedded in — including sites belonging to someone else.
   */
  function controlFor(f, id) {
    var el;
    if (f.type === "textarea") {
      el = document.createElement("textarea");
      el.rows = 5;
    } else if (f.type === "select") {
      el = document.createElement("select");
      (f.options || []).forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        el.appendChild(o);
      });
    } else {
      el = document.createElement("input");
      el.type = f.type === "tel" ? "tel" : f.type;
    }
    el.id = id;
    el.name = f.name;
    el.className = "vibewp-form__control";
    if (f.required) el.required = true;
    if (f.placeholder && el.tagName !== "SELECT") el.placeholder = f.placeholder;
    return el;
  }

  /** The last mount + definition rendered, so the editor can replace them. */
  var current = { mount: null, def: null };

  function render(mount, def) {
    current = { mount: mount, def: def };
    injectStyleOnce();

    var form = document.createElement("form");
    form.className = "vibewp-form";
    form.method = "post";
    form.action = ORIGIN + "/api/forms/submit";
    form.style.position = "relative"; // anchors the off-screen honeypot

    // Client-chosen styling arrives as tokens, set as custom properties —
    // never as a stylesheet, which would let stored text become CSS.
    if (def.style && typeof def.style === "object") {
      Object.keys(def.style).forEach(function (k) {
        if (/^[a-z0-9-]+$/i.test(k)) form.style.setProperty("--vwf-" + k, String(def.style[k]));
      });
    }

    (def.fields || []).forEach(function (f, i) {
      if (!f || !f.name) return;
      var id = "vwf-" + def.token + "-" + i;
      var wrap = document.createElement("div");
      wrap.className = "vibewp-form__field" + (f.type === "checkbox" ? " vibewp-form__check" : "");
      wrap.style.gridColumn = "span " + spanOf(f);

      var label = document.createElement("label");
      label.className = "vibewp-form__label";
      label.htmlFor = id;
      label.textContent = f.label || f.name;
      if (f.required) {
        var star = document.createElement("span");
        star.className = "vibewp-form__req";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        label.appendChild(star);
      }

      if (f.type === "checkbox") {
        wrap.appendChild(controlFor(f, id));
        wrap.appendChild(label);
      } else {
        wrap.appendChild(label);
        wrap.appendChild(controlFor(f, id));
      }
      form.appendChild(wrap);
    });

    var hp = document.createElement("div");
    hp.className = "vibewp-form__hp";
    hp.setAttribute("aria-hidden", "true");
    var hpInput = document.createElement("input");
    hpInput.type = "text";
    hpInput.name = "website";
    hpInput.tabIndex = -1;
    hpInput.autocomplete = "off";
    hp.appendChild(hpInput);
    form.appendChild(hp);

    var site = document.createElement("input");
    site.type = "hidden";
    site.name = "site";
    site.value = def.token;
    form.appendChild(site);

    var button = document.createElement("button");
    button.type = "submit";
    button.className = "vibewp-form__submit";
    button.textContent = (def.style && def.style["btn-label"]) || def.submitLabel || "Send";
    form.appendChild(button);

    var status = document.createElement("p");
    status.className = "vibewp-form__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.appendChild(status);

    var shownAt = Date.now();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === "submit" || el.name === "site" || el.name === "website") return;
        data[el.name] = el.type === "checkbox" ? (el.checked ? "yes" : "") : el.value;
      });

      var label = button.textContent;
      button.disabled = true;
      button.textContent = "Sending…";
      status.textContent = "";
      status.removeAttribute("data-state");

      fetch(ORIGIN + "/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: def.token,
          data: data,
          website: hpInput.value,
          elapsed: Date.now() - shownAt,
          page: window.location.href,
          referrer: document.referrer || null
        })
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (body) {
          if (body && body.ok) {
            // Replaced, not merely messaged: leaving a filled form beside a
            // success note invites a second submit, and duplicate enquiries
            // are a real nuisance for whoever answers them.
            var done = document.createElement("p");
            done.className = "vibewp-form__status";
            done.setAttribute("role", "status");
            done.textContent = body.message || def.successMessage;
            form.parentNode.replaceChild(done, form);
            return;
          }
          button.disabled = false;
          button.textContent = label;
          status.setAttribute("data-state", "error");
          status.textContent = (body && body.error) || "Something went wrong. Please try again.";
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = label;
          status.setAttribute("data-state", "error");
          status.textContent = "Couldn't send that. Check your connection and try again.";
        });
    });

    mount.textContent = "";
    mount.appendChild(form);

    /*
     * Tell the opener we are ready to be restyled.
     *
     * The editor used to push its definition on the iframe's load event, but
     * this script FETCHES before it renders — so that push landed while there
     * was nothing mounted, was dropped, and the stored version stayed on screen
     * looking like a save that had not worked. Announcing readiness inverts it:
     * the editor answers a fact instead of guessing at a moment.
     */
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: "vibewp:ready" }, ORIGIN || "*");
      } catch (e) { /* not embedded, or a stricter parent — harmless */ }
    }
  }

  /*
   * Live restyling from the editor's preview popup.
   *
   * The popup shows this same script inside an iframe, so style changes must
   * reach an already-rendered form without refetching or re-rendering it —
   * dragging a slider cannot mean a round trip per pixel. Tokens are applied
   * as custom properties, the same ones the stylesheet already reads.
   *
   * Guarded to same-origin: the editor is on our domain, and a form embedded
   * on a client's site must not be restylable by whatever else that page runs.
   */
  window.addEventListener("message", function (event) {
    if (event.origin !== ORIGIN) return;
    var msg = event.data;
    if (!msg) return;

    /*
     * The editor's unsaved definition.
     *
     * The preview fetches what is STORED, so a field resized but not yet saved
     * rendered at its old width — the preview quietly disagreed with the editor
     * beside it, which is worse than having no preview at all. This re-renders
     * from whatever the editor currently holds.
     */
    if (msg.type === "vibewp:fields" && msg.form && current.mount) {
      render(current.mount, {
        token: current.def ? current.def.token : msg.form.token,
        fields: msg.form.fields || [],
        successMessage: msg.form.successMessage || "Thanks — we'll be in touch.",
        style: msg.form.style || {},
        submitLabel: msg.form.submitLabel
      });
      return;
    }

    if (msg.type !== "vibewp:style" || typeof msg.style !== "object") return;
    var form = document.querySelector(".vibewp-form");
    if (!form) return;
    Object.keys(msg.style).forEach(function (k) {
      if (!/^[a-z0-9-]+$/i.test(k)) return;
      var v = msg.style[k];
      if (v === "" || v == null) form.style.removeProperty("--vwf-" + k);
      else form.style.setProperty("--vwf-" + k, String(v));
    });
    if (typeof msg.style["btn-label"] === "string") {
      var b = form.querySelector(".vibewp-form__submit");
      if (b) b.textContent = msg.style["btn-label"] || "Send";
    }
  });

  function boot() {
    var mounts = document.querySelectorAll("[data-vibewp-form]:not([data-vibewp-ready])");
    Array.prototype.forEach.call(mounts, function (mount) {
      // Marked before fetching, so a second copy of the script — easy to end up
      // with on a page built from several templates — cannot render it twice.
      mount.setAttribute("data-vibewp-ready", "1");
      var token = mount.getAttribute("data-vibewp-form");
      if (!token) return;

      fetch(ORIGIN + "/api/forms/" + encodeURIComponent(token))
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body && body.ok) render(mount, body.form);
        })
        .catch(function () {
          /* Leave the page as we found it. A missing form is not worth an
             error message on somebody's website. */
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
