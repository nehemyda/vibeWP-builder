/**
 * The formatting toolbar that follows a text selection in the canvas.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT LIVES INSIDE THE IFRAME
 *
 * The obvious place is the app, floating over the canvas. That means
 * translating a selection rectangle out of the iframe's coordinate space into
 * the app's on every scroll, every resize and every reflow — three things that
 * happen constantly while someone is typing. Inside the iframe the rectangle
 * is already in the right space and the toolbar scrolls with the words for
 * free.
 *
 * The cost is that the site's own stylesheet can reach it, so every rule here
 * is written defensively: `all: initial` on the host, then only what is
 * needed, at a specificity nothing in sections.css comes near, on a z-index
 * above the selection paint.
 *
 * WHY IT IS SO SHORT ON BUTTONS
 *
 * The reference toolbar has font, size and colour on it. Those are not in
 * this one, and leaving them out is the point rather than an omission.
 *
 * A font size chosen per word is an absolute value baked into content. It
 * survives a design swap into a section built to a different scale, it
 * ignores the site's type ramp, and it cannot be restyled afterwards by
 * anything — which is exactly the failure the token system exists to prevent,
 * and the same argument that kept raw CSS out of section styling. Those
 * controls exist, in the style panel, where they set a token that every
 * section respects.
 *
 * What is left is what is genuinely a property of the SENTENCE rather than
 * its appearance: which words are emphasised. That travels through a design
 * change intact, because emphasis means the same thing in every design.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The formatting a client can apply to a run of words. */
export type TextCommand = "bold" | "italic" | "clear";

export const TEXT_COMMANDS: Array<{
  command: TextCommand;
  label: string;
  /** Shown in the tooltip alongside the label. */
  shortcut?: string;
  /** Inline SVG, sized by the button. */
  icon: string;
}> = [
  {
    command: "bold",
    label: "Bold",
    shortcut: "⌘B",
    icon: `<path d="M4 2.5h4.2a2.75 2.75 0 0 1 0 5.5H4zM4 8h4.8a2.75 2.75 0 0 1 0 5.5H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`,
  },
  {
    command: "italic",
    label: "Italic",
    shortcut: "⌘I",
    icon: `<path d="M6.5 2.75h5M4.5 13.25h5M9.5 2.75 7 13.25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  },
  {
    command: "clear",
    label: "Clear formatting",
    icon: `<path d="M3 3.5h10M6 3.5 5 12.5M9.5 8.5h4M13.5 8.5l-4 4M9.5 8.5l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  },
];

/** How far above the selection the toolbar sits, in px. */
const GAP = 10;

const HOST_ID = "vibewp-text-toolbar";

/**
 * The toolbar's markup and styles, injected into the preview document once.
 *
 * Returns the host element, already in the DOM and hidden.
 */
export function mountTextToolbar(doc: Document): HTMLElement {
  const existing = doc.getElementById(HOST_ID);
  if (existing) return existing as HTMLElement;

  const style = doc.createElement("style");
  style.id = `${HOST_ID}-style`;
  style.textContent = `
#${HOST_ID} {
  all: initial;
  position: absolute;
  z-index: 2147483000;
  display: none;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
}
#${HOST_ID}[data-open="1"] { display: block; }
#${HOST_ID} .vwt-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: #17181c;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(255 255 255 / 0.08);
}
#${HOST_ID} .vwt-btn {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: #d7dae0;
  cursor: pointer;
}
#${HOST_ID} .vwt-btn:hover { background: rgb(255 255 255 / 0.11); color: #fff; }
#${HOST_ID} .vwt-btn[aria-pressed="true"] { background: #fff; color: #17181c; }
#${HOST_ID} .vwt-sep {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: rgb(255 255 255 / 0.14);
}
/* The arrow, so the bar reads as attached to the words it acts on. */
#${HOST_ID} .vwt-bar::after {
  content: "";
  position: absolute;
  left: var(--vwt-arrow, 50%);
  bottom: -4px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  background: #17181c;
  transform: rotate(45deg);
}
#${HOST_ID}[data-flip="1"] .vwt-bar::after { bottom: auto; top: -4px; }
@media (prefers-reduced-motion: no-preference) {
  #${HOST_ID}[data-open="1"] .vwt-bar { animation: vwt-in 90ms ease-out; }
  @keyframes vwt-in { from { opacity: 0; transform: translateY(3px); } }
}`;
  doc.head.appendChild(style);

  const host = doc.createElement("div");
  host.id = HOST_ID;
  host.innerHTML = `<div class="vwt-bar" role="toolbar" aria-label="Text formatting">${TEXT_COMMANDS.map(
    (c, i) =>
      `${i === TEXT_COMMANDS.length - 1 ? '<span class="vwt-sep"></span>' : ""}` +
      `<button type="button" class="vwt-btn" data-command="${c.command}" aria-pressed="false"` +
      ` title="${c.label}${c.shortcut ? ` (${c.shortcut})` : ""}" aria-label="${c.label}">` +
      `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">${c.icon}</svg></button>`,
  ).join("")}</div>`;

  doc.body.appendChild(host);
  return host;
}

/**
 * Places the toolbar over a selection and shows it.
 *
 * `within` bounds the horizontal position, so a selection at the very edge of
 * a narrow phone preview does not push the bar off the page.
 */
export function placeTextToolbar(host: HTMLElement, rect: DOMRect, doc: Document): void {
  const bar = host.firstElementChild as HTMLElement | null;
  if (!bar) return;

  host.setAttribute("data-open", "1");
  // Measured after it is displayed; a hidden element has no width.
  const width = bar.offsetWidth || 100;
  const height = bar.offsetHeight || 36;

  const scrollX = doc.defaultView?.scrollX ?? 0;
  const scrollY = doc.defaultView?.scrollY ?? 0;
  const viewport = doc.documentElement.clientWidth;

  const centre = rect.left + rect.width / 2;
  const clamped = Math.min(Math.max(centre, width / 2 + 8), viewport - width / 2 - 8);

  // Above the words, unless there is no room — then below, and the arrow flips.
  const above = rect.top - height - GAP;
  const flip = above < 4;
  host.setAttribute("data-flip", flip ? "1" : "0");

  host.style.left = `${Math.round(clamped - width / 2 + scrollX)}px`;
  host.style.top = `${Math.round((flip ? rect.bottom + GAP : above) + scrollY)}px`;
  // Keep the arrow pointing at the selection even when the bar was clamped.
  bar.style.setProperty("--vwt-arrow", `${Math.round(centre - (clamped - width / 2))}px`);
}

export function hideTextToolbar(doc: Document): void {
  doc.getElementById(HOST_ID)?.setAttribute("data-open", "0");
}

/**
 * Applies a command to the current selection.
 *
 * execCommand is deprecated and has no replacement for this. Every editor
 * that formats inside a contenteditable still uses it, because the alternative
 * is reimplementing range splitting across partially-selected inline elements
 * — hundreds of lines to reproduce what the browser already does correctly.
 *
 * What it produces varies by engine (<b> in some, <strong> in others, a
 * <span style="font-weight:bold"> if it feels like it). That does not matter
 * here: the value is read back through the same allow-list as everything else,
 * which canonicalises the first two and discards the third.
 */
export function runTextCommand(doc: Document, command: TextCommand): void {
  if (command === "clear") {
    doc.execCommand("removeFormat");
    doc.execCommand("unlink");
    return;
  }
  doc.execCommand(command);
}

/** Which commands are currently active, for the pressed state. */
export function activeTextCommands(doc: Document): Set<TextCommand> {
  const active = new Set<TextCommand>();
  for (const { command } of TEXT_COMMANDS) {
    if (command === "clear") continue;
    try {
      if (doc.queryCommandState(command)) active.add(command);
    } catch {
      // queryCommandState throws in some engines when nothing is editable.
    }
  }
  return active;
}
