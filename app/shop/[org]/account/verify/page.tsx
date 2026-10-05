import { notFound } from "next/navigation";
import { shopOrg } from "@/lib/shop/server";
import { ShopFrame } from "@/components/shop/frame";
import { ShopVerify } from "@/components/shop/account-forms";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function Verify({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const org = await shopOrg((await params).org);
  if (!org) notFound();
  const t = (await searchParams).t ?? "";
  return <ShopFrame org={org}><div className={`${PAGE} max-w-lg py-16`}><ShopVerify slug={org.slug} token={t} /></div></ShopFrame>;
}
