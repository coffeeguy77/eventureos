import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Customer Portal" };

export default function Page() {
  return <ComingNext title="Customer Portal" subtitle="A branded portal for your customers." items={["Your logo, brand colour and contact details", "Customers see their events, quotes, documents and invoices", "Accept or decline quotes, with name, time, version and IP recorded", "Ask questions and upload requested documents"]} />;
}
