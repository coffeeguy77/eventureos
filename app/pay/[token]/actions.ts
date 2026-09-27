"use server";

import { redirect } from "next/navigation";
import { startCheckout } from "@/lib/payments/service";

export async function payByCard(token: string, _prev: { error?: string } | undefined): Promise<{ error?: string }> {
  let url: string;
  try {
    url = await startCheckout(token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start the payment. Please try again." };
  }
  redirect(url);
}
