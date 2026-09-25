import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Calendar" };

export default function Page() {
  return <ComingNext title="Calendar" subtitle="Every booking across every resource." items={["Month, week, day and agenda views", "Resources: Main Events, carts, catering, staff", "Prominent conflict warnings", "Google Calendar sync (Phase 2)"]} />;
}
