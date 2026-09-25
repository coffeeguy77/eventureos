import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Invoices" };

export default function Page() {
  return <ComingNext title="Invoices" subtitle="Every invoice, with Xero as the source of truth." items={["Invoice list with paid, balance and status", "“Synced with Xero” and last-sync time", "Automatic deposit or full invoice on quote acceptance", "Xero sync (Phase 3)"]} />;
}
