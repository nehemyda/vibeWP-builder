/**
 * Rules for the business logo, shared by the form and the server action.
 *
 * In its own module because a "use server" file may only export async
 * functions — a plain `export const` there compiles under TypeScript and then
 * fails the Next.js build, which is how this landed in the first place.
 */

/**
 * Cap on the stored logo.
 *
 * It lives in a database column as a data URL, so it has to stay small. 400KB
 * is generous — a 512px PNG is typically well under 100KB — and the form
 * downscales before it ever gets here, so hitting this means a photograph was
 * picked rather than a logo.
 */
export const LOGO_MAX_BYTES = 400_000;

/**
 * Only raster image data URLs are accepted.
 *
 * SVG is deliberately excluded: an SVG can carry script, and this value is
 * written into an <img src> served to every visitor of the client's site.
 */
export function isSupportedLogoDataUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}
