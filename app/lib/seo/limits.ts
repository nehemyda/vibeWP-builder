/**
 * Where search engines usually truncate, and the page shapes we warn about.
 *
 * In their own module because app/actions/seo.ts is a "use server" file, and
 * such a file may export only async functions — a plain `export const` there
 * is a build error, not a type error, so tsc says nothing and the dev server
 * refuses the page. Both the action and the panel import from here.
 *
 * ADVICE, NOT LIMITS. 60 and 160 are roughly where Google truncates, not
 * rules, and it rewrites titles a good share of the time anyway. Over-length
 * is flagged and still saved; refusing it would claim a precision nobody has.
 */

export const TITLE_LIMIT = 60;
export const DESC_LIMIT = 160;

/** Below these, a field is more likely an accident than a choice. */
export const TITLE_SHORT = 20;
export const DESC_SHORT = 60;
