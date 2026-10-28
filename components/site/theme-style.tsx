import type { PublicOrg } from "@/lib/bookings/server";
import { readTheme, themeBrand, themeCss } from "@/lib/site/theme";
import "@fontsource-variable/fraunces";
import "@fontsource/playfair-display/700.css";

/** The website theme's stylesheet (Website → Look & feel). Printed once per public page, by the site menu. Classic prints nothing. */
export function ThemeStyle({ org }: { org: PublicOrg }) {
  const t = org.theme ?? readTheme(org.rawSettings, !org.pureBrand);
  const css = themeCss(t, themeBrand(t, org.brand_colour));
  if (!css) return null;
  return <style data-site-theme={t.preset} dangerouslySetInnerHTML={{ __html: css }} />;
}
