"use server";

import { redirect } from "next/navigation";
import { brokerAccess, brokerSignOut, sendBrokerLink } from "@/lib/loans/broker-auth";
import { MSG_COLS, serviceDb, type LoanMsg } from "@/lib/loans/server";

type R<T> = { ok: true; data: T } | { ok: false; error: string };

export async function requestBrokerLink(email: string): Promise<R<null>> {
  try {
    const r = await sendBrokerLink(email);
    return r.ok ? { ok: true, data: null } : r;
  } catch { return { ok: false, error: "We couldn't send the link just now — please try again." }; }
}

export async function brokerSignOutAction() {
  await brokerSignOut();
  redirect("/broker");
}

/** A broker (or the business previewing as one) writes to the client — it shows on their form. */
export async function brokerMessage(fileId: string, body: string): Promise<R<LoanMsg>> {
  try {
    const acc = await brokerAccess(fileId);
    if (!acc) return { ok: false, error: "You're signed out — sign in again." };
    if (acc.kind === "preview") return { ok: false, error: "This is a preview — message the client from your own loan file page." };
    const text = String(body ?? "").trim().slice(0, 4000);
    if (!text) return { ok: false, error: "Type a message first." };
    const db = serviceDb();
    const { data, error } = await db.from("loan_messages").insert({ organisation_id: acc.broker.organisation_id, file_id: fileId, from_side: "broker", author: `${acc.broker.name}${acc.broker.company ? ` (${acc.broker.company})` : ""}`, body: text }).select(MSG_COLS).single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as LoanMsg };
  } catch { return { ok: false, error: "Couldn't send." }; }
}
