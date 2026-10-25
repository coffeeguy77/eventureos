import { SectionBar, type SectionLink } from "./section-bar";
import { currentPageMenu } from "./page-menu-server";
import type { SectionStyle } from "@/lib/site/page-menu";

export type { SectionLink };

/**
 * The section menu for a page, in the style chosen for that page in the page editor (bar / floating / hidden).
 * `floatable` = the page starts with a photo header the floating card can sit on.
 */
export async function SectionNav(props: {
  org: { slug: string; rawSettings: unknown }; title: string; titleHref: string; links: SectionLink[]; active?: string; label: string;
  actions?: React.ReactNode; cta?: { href: string; label: string; track?: string }; floatable?: boolean; defaultStyle?: SectionStyle;
}) {
  const { org, floatable = false, defaultStyle = "bar", ...rest } = props;
  const pm = await currentPageMenu(org);
  let style = pm.section ?? defaultStyle;
  if (style === "float" && !floatable) style = "bar";
  if (style === "hidden") return <div hidden data-section-nav data-section-style="hidden" data-floatable={floatable ? "1" : undefined} />;
  return <SectionBar {...rest} tone={pm.tone} style={style} floatable={floatable} />;
}
