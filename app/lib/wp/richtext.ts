import { type HTMLElement as ParsedElement, type Node as ParsedNode } from "node-html-parser";
import { esc, escAttr } from "./escape";

/**
 * The small amount of HTML a client may put inside a line of copy.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Every renderer escapes its text through esc(), and every parser reads it
 * back with textContent. That is the right default — it is what stops a stray
 * angle bracket in a business name breaking a page — but it also means a
 * client cannot bold a word. Typing one produced the literal characters
 * `<strong>` on the page, and a pull from WordPress stripped it either way.
 *
 * So a bounded subset is allowed through, and everything else is still
 * escaped exactly as before. This is emphasis and links: the formatting that
 * is part of what a sentence MEANS, rather than how it looks. Size, colour and
 * font are deliberately absent — they belong to the design tokens, and putting
 * them inline per word is how a page stops being able to be restyled at all.
 *
 * WHY IT IS SAFE
 *
 * Rendering escapes the entire string and then re-admits only the tags on the
 * allow-list, which it re-emits itself from a fixed literal. So the only
 * unescaped characters in the output are ones this file wrote. A <script>
 * comes out as the visible characters `<script>`, not as a script.
 *
 * It is a tokeniser and deliberately not an HTML parse. Parsing treats every
 * angle bracket as markup, so "Fresh <bread> daily" — ordinary copy — came
 * back as "Fresh  daily", silently eating the client's words. Escaping first
 * and admitting second cannot lose anything: text that is not a recognised
 * tag is text.
 *
 * The one attribute allowed through is href, checked against a scheme list.
 * `javascript:` in a link is the way a bold button turns into a cross-site
 * scripting hole.
 *
 * ROUND TRIP
 *
 * render() escapes text and keeps allowed tags; read() decodes text and keeps
 * allowed tags. The pair is stable, which matters because verify.ts asserts
 * every section survives serialize → parse → serialize byte for byte.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Emphasis and links. Nothing that carries a size, a colour or a font. */
const ALLOWED = new Set(["strong", "b", "em", "i", "a", "br"]);

/** Canonical spelling, so `<b>` and `<strong>` do not round-trip differently. */
const CANONICAL: Record<string, string> = { b: "strong", i: "em" };

/** A link may point at a page, a phone, an email or an anchor. Nothing else. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/|#)/i;

/**
 * The only markup this file will ever re-admit after escaping.
 *
 * Anything that does not match — including a `<script>`, a `<bread>` and a
 * lone `<` — stays escaped, so it reaches the page as the characters the
 * client typed.
 */
const TAG =
  /<(\/?)(strong|b|em|i|a|br)(\s[^<>]*?)?\s*\/?>/gi;

const isElement = (node: ParsedNode): node is ParsedElement =>
  (node as ParsedElement).tagName !== undefined && (node as ParsedElement).tagName !== null;

/** Pulls href out of an opening <a>, in either quote style or bare. */
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/i;

/**
 * Serializes a stored value into markup, keeping the allowed subset.
 *
 * Identical to esc() for text with no markup in it, which is what lets this
 * replace esc() everywhere without moving a single character of the 62
 * sections' output.
 */
export function renderRichText(value: unknown): string {
  const input = String(value ?? "");
  // The overwhelming majority of copy. Also the guarantee of byte-identical
  // output where there is nothing to admit.
  if (!input.includes("<")) return esc(input);

  let out = "";
  let cursor = 0;
  /*
   * Open tags, so the output can be closed properly. An unbalanced <strong>
   * left in the markup would bleed formatting into the rest of the page —
   * and, worse, into the sections after it.
   */
  const open: string[] = [];

  for (const m of input.matchAll(TAG)) {
    const [whole, slash, rawTag, attrs = ""] = m;
    const tag = CANONICAL[rawTag.toLowerCase()] ?? rawTag.toLowerCase();

    // Everything between the last tag and this one is text, so it is escaped.
    out += esc(input.slice(cursor, m.index));
    cursor = m.index + whole.length;

    if (tag === "br") {
      out += "<br>";
      continue;
    }

    if (slash) {
      // A closing tag with nothing open is noise from a paste. Drop it.
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      // Close anything opened inside it too, innermost first.
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    if (tag === "a") {
      const href = (HREF.exec(attrs)?.slice(1).find((v) => v !== undefined) ?? "").trim();
      // A link that cannot be trusted keeps its words and loses its href.
      if (!SAFE_HREF.test(href)) continue;
      // Links do not nest; an <a> inside an <a> is invalid markup either way.
      if (open.includes("a")) continue;
      out += `<a href="${escAttr(href)}">`;
      open.push("a");
      continue;
    }

    out += `<${tag}>`;
    open.push(tag);
  }

  out += esc(input.slice(cursor));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

export type ReadOptions = {
  /**
   * Whether an <a> in the markup belongs to the value being read.
   *
   * Almost always it does NOT. Every link in the 62 sections is GENERATED by
   * a renderer from a separate href field — the tap-to-call number is stored
   * as "01225 000 000" and paragraphLink() wraps it. Reading the anchor back
   * as part of the value made the next render wrap it a second time, which is
   * how the round-trip gate caught this across eight sections at once.
   *
   * So the copy reader passes false. A stored inline link needs a field that
   * declares it carries one, and none does yet.
   */
  links?: boolean;
};

/**
 * Reads markup back into a stored value.
 *
 * The counterpart of renderRichText: text comes back decoded, allowed tags
 * come back as tags. Sections use this in place of textContent so a bolded
 * word survives a pull from WordPress, which rebuilds every prop from the
 * markup and keeps only what a parser reads.
 */
export function readRichText(el: ParsedElement | null, opts: ReadOptions = {}): string {
  if (!el) return "";
  const keepLinks = opts.links ?? true;

  const emit = (node: ParsedNode): string => {
    if (!isElement(node)) return node.rawText ? decode(node.rawText) : node.textContent;
    const tag = CANONICAL[node.tagName.toLowerCase()] ?? node.tagName.toLowerCase();
    const inner = node.childNodes.map(emit).join("");
    if (!ALLOWED.has(tag)) return inner;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      if (!keepLinks) return inner;
      const href = node.getAttribute("href")?.trim() ?? "";
      if (!SAFE_HREF.test(href)) return inner;
      return `<a href="${href}">${inner}</a>`;
    }
    return `<${tag}>${inner}</${tag}>`;
  };

  return el.childNodes.map(emit).join("").trim();
}

/** Whether a stored value carries any of the allowed markup. */
export function hasRichText(value: unknown): boolean {
  return /<(?:strong|b|em|i|a|br)\b/i.test(String(value ?? ""));
}

/** The five entities esc() and escAttr() produce, reversed. */
function decode(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The same read, over a real DOM element.
 *
 * The browser needs this because inline editing commits what the client
 * actually typed into a contenteditable, and the server's reader is built on
 * node-html-parser's tree. Writing it twice would be a bug waiting to happen,
 * so the two share the allow-list, the canonical spellings and the href check
 * — only the tree walk differs.
 *
 * A contenteditable is the most hostile input in the product: the browser puts
 * its own markup in (a <div> per line in some engines, a <span style> from a
 * paste out of Word), and a paste can bring anything at all. Everything not on
 * the allow-list contributes its text and nothing else.
 */
export function readRichTextDom(el: Element | null, opts: ReadOptions = {}): string {
  if (!el) return "";
  const keepLinks = opts.links ?? true;

  const emit = (node: globalThis.Node): string => {
    if (node.nodeType === 3) return node.nodeValue ?? "";
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    const raw = element.tagName.toLowerCase();
    const tag = CANONICAL[raw] ?? raw;
    const inner = Array.from(element.childNodes).map(emit).join("");

    if (!ALLOWED.has(tag)) {
      /*
       * A block the browser inserted for a new line is a line break, not
       * nothing. Pressing Enter in a contenteditable makes a <div> or a <p>,
       * and dropping it silently would run two sentences together.
       */
      return BLOCKISH.has(raw) && inner ? `<br>${inner}` : inner;
    }
    if (tag === "br") return "<br>";
    if (tag === "a") {
      if (!keepLinks) return inner;
      const href = element.getAttribute("href")?.trim() ?? "";
      if (!SAFE_HREF.test(href)) return inner;
      return `<a href="${href}">${inner}</a>`;
    }
    return `<${tag}>${inner}</${tag}>`;
  };

  return Array.from(el.childNodes)
    .map(emit)
    .join("")
    // A leading break from the browser's first inserted block is an artefact.
    .replace(/^(?:<br>)+/, "")
    .replace(/(?:<br>)+$/, "")
    .trim();
}

/** Elements a browser inserts to start a new line inside a contenteditable. */
const BLOCKISH = new Set(["div", "p", "li"]);
