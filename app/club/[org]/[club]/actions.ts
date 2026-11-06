"use server";

import { clubCtx, saveQuote, bookQuote, removeQuote, type QuoteInput } from "@/lib/club/server";
import { currentPerson, requestCode, signOut, redeemWelcomeLink, verifyCode } from "@/lib/club/auth";

type R<T = null> = { ok: true; data: T } | { ok: false; error: string };
const gone = { ok: false as const, error: "This booking page isn't available. Please contact us." };

async function ctx(org: string, club: string) {
  const c = await clubCtx(String(org), String(club));
  if (!c) throw new Error(gone.error);
  return c;
}
async function signedIn(org: string, club: string) {
  const c = await ctx(org, club);
  const p = await currentPerson(c);
  if (!p) throw new Error("You've been signed out — sign in again.");
  return { c, p };
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

export async function sendCodeAction(org: string, club: string, who: string): Promise<R<{ ticket: string; to: string }>> {
  try {
    const r = await requestCode(await ctx(org, club), String(who ?? "").slice(0, 200));
    return r.ok ? { ok: true, data: { ticket: r.ticket, to: r.to } } : r;
  } catch (e) { return fail(e); }
}

export async function verifyCodeAction(org: string, club: string, ticket: string, code: string): Promise<R> {
  try {
    const r = await verifyCode(await ctx(org, club), String(ticket ?? ""), String(code ?? ""));
    return r.ok ? { ok: true, data: null } : r;
  } catch (e) { return fail(e); }
}

export async function welcomeAction(org: string, club: string, token: string): Promise<R> {
  try {
    const r = await redeemWelcomeLink(await ctx(org, club), String(token ?? ""));
    return r.ok ? { ok: true, data: null } : r;
  } catch (e) { return fail(e); }
}

export async function signOutAction(org: string, club: string): Promise<R> {
  try { await signOut(await ctx(org, club)); return { ok: true, data: null }; } catch (e) { return fail(e); }
}

export async function saveQuoteAction(org: string, club: string, id: string | null, input: QuoteInput, book: boolean): Promise<R<{ id: string; invoice: string | null; booked: boolean }>> {
  try {
    const { c, p } = await signedIn(org, club);
    const qid = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    const s = await saveQuote(c, { id: p.id, name: p.name }, qid, input);
    if (!s.ok) return s;
    if (!book) return { ok: true, data: { id: s.data.id, invoice: null, booked: false } };
    const b = await bookQuote(c, { id: p.id, name: p.name }, s.data.id);
    if (!b.ok) return { ok: false, error: `Saved as a quote, but not booked: ${b.error}` };
    return { ok: true, data: { id: s.data.id, invoice: b.data.invoice, booked: true } };
  } catch (e) { return fail(e); }
}

export async function bookAction(org: string, club: string, id: string): Promise<R<{ invoice: string | null }>> {
  try {
    const { c, p } = await signedIn(org, club);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Refresh the page and try again.");
    return await bookQuote(c, { id: p.id, name: p.name }, id);
  } catch (e) { return fail(e); }
}

export async function removeQuoteAction(org: string, club: string, id: string): Promise<R> {
  try {
    const { c } = await signedIn(org, club);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Refresh the page and try again.");
    return await removeQuote(c, id);
  } catch (e) { return fail(e); }
}
