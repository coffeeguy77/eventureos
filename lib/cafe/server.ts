import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { stateSecret } from "@/lib/integrations/oauth";
import { readCafe, webMenu, type CafeSettings, type Closure, type MenuSection, type Surcharges, type Weekly } from "./core";

/**
 * The café pages talk to the business's ordering app server-to-server, using the same public endpoints the app itself uses
 * (GET /api/config, GET /api/menu, POST /api/orders, POST /api/pay, POST /api/orders/:id/cancel, GET /api/order-status,
 * GET /api/captcha, POST /api/reserve). Orders, payments (Square) and bookings stay in the app.
 */

export interface CafeOrg extends PublicOrg { cafe: CafeSettings }

export async function cafeOrg(slug: string): Promise<CafeOrg | null> {
  const org = await publicOrg(slug).catch(() => null);
  return org ? { ...org, cafe: readCafe(org.rawSettings) } : null;
}

export class AppError extends Error { constructor(message: string, public status = 0) { super(message); } }

async function call<T>(appUrl: string, path: string, init: RequestInit & { timeout?: number; revalidate?: number } = {}): Promise<T> {
  if (!appUrl) throw new AppError("The ordering app isn't set up yet.");
  // Local testing only: point every café call at a stand-in app (never set in production).
  if (process.env.CAFE_APP_URL_OVERRIDE && process.env.VERCEL !== "1") appUrl = process.env.CAFE_APP_URL_OVERRIDE;
  const { timeout = 8000, revalidate, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${appUrl}${path}`, {
      ...rest,
      headers: { accept: "application/json", ...(rest.body ? { "content-type": "application/json" } : {}), "user-agent": "EventureOS website", ...(rest.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeout),
      ...(revalidate !== undefined ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch {
    throw new AppError("We couldn't reach our ordering system just now — please try again in a moment.");
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : "";
    throw new AppError(msg || `The ordering system said no (${res.status}).`, res.status);
  }
  return data as T;
}

export interface AppLocation { id: string; name: string; address?: string; squareLocationId?: string; _default?: boolean; type?: string; status?: string; hidden?: boolean }
export interface AppHours {
  open?: boolean; canOrderNow?: boolean; preorder?: boolean; orderingDisabled?: boolean; closesAt?: string | null;
  nextOpen?: { label?: string } | null; timezone?: string; weekly?: Weekly; hasHours?: boolean; openDays?: number[]; closedToday?: boolean; closures?: Closure[];
  kitchen?: { open?: boolean; categories?: string[]; hasHours?: boolean; weekly?: Weekly };
}
export interface AppConfig {
  applicationId: string; locationId: string; environment: string; currency: string; storeName: string;
  locations: AppLocation[]; surcharges: Surcharges | null; hours: AppHours | null; reservations: boolean;
  storePhoto: string | null; logoUrl: string | null; bio: string | null;
  scheduling: { timezone?: string; maxDaysAhead?: number } | null;
}

const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

/** The app's public config, trimmed to what the website needs. Never cached (it carries open/closed). */
export async function appConfig(appUrl: string): Promise<AppConfig> {
  const c = await call<Record<string, unknown>>(appUrl, "/api/config", { timeout: 6000 });
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    applicationId: s(c.applicationId), locationId: s(c.locationId), environment: s(c.environment) || "production", currency: s(c.currency) || "AUD", storeName: s(c.storeName),
    locations: Array.isArray(c.locations) ? (c.locations as AppLocation[]).filter((l) => l && typeof l.id === "string") : [],
    surcharges: (c.surcharges as Surcharges) ?? null, hours: (c.hours as AppHours) ?? null, reservations: c.reservations === true,
    storePhoto: httpsOrNull(c.storePhoto), logoUrl: httpsOrNull(c.logoUrl), bio: typeof c.bio === "string" ? c.bio.slice(0, 600) : null,
    scheduling: (c.scheduling as AppConfig["scheduling"]) ?? null,
  };
}

/** The store this website orders from: the app's default store (event and upcoming pop-up stores are skipped). */
export function mainLocation(cfg: AppConfig): AppLocation | null {
  const live = cfg.locations.filter((l) => !l.hidden && l.type !== "event" && l.status !== "upcoming");
  return live.find((l) => l._default) ?? live[0] ?? null;
}

export async function appMenu(appUrl: string, locationId: string | null): Promise<MenuSection[]> {
  const q = locationId ? `?location=${encodeURIComponent(locationId)}` : "";
  return webMenu(await call<unknown>(appUrl, `/api/menu${q}`, { timeout: 9000, revalidate: 60 }));
}

/** Both at once; never throws (the page shows a friendly fallback). */
export async function appSnapshot(appUrl: string, withMenu: boolean) {
  try {
    const cfg = await appConfig(appUrl);
    const loc = mainLocation(cfg);
    const menu = withMenu ? await appMenu(appUrl, loc?.id ?? null).catch(() => null) : null;
    return { cfg, loc, menu };
  } catch {
    return { cfg: null, loc: null, menu: null };
  }
}

// ------------------------------------------------------------------------------------------------
// Orders: create (held, unpaid) → pay with a Square card token → or cancel. The app releases an order to the kitchen
// only once it is paid. The amount we charge is the one the app returned, carried in a signed ticket so the browser
// can't change it.
// ------------------------------------------------------------------------------------------------

function secret() { return stateSecret() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null; }

export function signTicket(orderId: string, amount: number, currency: string) {
  const k = secret();
  if (!k) throw new AppError("Online ordering isn't configured on this website yet.");
  const body = `${orderId}.${amount}.${currency}.${Date.now()}`;
  return `${Buffer.from(body).toString("base64url")}.${createHmac("sha256", k).update(body).digest("base64url")}`;
}

export function readTicket(ticket: string): { orderId: string; amount: number; currency: string } | null {
  const k = secret();
  const [b, sig] = String(ticket || "").split(".");
  if (!k || !b || !sig) return null;
  const body = Buffer.from(b, "base64url").toString();
  const want = createHmac("sha256", k).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [orderId, amount, currency, t] = body.split(".");
  if (!orderId || Date.now() - Number(t) > 60 * 60 * 1000) return null;
  return { orderId, amount: Number(amount), currency };
}

export interface CreateOrderInput {
  cart: { variationId: string; quantity: number; modifierIds: string[]; note?: string; presetId?: string; custom?: boolean }[];
  name: string; phone: string; pickupAt: string | null; note: string; locationId: string | null;
}

export async function appCreateOrder(appUrl: string, i: CreateOrderInput) {
  return call<{ orderId: string; totalMoney: { amount: number; currency: string }; ticketName?: string }>(appUrl, "/api/orders", {
    method: "POST", timeout: 20000,
    body: JSON.stringify({ cart: i.cart, name: i.name, phone: i.phone || undefined, pickupAt: i.pickupAt, note: i.note || undefined, locationId: i.locationId || undefined, dineIn: false, cardPayment: true, src: "website" }),
  });
}

export async function appPay(appUrl: string, p: { orderId: string; amount: number; currency: string; sourceId?: string; verificationToken?: string; buyerEmail?: string; locationId: string | null }) {
  return call<{ status: string; receiptUrl?: string; comped?: boolean }>(appUrl, "/api/pay", {
    method: "POST", timeout: 30000,
    body: JSON.stringify({ orderId: p.orderId, totalMoney: { amount: p.amount, currency: p.currency }, sourceId: p.sourceId, verificationToken: p.verificationToken, buyerEmail: p.buyerEmail || undefined, locationId: p.locationId || undefined }),
  });
}

export async function appCancel(appUrl: string, orderId: string) {
  return call<{ ok: boolean }>(appUrl, `/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST", body: "{}", timeout: 10000 }).catch(() => ({ ok: false }));
}

export async function appOrderStatus(appUrl: string, orderId: string) {
  return call<{ status?: string }>(appUrl, `/api/order-status?orderId=${encodeURIComponent(orderId)}`, { timeout: 6000 });
}

export async function appCaptcha(appUrl: string) {
  return call<{ token: string; question: string }>(appUrl, "/api/captcha", { timeout: 6000 });
}

export async function appReserve(appUrl: string, r: { name: string; phone: string; email: string; party: number; at: string; notes: string; captchaToken: string; captchaAnswer: string }) {
  return call<{ ok: boolean }>(appUrl, "/api/reserve", { method: "POST", timeout: 15000, body: JSON.stringify({ ...r, company: "" }) });
}
