import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Reports" };

export default function Page() {
  return <ComingNext title="Reports" subtitle="How the business is really going." items={["Enquiries by source and conversion", "Revenue by month and event type", "Quote win rate and response times"]} />;
}
