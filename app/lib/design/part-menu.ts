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
const CHIP_ID = "vibewp-part-chip";

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

/**
 * The chip that says a part has a menu.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS HAD TO EXIST
 *
 * The menu was built to open on right-click and nothing else. It worked, and
 * it was undiscoverable: the client's first report was "I'm not seeing
 * anything", which was exactly right — there was nothing to see. A hover
 * outline says "this is a thing"; it does not say "there are six actions
 * behind a button on your mouse you may not have thought to press".
 *
 * So each part gets a small label with a ⋯ on it while the cursor is over it,
 * the same affordance the reference editor uses. It doubles as teaching: the
 * chip says "Heading", so the idea that a section is made of named parts
 * arrives before any menu is opened.
 *
 * It sits ABOVE the part rather than on it, so it never covers the words and
 * never swallows the click that places a caret in them.
 * ─────────────────────────────────────────────────────────────────────
 */
export function mountPartChip(doc: Document): HTMLElement {
  const existing = doc.getElementById(CHIP_ID);
  if (existing) return existing as HTMLElement;

  const style = doc.createElement("style");
  style.id = `${CHIP_ID}-style`;
  style.textContent = `
#${CHIP_ID} {
  all: initial;
  position: absolute;
  z-index: 2147483090;
  display: none;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
}
#${CHIP_ID}[data-open="1"] { display: block; }
#${CHIP_ID} .vpc-bar {
  display: flex;
  align-items: stretch;
  border-radius: 7px;
  background: #17181c;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.28);
  white-space: nowrap;
  overflow: hidden;
}
/*
 * The grip is the drag target and it says so: the cursor changes on it and
 * nowhere else, so "this can be moved" is discoverable without a tooltip.
 */
#${CHIP_ID} .vpc-grip {
  display: grid;
  place-items: center;
  padding: 0 5px;
  color: #9aa0aa;
  font-size: 12px;
  line-height: 1;
  cursor: grab;
}
#${CHIP_ID} .vpc-grip:hover { color: #fff; background: rgb(255 255 255 / 0.1); }
#${CHIP_ID}[data-dragging="1"] .vpc-grip { cursor: grabbing; }
#${CHIP_ID} .vpc-name {
  display: grid;
  place-items: center;
  padding: 5px 8px 5px 3px;
  color: #fff;
  font: 700 10px/1.4 inherit;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
/*
 * The dots were #d7dae0 at 13px with no edge, and the report was that they
 * could not be seen. Now white, larger, and behind a rule so they read as a
 * button rather than as punctuation after the label.
 */
#${CHIP_ID} .vpc-more {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  min-width: 26px;
  padding: 0 3px 4px;
  border-left: 1px solid rgb(255 255 255 / 0.22);
  background: rgb(255 255 255 / 0.08);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
#${CHIP_ID} .vpc-more:hover { background: rgb(255 255 255 / 0.24); }`;
  doc.head.appendChild(style);

  const host = doc.createElement("div");
  host.id = CHIP_ID;
  host.innerHTML =
    `<div class="vpc-bar">` +
    `<span class="vpc-grip" data-chip-grip title="Drag to move this part">⠿</span>` +
    `<span class="vpc-name"></span>` +
    `<button type="button" class="vpc-more" data-chip-more aria-label="Part actions" title="Hide, delete or replace this part">⋯</button>` +
    `</div>`;
  doc.body.appendChild(host);
  return host;
}

/** Puts the chip on a part. Returns nothing; the caller owns when to hide it. */
export function showPartChip(host: HTMLElement, rect: DOMRect, label: string, doc: Document): void {
  const name = host.querySelector(".vpc-name");
  if (name) name.textContent = label;
  host.setAttribute("data-open", "1");

  const bar = host.firstElementChild as HTMLElement;
  const height = bar.offsetHeight || 24;
  const scrollX = doc.defaultView?.scrollX ?? 0;
  const scrollY = doc.defaultView?.scrollY ?? 0;

  // Above the part, unless it is at the very top of the page — then just inside.
  const above = rect.top - height - 4;
  host.style.left = `${Math.round(Math.max(4, rect.left) + scrollX)}px`;
  host.style.top = `${Math.round((above < 4 ? rect.top + 2 : above) + scrollY)}px`;
}

export function hidePartChip(doc: Document): void {
  doc.getElementById(CHIP_ID)?.setAttribute("data-open", "0");
}

export const PART_CHIP_ID = CHIP_ID;

const LINE_ID = "vibewp-part-dropline";
export const PART_LINE_ID = LINE_ID;

/**
 * The line showing where a dragged part will land.
 *
 * Drawn BETWEEN parts rather than around one: "it will go here" is a
 * position, and outlining a neighbour would say "it will replace this".
 */
export function mountDropLine(doc: Document): HTMLElement {
  const existing = doc.getElementById(LINE_ID);
  if (existing) return existing as HTMLElement;

  const style = doc.createElement("style");
  style.id = LINE_ID + "-style";
  style.textContent = [
    "#" + LINE_ID + " {",
    "  all: initial;",
    "  position: absolute;",
    "  z-index: 2147483080;",
    "  display: none;",
    "  height: 3px;",
    "  border-radius: 2px;",
    "  background: #5b6bff;",
    "  box-shadow: 0 0 0 3px rgb(91 107 255 / 0.22);",
    /* Never a drop target itself, or it would block the part underneath. */
    "  pointer-events: none;",
    "}",
    "#" + LINE_ID + '[data-open="1"] { display: block; }',
  ].join("\n");
  doc.head.appendChild(style);

  const host = doc.createElement("div");
  host.id = LINE_ID;
  doc.body.appendChild(host);
  return host;
}

export function showDropLine(
  host: HTMLElement,
  rect: DOMRect,
  atTop: boolean,
  doc: Document,
): void {
  const scrollX = doc.defaultView?.scrollX ?? 0;
  const scrollY = doc.defaultView?.scrollY ?? 0;
  host.setAttribute("data-open", "1");
  host.style.left = Math.round(rect.left + scrollX) + "px";
  host.style.width = Math.round(rect.width) + "px";
  host.style.top = Math.round((atTop ? rect.top - 2 : rect.bottom - 1) + scrollY) + "px";
}

export function hideDropLine(doc: Document): void {
  doc.getElementById(LINE_ID)?.setAttribute("data-open", "0");
}

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
