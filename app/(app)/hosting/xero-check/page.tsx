import { XeroCheckView } from "@/components/hosting/xero-check";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Xero check" };

/** Cross-check against Xero, live: every customer and repeating invoice, and which business has it. */
export default function XeroCheckPage() {
  return <XeroCheckView />;
}
