import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Settings" };

export default function Page() {
  return <ComingNext title="Settings" subtitle="Your organisation, team and integrations." items={["Integrations: Gmail, Google Calendar and Xero — connect, status, last sync", "Team members and roles", "Branding for quotes and the customer portal", "Automation rules (quote follow-up, acceptance actions)"]} />;
}
