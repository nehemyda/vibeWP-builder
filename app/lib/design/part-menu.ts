import { SCREENS, SECTION_PARTS } from "./part-visibility";

/**
 * The menu on a part of a section, opened from the part itself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACED A LIST IN THE SIDEBAR
 *
 * The first version put every part of the section in the Edit panel as a row
 * with arrows, a dropdown and a delete button. It worked, and it was worse.
 *
 * A sidebar list makes the client do two jobs the editor should be doing for
 * them: find which row is the thing they are looking at, and translate what
 * they want into whichever label means it. "Hide this on mobile" became
 * picking "Not on phones" from five options — a double negative wearing a
 * positive name.
 *
 * So the menu opens on the part, and the actions are named as the actions
 * they are. There is no list to map onto the page, because the thing you
 * clicked IS the selection.
 *
 * WHY INSIDE THE IFRAME
 *
 * Same reason as the text toolbar: the rectangle it has to sit beside is
 * already in the iframe's coordinate space, and translating it out on every
 * scroll and reflow is work that buys nothing. The cost is that the site's
 * own stylesheet can reach it, so every rule is written defensively.
 *
 * WHY THE HIDE SUBMENU IS TICKS AND NOT A CHOICE
 *
 * The three screen sizes are independent facts. Ticking Mobile hides it on
 * mobile; that is the whole model, and it needs no explaining.
 * ─────────────────────────────────────────────────────────────────────
 */

const HOST_ID = "vibewp-part-menu";

/** What the menu needs to know to draw itself for one part. */
export type PartMenuState = {
  part: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Screen keys this part is currently hidden from. */
  hiddenFrom: string[];
  /** Photos get "Replace image"; nothing else does. */
  isMedia: boolean;
};

export function mountPartMenu(doc: Document): HTMLElement {
  const existing = doc.getElementById(HOST_ID);
  if (existing) return existing as HTMLElement;

  const style = doc.createElement("style");
  style.id = `${HOST_ID}-style`;
  style.textContent = `
#${HOST_ID} {
  all: initial;
  position: absolute;
  z-index: 2147483100;
  display: none;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
}
#${HOST_ID}[data-open="1"] { display: block; }
#${HOST_ID} .vpm-card {
  min-width: 196px;
  padding: 4px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.08);
}
#${HOST_ID} .vpm-title {
  padding: 7px 10px 8px;
  margin: -4px -4px 4px;
  border-radius: 10px 10px 0 0;
  background: #17181c;
  color: #fff;
  font: 700 11px/1 inherit;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
#${HOST_ID} button {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: #17181c;
  cursor: pointer;
}
#${HOST_ID} button:hover:not([disabled]) { background: #f2f3f5; }
#${HOST_ID} button[disabled] { opacity: 0.35; cursor: default; }
#${HOST_ID} button[data-danger] { color: #b42318; }
#${HOST_ID} button[data-danger]:hover { background: #fdf1f0; }
#${HOST_ID} .vpm-rule { height: 1px; margin: 4px 6px; background: rgb(0 0 0 / 0.09); }
#${HOST_ID} .vpm-arrow { margin-left: auto; opacity: 0.5; font-size: 11px; }
#${HOST_ID} .vpm-tick { margin-left: auto; font-size: 12px; }
/* The submenu sits beside the row that owns it, like the reference does. */
#${HOST_ID} .vpm-sub {
  position: absolute;
  left: calc(100% - 6px);
  top: 0;
  display: none;
  min-width: 172px;
  padding: 4px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.08);
}
#${HOST_ID} .vpm-hasSub { position: relative; }
#${HOST_ID} .vpm-hasSub[data-open="1"] .vpm-sub { display: block; }
#${HOST_ID}[data-flip-x="1"] .vpm-sub { left: auto; right: calc(100% - 6px); }`;
  doc.head.appendChild(style);

  const host = doc.createElement("div");
  host.id = HOST_ID;
  doc.body.appendChild(host);
  return host;
}

/** Draws and positions the menu for one part. */
export function openPartMenu(
  host: HTMLElement,
  rect: DOMRect,
  state: PartMenuState,
  doc: Document,
): void {
  const label = SECTION_PARTS.find((p) => p.key === state.part)?.label ?? state.part;
  const hidden = new Set(state.hiddenFrom);
  const allHidden = SCREENS.every((s) => hidden.has(s.key));

  const item = (
    action: string,
    text: string,
    opts: { disabled?: boolean; danger?: boolean; tick?: boolean; sub?: boolean } = {},
  ) =>
    `<button type="button" data-action="${action}"${opts.disabled ? " disabled" : ""}` +
    `${opts.danger ? " data-danger" : ""}>` +
    `<span>${text}</span>` +
    (opts.sub ? `<span class="vpm-arrow">›</span>` : "") +
    (opts.tick ? `<span class="vpm-tick">✓</span>` : "") +
    `</button>`;

  host.innerHTML =
    `<div class="vpm-card">` +
    `<div class="vpm-title">${label}</div>` +
    (state.isMedia ? item("replace", "Replace image") + `<div class="vpm-rule"></div>` : "") +
    item("up", "Move up", { disabled: !state.canMoveUp }) +
    item("down", "Move down", { disabled: !state.canMoveDown }) +
    `<div class="vpm-rule"></div>` +
    `<div class="vpm-hasSub" data-sub="hide">` +
    item("hide-open", "Hide from", { sub: true }) +
    `<div class="vpm-sub">` +
    item("hide-all", "All screen sizes", { tick: allHidden }) +
    SCREENS.map((s) => item(`hide-${s.key}`, s.label, { tick: hidden.has(s.key) })).join("") +
    `</div></div>` +
    `<div class="vpm-rule"></div>` +
    item("delete", "Delete", { danger: true }) +
    `</div>`;

  host.setAttribute("data-open", "1");

  const card = host.firstElementChild as HTMLElement;
  const width = card.offsetWidth || 200;
  const height = card.offsetHeight || 260;
  const viewportW = doc.documentElement.clientWidth;
  const scrollX = doc.defaultView?.scrollX ?? 0;
  const scrollY = doc.defaultView?.scrollY ?? 0;

  /*
   * Anchored to the part's top-left and nudged inside the page. The submenu
   * opens to the right unless the menu is already near the right edge, where
   * it would leave the page entirely — the same flip the section's overflow
   * menu needed vertically.
   */
  const left = Math.min(Math.max(rect.left, 8), Math.max(8, viewportW - width - 8));
  const room = viewportW - (left + width);
  host.setAttribute("data-flip-x", room < 180 ? "1" : "0");

  const top = rect.top + height > (doc.documentElement.clientHeight ?? 0) + scrollY
    ? Math.max(8, rect.bottom - height)
    : rect.top;

  host.style.left = `${Math.round(left + scrollX)}px`;
  host.style.top = `${Math.round(top + scrollY)}px`;
}

export function closePartMenu(doc: Document): void {
  const host = doc.getElementById(HOST_ID);
  host?.setAttribute("data-open", "0");
  host?.querySelectorAll<HTMLElement>(".vpm-hasSub").forEach((el) => el.setAttribute("data-open", "0"));
}

export const PART_MENU_ID = HOST_ID;
