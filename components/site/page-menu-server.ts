import "server-only";
import { headers } from "next/headers";
import { footerPageKey } from "@/lib/site/footer-tone";
import { pageMenuFor } from "@/lib/site/page-menu";

/** This page's key and menu choices (site menu colour, section menu style). */
export async function currentPageMenu(org: { slug: string; rawSettings: unknown }) {
  const path = (await headers()).get("x-pathname") ?? "";
  const key = footerPageKey(path, org.slug);
  return { key, ...pageMenuFor(org.rawSettings, key) };
}
