import { z } from "zod";

/* ============================================================
   HeroSplit — the contract

   This schema does three jobs at once:

     1. Validates AI output. A hallucinated prop is rejected and the
        error string is handed back to the model to retry against.
     2. Feeds the AI. `aiHint` plus the field descriptions are
        serialized into the Design Agent's prompt, so the model can
        only choose real sections with real props.
     3. Generates the editor. The properties panel is derived from
        this shape — add a field here and the editor UI follows.

   Nothing else in the system may invent props. This is the source
   of truth.
   ============================================================ */

export const mediaSchema = z.object({
  src: z.string().describe("Image URL or media library path"),
  alt: z.string().max(160).describe("Alt text describing the image"),
});

export const actionSchema = z.object({
  label: z.string().min(2).max(40).describe("Button text"),
  href: z.string().min(1).describe("Destination — URL, /path, tel:, or mailto:"),
  variant: z.enum(["primary", "outline", "ghost"]),
});

export const badgeSchema = z.object({
  mark: z.string().max(2).describe("A single glyph shown in the badge tile"),
  title: z.string().max(40).describe("Short credential or proof point"),
  sub: z.string().max(70).describe("Supporting line under the title"),
});

export const statSchema = z.object({
  label: z.string().max(28).describe("Uppercase category label"),
  value: z.string().max(12).describe("The figure itself — kept short, set in mono"),
  note: z.string().max(48).describe("One-line qualifier under the figure"),
});

export const heroSplitSchema = z.object({
  eyebrow: z.string().max(60).optional()
    .describe("Small pill above the heading — live status or location"),
  heading: z.string().min(10).max(120)
    .describe("The primary H1. Two to eight words per line reads best."),
  body: z.string().min(40).max(400)
    .describe("Supporting paragraph. One idea, concrete detail, no marketing filler."),
  features: z.array(z.string().max(60)).min(2).max(6)
    .describe("Short proof points, rendered as a two-column checked list"),
  actions: z.array(actionSchema).min(1).max(2)
    .describe("Primary action first. Two maximum — a third dilutes both."),
  media: mediaSchema,
  badge: badgeSchema.nullable()
    .describe("Credential card overlapping the image. Omit when there is no real credential."),
  stats: z.array(statSchema).length(3)
    .describe("Exactly three. The rail is a three-column grid."),
});

export type HeroSplitProps = z.infer<typeof heroSplitSchema>;

/** Shown to the AI when it is choosing which section to use. */
export const aiHint = `
Split hero: copy on the left, portrait image on the right with a credential
badge overlapping its left edge, and a three-column stats rail beneath.

Use for service businesses that need one strong call to action above the fold
and have concrete numbers to show (response time, guarantee, coverage).

Do not use when there is no usable photograph, or when the business has no
quantifiable proof points — the stats rail will read as filler.
`.trim();

export const meta = {
  name: "HeroSplit",
  category: "hero" as const,
  aiHint,
  schema: heroSplitSchema,
};
