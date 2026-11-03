/**
 * Where is a WordPress site hosted? Read from what the Web Culture Connector reports (its plugin list).
 * SiteGround installs its own plugins on every site it hosts: SiteGround Optimizer (sg-cachepress) and
 * Security Optimizer (sg-security).
 */
export type DetectedHost = "siteground" | null;
export const HOST_LABEL: Record<"siteground", string> = { siteground: "SiteGround" };

export function detectHost(plugins: { file: string; name?: string | null }[] | null | undefined): DetectedHost {
  for (const p of plugins ?? []) {
    if (/^(sg-cachepress|sg-security|siteground-[\w-]+)\//i.test(p.file) || /siteground/i.test(p.name ?? "")) return "siteground";
  }
  return null;
}
