import type { HeroContent } from "@/lib/mock-ai";

export function extractHeroContent(schemaJson: unknown): HeroContent | null {
  if (!schemaJson || typeof schemaJson !== "object") return null;
  const nodes = (schemaJson as { nodes?: unknown[] }).nodes;
  const hero = nodes?.find(
    (n): n is { props: Record<string, unknown> } =>
      typeof n === "object" && n !== null && (n as { type?: string }).type === "HeroSplit",
  );
  if (!hero) return null;
  const p = hero.props;
  const actions = (p.actions as Array<{ label: string }> | undefined) ?? [];
  return {
    eyebrow: String(p.eyebrow ?? ""),
    heading: String(p.heading ?? ""),
    body: String(p.body ?? ""),
    primaryLabel: actions[0]?.label ?? "Get Started",
    outlineLabel: actions[1]?.label ?? "Learn More",
  };
}
