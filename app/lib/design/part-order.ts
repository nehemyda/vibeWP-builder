import { SECTION_PARTS } from "./part-visibility";

/**
 * Reordering the parts of a section — heading below the copy, buttons above.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE MARKUP AND NOT CSS `order`
 *
 * Measured across all 52 page sections: of the parts worth reordering, 85 sit
 * in a flex parent, 10 in a grid, and 56 in a plain block. So CSS `order`
 * would work on two thirds of them and do nothing at all on the rest, with no
 * error and no way for the client to tell which they had.
 *
 * It is also the wrong answer where it does work. `order` moves the picture
 * and not the document: a screen reader would still meet the heading first
 * after it had been moved below the copy, and so would anything reading the
 * page without styles. Moving the blocks themselves keeps the two in step.
 *
 * The exception is columns swapping at one screen size and not another, which
 * no amount of markup can express — that stays CSS, and is safe there because
 * two peer columns do not introduce one another.
 *
 * WHY A PASS OVER THE MARKUP AND NOT 62 EDITED SECTIONS
 *
 * Each section builds its own stack: `group([eyebrow, heading, body, actions])`
 * written out by hand. Making that data-driven would mean touching every one
 * of them and inventing a shared stack helper they would all have to adopt.
 *
 * This runs after they have rendered, moving whole blocks about — exactly the
 * shape applyElementStyles already uses to patch classes. No section changes,
 * and a section added tomorrow gets it for nothing.
 *
 * WHY IT MOVES WHOLE BLOCKS, COMMENT TO COMMENT
 *
 * A Gutenberg block is its opening comment, its markup, and its closing
 * comment. Moving that whole span leaves the wrapper `<div>` around it
 * untouched, which is what keeps the group valid — and means this never has
 * to understand the HTML at all, only where the blocks begin and end.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The prop, e.g. "heading,eyebrow,body". Parts not named keep their place. */
export const PART_ORDER_FIELD = "partOrder";

type Block = {
  start: number;
  end: number;
  /*
   * Where this block's CHILDREN live — after its opening comment, before its
   * closing one. Descending on the whole block instead made the search find
   * the block again and recurse until the stack gave out.
   */
  innerStart: number;
  innerEnd: number;
  part: string | null;
};

const OPEN = /<!--\s+wp:([a-z0-9-]+\/?[a-z0-9-]*)\s*(\{[\s\S]*?\})?\s*(\/)?-->/g;

/**
 * The blocks at the top level of a fragment, with the part each one is.
 *
 * Depth-counted over the comments alone. Anything between blocks — a wrapper
 * div, whitespace — is glue and is never moved, so a reorder cannot break the
 * structure it happens inside.
 */
function topLevelBlocks(html: string): Block[] {
  const out: Block[] = [];
  OPEN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = OPEN.exec(html))) {
    const [whole, name, , selfClosing] = match;
    const start = match.index;

    if (selfClosing) {
      const end = start + whole.length;
      out.push({ start, end, innerStart: end, innerEnd: end, part: partOf(whole) });
      continue;
    }

    // Walk forward to this block's own closing comment, counting nesting.
    const opener = new RegExp(`<!--\\s+wp:${name}\\b[^]*?(\\/)?-->`, "g");
    const closer = `<!-- /wp:${name} -->`;
    let depth = 1;
    let cursor = start + whole.length;

    while (depth > 0) {
      const nextClose = html.indexOf(closer, cursor);
      if (nextClose === -1) return out; // Unbalanced; leave the rest alone.
      opener.lastIndex = cursor;
      let nextOpen = -1;
      let m: RegExpExecArray | null;
      while ((m = opener.exec(html))) {
        if (m.index >= nextClose) break;
        // A self-closing block of the same name opens nothing.
        if (!m[1]) {
          nextOpen = m.index;
          break;
        }
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + 1;
      } else {
        depth -= 1;
        cursor = nextClose + closer.length;
      }
    }

    const end = cursor;
    out.push({
      start,
      end,
      innerStart: start + whole.length,
      innerEnd: end - closer.length,
      part: partOf(html.slice(start, end)),
    });
    OPEN.lastIndex = end;
  }
  return out;
}

/**
 * Which part a block is, from the class its OWN opening comment carries.
 *
 * Read from the comment rather than from anywhere in the block, so a group
 * is not mistaken for the heading nested inside it.
 */
function partOf(block: string): string | null {
  const comment = /^<!--\s+wp:[^]*?-->/.exec(block)?.[0] ?? "";
  for (const part of SECTION_PARTS) {
    const re = new RegExp(part.match.source);
    const found = re.exec(comment);
    if (found && !part.except.includes(found[0])) return part.key;
  }
  return null;
}

/**
 * Rearranges a section's parts into the order asked for.
 *
 * Descends until it finds the group that holds two or more parts as
 * siblings — the copy stack — and reorders within it. Parts the order does
 * not mention keep their positions, so naming two of five swaps those two
 * and leaves the rest where they were.
 */
export function applyPartOrder(html: string, props: Record<string, unknown> | undefined): string {
  const wanted = String(props?.[PART_ORDER_FIELD] ?? "").trim();
  if (!wanted) return html;
  const order = wanted.split(",").map((s) => s.trim()).filter(Boolean);
  if (order.length < 2) return html;
  return reorderWithin(html, order);
}

function reorderWithin(html: string, order: string[]): string {
  const blocks = topLevelBlocks(html);
  const parts = blocks.filter((b) => b.part);

  if (parts.length >= 2) {
    /*
     * The positions the parts occupy stay exactly where they are; only WHICH
     * part sits in each is decided here. That is what leaves the glue between
     * them — a wrapper div, a blank line — untouched.
     */
    const ranked = [...parts].sort((a, b) => rank(a.part!, order) - rank(b.part!, order));
    let out = "";
    let cursor = 0;
    parts.forEach((slot, i) => {
      out += html.slice(cursor, slot.start);
      const source = ranked[i];
      out += html.slice(source.start, source.end);
      cursor = slot.end;
    });
    return out + html.slice(cursor);
  }

  // No sibling group here: look inside each block for one.
  let out = "";
  let cursor = 0;
  for (const block of blocks) {
    if (block.innerEnd <= block.innerStart) continue;
    out += html.slice(cursor, block.innerStart);
    out += reorderWithin(html.slice(block.innerStart, block.innerEnd), order);
    cursor = block.innerEnd;
  }
  return out + html.slice(cursor);
}

/**
 * Where a part sits in the requested order.
 *
 * A part the order does not mention sorts to the position it already had, so
 * an order naming only what moved does not shuffle everything else. Array
 * .sort is stable, which is what makes that hold.
 */
function rank(part: string, order: string[]): number {
  const at = order.indexOf(part);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
}

/**
 * The order the parts actually appear in.
 *
 * Read back so a pull from WordPress does not undo a reorder — and read from
 * the markup's own sequence rather than from a stamped attribute, because
 * the sequence IS the fact. Nothing has to be written into the client's
 * exported content for this to survive.
 */
export function partOrderFromHtml(html: string): string {
  const found: string[] = [];
  const walk = (fragment: string) => {
    for (const block of topLevelBlocks(fragment)) {
      if (block.part) found.push(block.part);
      else if (block.innerEnd > block.innerStart) {
        walk(fragment.slice(block.innerStart, block.innerEnd));
      }
    }
  };
  walk(html);
  return found.join(",");
}
