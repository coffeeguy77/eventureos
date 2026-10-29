import { CheckAll } from "@/components/hosting/check-all";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Site checks" };

/** Website & email checks: one domain, or every hosting account at once. */
export default function SiteChecksPage() {
  return <CheckAll />;
}
