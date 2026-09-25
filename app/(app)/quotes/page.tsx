import { ComingNext } from "@/components/records/coming-next";

export const metadata = { title: "Quotes" };

export default function Page() {
  return <ComingNext title="Quotes" subtitle="Beautiful proposals with draft and sent versions." items={["Quote builder with sections, packages and optional items", "Draft edits stay private until you publish", "Publishing creates a locked, customer-facing version", "Version history and acceptance capture"]} />;
}
