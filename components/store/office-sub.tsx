"use client";

import { SubManager } from "@/components/shop/sub-manager";
import { officeSubAction } from "@/app/(app)/store/actions";
import type { Product, ShopSettings } from "@/lib/shop/core";
import type { SubView } from "@/lib/shop/server";

/** The same controls customers have, run by the office. */
export function OfficeSub(props: { slug: string; sub: SubView; products: Product[]; s: ShopSettings; perDelivery: number; cardLabel: string | null }) {
  return <SubManager {...props} office run={(id, c) => officeSubAction(id, c)} />;
}
