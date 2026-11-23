import { redirect } from "next/navigation";

/** Projects are listed on the portal home; this address just goes there. */
export default async function PortalProjects({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/p/${(await params).slug}`);
}
