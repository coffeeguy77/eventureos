import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Payments" };

export default function Page() {
  return <ComingNext title="Payments" subtitle="What’s been paid, and what hasn’t." items={["Payment history by customer and event", "Part payments and outstanding balances", "Xero payment sync (Phase 3)"]} />;
}
