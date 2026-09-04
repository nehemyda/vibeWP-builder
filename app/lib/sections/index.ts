import type { SectionDefinition } from "./types";
import { HeaderSimple } from "./header-simple";
import { HeaderCentered } from "./header-centered";
import { HeaderCta } from "./header-cta";
import { HeaderTopbar } from "./header-topbar";
import { HeaderMinimal } from "./header-minimal";
import { FooterSimple } from "./footer-simple";
import { FooterColumns } from "./footer-columns";
import { FooterContact } from "./footer-contact";
import { FooterCta } from "./footer-cta";
import { FooterSocial } from "./footer-social";
import { HeroSplit } from "./hero-split";
import { HeroCentered } from "./hero-centered";
import { HeroBanner } from "./hero-banner";
import { HeroStacked } from "./hero-stacked";
import { HeroShowcase } from "./hero-showcase";
import { HeroCards } from "./hero-cards";
import { HeroAurora } from "./hero-aurora";
import { HeroSpotlight } from "./hero-spotlight";
import { HeroDuotone } from "./hero-duotone";
import { HeroGlass } from "./hero-glass";
import { HeroPattern } from "./hero-pattern";
import { FeaturesGrid } from "./features-grid";
import { Testimonials } from "./testimonials";
import { FormSplit } from "./form-split";
import { FormCard } from "./form-card";
import { FormDetails } from "./form-details";
import { FormPhoto } from "./form-photo";
import { FormBand } from "./form-band";
import { FormEmbed } from "./form-embed";
import { CtaBand } from "./cta-band";
import { Faq } from "./faq";
import { ContactBlock } from "./contact-block";
import { ContactCards } from "./contact-cards";
import { ContactCallout } from "./contact-callout";
import { ContactHours } from "./contact-hours";
import { ContactVisit } from "./contact-visit";
import { ContactBand } from "./contact-band";
import { ContentAlternating } from "./content-alternating";
import { ContentSteps } from "./content-steps";
import { ContentStats } from "./content-stats";
import { ContentChecklist } from "./content-checklist";
import { ContentGallery } from "./content-gallery";
import { ServicesShowcase } from "./services-showcase";
import { ServicesEditorial } from "./services-editorial";
import { ServicesFeatured } from "./services-featured";
import { ServicesPricelist } from "./services-pricelist";
import { ServicesAccordion } from "./services-accordion";
import { ConversionPricing } from "./conversion-pricing";
import { ConversionGuarantee } from "./conversion-guarantee";
import { ConversionComparison } from "./conversion-comparison";
import { ConversionOffer } from "./conversion-offer";
import { ConversionLogos } from "./conversion-logos";
import { FaqTwoColumn } from "./faq-two-column";
import { FaqGrouped } from "./faq-grouped";
import { FaqWithHelp } from "./faq-with-help";
import { FaqOpen } from "./faq-open";
import { FaqSplit } from "./faq-split";
import { CtaSplit } from "./cta-split";
import { CtaBoxed } from "./cta-boxed";
import { CtaImage } from "./cta-image";
import { CtaDual } from "./cta-dual";
import { CtaStrip } from "./cta-strip";

export type { SectionDefinition, FieldSpec, FieldType, SectionCategory, SectionPlacement } from "./types";
export { HeaderSimple } from "./header-simple";
export { HeaderCentered } from "./header-centered";
export { HeaderCta } from "./header-cta";
export { HeaderTopbar } from "./header-topbar";
export { HeaderMinimal } from "./header-minimal";
export { FooterSimple } from "./footer-simple";
export { FooterColumns } from "./footer-columns";
export { FooterContact } from "./footer-contact";
export { FooterCta } from "./footer-cta";
export { FooterSocial } from "./footer-social";
export { HeroSplit } from "./hero-split";
export type { HeroSplitProps } from "./hero-split";
export { HeroCentered } from "./hero-centered";
export { HeroBanner } from "./hero-banner";
export { HeroStacked } from "./hero-stacked";
export { HeroShowcase } from "./hero-showcase";
export { HeroCards } from "./hero-cards";
export { HeroAurora } from "./hero-aurora";
export { HeroSpotlight } from "./hero-spotlight";
export { HeroDuotone } from "./hero-duotone";
export { HeroGlass } from "./hero-glass";
export { HeroPattern } from "./hero-pattern";
export { FeaturesGrid } from "./features-grid";
export { Testimonials } from "./testimonials";
export { FormSplit } from "./form-split";
export { FormCard } from "./form-card";
export { FormDetails } from "./form-details";
export { FormPhoto } from "./form-photo";
export { FormBand } from "./form-band";
export { FormEmbed } from "./form-embed";
export { CtaBand } from "./cta-band";
export { Faq } from "./faq";
export { ContactBlock } from "./contact-block";
export { ContactCards } from "./contact-cards";
export { ContactCallout } from "./contact-callout";
export { ContactHours } from "./contact-hours";
export { ContactVisit } from "./contact-visit";
export { ContactBand } from "./contact-band";
export { ContentAlternating } from "./content-alternating";
export { ContentSteps } from "./content-steps";
export { ContentStats } from "./content-stats";
export { ContentChecklist } from "./content-checklist";
export { ContentGallery } from "./content-gallery";
export { ServicesShowcase } from "./services-showcase";
export { ServicesEditorial } from "./services-editorial";
export { ServicesFeatured } from "./services-featured";
export { ServicesPricelist } from "./services-pricelist";
export { ServicesAccordion } from "./services-accordion";
export { ConversionPricing } from "./conversion-pricing";
export { ConversionGuarantee } from "./conversion-guarantee";
export { ConversionComparison } from "./conversion-comparison";
export { ConversionOffer } from "./conversion-offer";
export { ConversionLogos } from "./conversion-logos";
export { FaqTwoColumn } from "./faq-two-column";
export { FaqGrouped } from "./faq-grouped";
export { FaqWithHelp } from "./faq-with-help";
export { FaqOpen } from "./faq-open";
export { FaqSplit } from "./faq-split";
export { CtaSplit } from "./cta-split";
export { CtaBoxed } from "./cta-boxed";
export { CtaImage } from "./cta-image";
export { CtaDual } from "./cta-dual";
export { CtaStrip } from "./cta-strip";

/**
 * Every section the platform knows how to build.
 *
 * THE ONLY PLACE a new section needs registering. The serializer, the sync
 * parser, generation and the admin library all derive from this list, so
 * nothing else has to learn the section's name.
 *
 * Order here is the fallback ordering in the library; the admin row's
 * sortOrder overrides it.
 */
/*
 * Order is the natural reading order of a page — hero, what you do, proof,
 * questions, the ask, how to reach you. It seeds the library's default sort and
 * gives page generation a sensible sequence to work from.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a registry is heterogeneous by nature; each definition is strongly typed at its own declaration site.
export const SECTIONS: Array<SectionDefinition<any>> = [
  FormBand,
  FormPhoto,
  FormDetails,
  FormCard,
  FormSplit,
  FormEmbed,
  HeaderSimple,
  HeaderCta,
  HeaderTopbar,
  HeaderCentered,
  HeaderMinimal,
  // Heroes first, grouped, since a page picks exactly one of them.
  HeroSplit,
  HeroShowcase,
  HeroBanner,
  HeroStacked,
  HeroCentered,
  HeroCards,
  // Background-led: character comes from CSS, not a photograph.
  HeroAurora,
  HeroSpotlight,
  HeroDuotone,
  HeroGlass,
  HeroPattern,
  FeaturesGrid,
  // The services family: same job as FeaturesGrid, five ways of presenting it.
  ServicesShowcase,
  ServicesFeatured,
  ServicesEditorial,
  ServicesPricelist,
  ServicesAccordion,
  ContentAlternating,
  ContentSteps,
  ContentChecklist,
  ContentStats,
  ContentGallery,
  Testimonials,
  Faq,
  FaqOpen,
  FaqTwoColumn,
  FaqGrouped,
  FaqSplit,
  FaqWithHelp,
  CtaBand,
  CtaSplit,
  CtaBoxed,
  CtaImage,
  CtaDual,
  CtaStrip,
  ConversionPricing,
  ConversionGuarantee,
  ConversionComparison,
  ConversionOffer,
  ConversionLogos,
  ContactBlock,
  ContactCards,
  ContactHours,
  ContactVisit,
  ContactCallout,
  ContactBand,
  // Footers last, matching where they sit on a page.
  FooterColumns,
  FooterContact,
  FooterCta,
  FooterSocial,
  FooterSimple,
];

/** Keyed by the node type stored in page schemas, e.g. "HeroSplit". */
export const SECTIONS_BY_NODE_TYPE = new Map(SECTIONS.map((s) => [s.nodeType, s]));

/** Keyed by the human/URL identifier, e.g. "hero-split". */
export const SECTIONS_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

export function getSectionByNodeType(nodeType: string | undefined) {
  return nodeType ? SECTIONS_BY_NODE_TYPE.get(nodeType) : undefined;
}

export function getSectionByKey(key: string) {
  return SECTIONS_BY_KEY.get(key);
}
