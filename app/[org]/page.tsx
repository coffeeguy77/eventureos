import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BookHome, { generateMetadata as bookMetadata } from "../book/[org]/page";
import { RESERVED } from "@/lib/short-links";

/** Short address: eventureos.com.au/<business> shows the business's classes page (its front door). */
export const dynamic = "force-dynamic";

type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(props: P): Promise<Metadata> {
  const { org } = await props.params;
  if (RESERVED.includes(org)) return {};
  return bookMetadata(props as never);
}

export default async function ShortLink(props: P) {
  const { org } = await props.params;
  if (RESERVED.includes(org) || !/^[a-z0-9-]{2,80}$/.test(org)) notFound();
  return BookHome(props as never);
}
