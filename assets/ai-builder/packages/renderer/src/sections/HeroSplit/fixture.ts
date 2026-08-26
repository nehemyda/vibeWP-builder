import type { HeroSplitProps } from "./schema";

/* Fixture used by the export fidelity test. Exercise every prop —
   an unexercised prop is an untested serializer path. */
export const fixture: HeroSplitProps = {
  eyebrow: "24/7 live dispatch active in Springfield",
  heading: "Rapid Emergency Repairs & Precision Plumbing Installation",
  body: "When water lines break or drains back up, PIPEPRO deploys licensed master technicians equipped with industrial-grade diagnostic cameras and hydro-jetters. Transparent upfront pricing, guaranteed code compliance, and swift turnaround.",
  features: [
    "Residential & commercial rapid repair",
    "Thermal leak detection & video inspection",
    "Fully stocked mobile dispatch vans",
    "Licensed, bonded & fully insured",
  ],
  actions: [
    { label: "Call (555) 123-4567", href: "tel:5551234567", variant: "primary" },
    { label: "Request Inspection Quote", href: "/contact", variant: "outline" },
  ],
  media: { src: "hero.jpg", alt: "Licensed master plumber on site" },
  badge: {
    mark: "✓",
    title: "Licensed & Insured",
    sub: "Master plumbers, code compliant",
  },
  stats: [
    { label: "Emergency dispatch", value: "< 45 MIN", note: "Average on-site arrival" },
    { label: "Code compliance",    value: "100%",     note: "Licensed master plumbers" },
    { label: "Estimate policy",    value: "UPFRONT",  note: "No hidden emergency fees" },
  ],
};
