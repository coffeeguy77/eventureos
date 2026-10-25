"use server";
import { franchiseEnquiry, submitApplication } from "@/lib/franchise/server";

export async function sendFranchiseEnquiry(slug: string, f: Record<string, string>) {
  try { return await franchiseEnquiry(String(slug), f && typeof f === "object" ? f : {}); }
  catch { return { ok: false as const, error: "Couldn't send that — please try again or call us." }; }
}

export async function sendFranchiseApplication(slug: string, token: string, answers: Record<string, string>) {
  try { return await submitApplication(String(slug), String(token), answers && typeof answers === "object" ? answers : {}); }
  catch { return { ok: false as const, error: "Couldn't save your application — please try again." }; }
}
