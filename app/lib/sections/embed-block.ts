import { group, heading, paragraph, htmlBlock, escAttr } from "@/lib/wp/blocks";
import { text } from "./shared";
import { EMBED_PROVIDERS, resolveEmbed } from "@/lib/embeds/providers";
import type { SectionDefinition } from "./types";

export type EmbedBlockProps = {
  heading?: string;
  body?: string;
  /** A key from EMBED_PROVIDERS — chosen, never sniffed from the URL. */
  provider?: string;
  /** What the client pasted, kept exactly so the field shows it back to them. */
  url?: string;
  height?: number;
};

/**
 * Something from elsewhere, on the page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS IS INSTEAD OF
 *
 * A WordPress plugin cannot run on a Vibe site — it is PHP inside WordPress,
 * and there is no WordPress. But most of what a local business calls a plugin
 * is not one: a booking page, a map, a video. Each of those is a URL its owner
 * already publishes, and framing it needs no plugin on either side.
 *
 * So this is the Vibe answer to "can I add a plugin", and it has the property
 * the plugin route never could: identical markup works on an exported
 * WordPress site, because a sandboxed iframe in a core/html block is as valid
 * there as here.
 *
 * WHY THE PROVIDER IS A FIELD AND NOT DETECTED
 *
 * The client says where it comes from, and the URL is checked against that
 * choice. Sniffing the provider from the host means a typo silently becomes a
 * different provider, and a look-alike host — calendly.evil.com — is precisely
 * the typo worth catching. See resolveEmbed.
 *
 * WHY AN UNRESOLVABLE URL RENDERS NOTHING
 *
 * No frame is emitted at all. A published page must never tell a visitor that
 * nothing was embedded, and an empty styled container hidden by CSS is the
 * shape verify-carry exists to catch. The heading and intro still render, so
 * the section is a section rather than a hole.
 * ─────────────────────────────────────────────────────────────────────
 */
export const EmbedBlock: SectionDefinition<EmbedBlockProps> = {
  key: "embed-block",
  nodeType: "EmbedBlock",
  name: "Embed",
  category: "Content",
  description:
    "A booking page, map or video from somewhere else, framed on the page. Choose where it comes from and paste the link.",
  rootClass: "yp-embedblock",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 60 },
    body: { type: "text", label: "Intro line", maxChars: 160 },
    provider: {
      type: "choice",
      label: "Comes from",
      choices: EMBED_PROVIDERS.map((p) => p.key),
      default: "youtube",
    },
    url: { type: "text", label: "Link", hint: "Paste the address you were given." },
    height: { type: "number", label: "Height", min: 200, max: 900, default: 480 },
  },

  aiPrompt:
    "A heading and one line saying what the embedded thing is for — “Book a slot that suits you”, " +
    "“Find us”. NEVER invent the link: leave `url` empty unless a real one was supplied, and never " +
    "copy the one in the example. A made-up booking address sends a client's customers to somebody " +
    "else's calendar.",

  /*
   * A MAP, NOT A BOOKING LINK — and that is the whole reason for the choice.
   *
   * generate-page.ts puts this object into the prompt as a worked example, so
   * whatever stands here is the link a model is most likely to copy. The
   * aiPrompt above says not to, which is worth saying and not worth relying
   * on: examples outrank instructions often enough that the sample should not
   * be the dangerous one in the first place.
   *
   * A copied map shows the wrong street — visible, harmless, and obviously
   * placeholder. A copied Calendly would send a real client's real customers
   * to a stranger's calendar, and "example" is a handle anyone may register.
   * The two mistakes are not the same size, so the sample takes the small one.
   */
  sample: {
    heading: "Find us",
    body: "We're a two-minute walk from the station, with parking behind the building.",
    provider: "google-maps",
    url: "https://www.google.com/maps/place/Trafalgar+Square/@51.508,-0.128,17z",
    height: 420,
  },

  toGutenberg(p) {
    const resolved = resolveEmbed(p.provider, p.url);
    const height = Math.min(900, Math.max(200, Number(p.height) || 480));

    /*
     * sandbox is the point of the whole section. Without it an embed shares
     * the page's privileges; with it, a third party can run its own scripts
     * inside its own frame and reach nothing else. allow-same-origin is needed
     * for any of these to function at all, and is safe alongside the host
     * allowlist — this is never an arbitrary URL.
     */
    const frameInner = resolved.ok
      ? `<iframe src="${escAttr(resolved.src)}" title="${escAttr(p.heading?.trim() || resolved.provider.name)}" ` +
        `loading="lazy" referrerpolicy="no-referrer" ` +
        `sandbox="allow-scripts allow-same-origin allow-forms allow-popups" ` +
        `style="height:${height}px"></iframe>`
      : "";

    /*
     * Nothing to frame means no frame at all.
     *
     * Emitting an empty one and hiding it in CSS would leave a styled
     * container with nothing in it, which is the shape verify-carry exists to
     * catch — services-featured shipped with its wider column blank and
     * nobody noticed. A section that renders its heading and intro and stops
     * is honest; an invisible box is a bug waiting for a stylesheet change.
     *
     * The cost is that a half-configured embed — a provider chosen, no link
     * yet — has nothing to carry those choices in the markup, so a pull FROM
     * WordPress would forget them. Only reachable by exporting an embed
     * nobody finished, and the alternative is a container that lies.
     */
    const frame = resolved.ok
      ? `<div class="yp-embedblock__frame"` +
        ` data-embed-provider="${escAttr(p.provider ?? "")}"` +
        ` data-embed-url="${escAttr(p.url ?? "")}"` +
        ` data-embed-height="${height}">${frameInner}</div>`
      : "";

    const inner = [
      p.heading ? heading(p.heading, 2, "yp-embedblock__heading") : "",
      p.body ? paragraph(p.body, "yp-embedblock__body") : "",
      frame ? htmlBlock(frame) : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-embedblock", inner, "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-embedblock");
    if (!el) return null;

    const frame = el.querySelector(".yp-embedblock__frame");
    const height = Number(frame?.getAttribute("data-embed-height"));

    return {
      heading: text(el.querySelector(".yp-embedblock__heading")),
      body: text(el.querySelector(".yp-embedblock__body")),
      provider: frame?.getAttribute("data-embed-provider") ?? "",
      url: frame?.getAttribute("data-embed-url") ?? "",
      height: Number.isFinite(height) && height > 0 ? height : 480,
    };
  },
};
