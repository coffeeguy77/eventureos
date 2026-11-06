"use client";

/**
 * Print ZPL to a Zebra mobile printer straight from the browser over Bluetooth Low Energy (Web Bluetooth), using
 * Zebra's BLE parser service (Zebra app note "Bluetooth LE", AppNote-BlueToothLE-v4). Works in Chrome / Edge on
 * Android, Mac and Windows, and on iPhone in a Web Bluetooth browser such as Bluefy (Safari has no Web Bluetooth).
 */
const SERVICE = "38eb4a80-c570-11e3-9507-0002a5d5c51b";
const TO_PRINTER = "38eb4a82-c570-11e3-9507-0002a5d5c51b";

/* Minimal Web Bluetooth types (not in TypeScript's DOM lib) */
interface Char { writeValueWithResponse?: (v: BufferSource) => Promise<void>; writeValue: (v: BufferSource) => Promise<void> }
interface Gatt { connected: boolean; connect: () => Promise<Gatt>; disconnect: () => void; getPrimaryService: (s: string) => Promise<{ getCharacteristic: (c: string) => Promise<Char> }> }
interface Device { id: string; name?: string; gatt?: Gatt; addEventListener: (t: string, f: () => void) => void }
interface BT { requestDevice: (o: unknown) => Promise<Device>; getAvailability?: () => Promise<boolean> }
const bt = (): BT | null => (typeof navigator !== "undefined" && (navigator as unknown as { bluetooth?: BT }).bluetooth) || null;

let device: Device | null = null;
let char: Char | null = null;

export const bleSupported = () => !!bt();
export const printerName = () => device?.name ?? null;
export const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Choose the printer (the browser shows its list). By default only devices offering Zebra's print service are listed,
 * so phones, TVs and other gear don't clutter it; `all` lists every Bluetooth device nearby.
 */
export async function choosePrinter(all = false): Promise<string> {
  const b = bt();
  if (!b) throw new Error("This browser can't use Bluetooth printers.");
  const d = await b.requestDevice(all
    ? { acceptAllDevices: true, optionalServices: [SERVICE] }
    : { filters: [{ services: [SERVICE] }, { namePrefix: "XX" }, { namePrefix: "ZQ" }, { namePrefix: "Zebra" }], optionalServices: [SERVICE] });
  device = d; char = null;
  d.addEventListener("gattserverdisconnected", () => { char = null; });
  await ensure();
  return d.name ?? "Printer";
}

async function ensure(): Promise<Char> {
  if (!device) await choosePrinter();
  const g = device!.gatt;
  if (!g) throw new Error("That device can't be printed to over Bluetooth.");
  if (char && g.connected) return char;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const server = g.connected ? g : await g.connect();
      const svc = await server.getPrimaryService(SERVICE);
      char = await svc.getCharacteristic(TO_PRINTER);
      return char;
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 400)); }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(/service|characteristic|UUID/i.test(msg)
    ? "Connected, but this printer doesn't take print jobs over Bluetooth LE (it may only have classic Bluetooth). Download the label instead."
    : `Couldn't connect to the printer: ${msg}`);
}

/** Send ZPL in small chunks (BLE writes are limited; with-response writes are the reliable kind). */
export async function printZpl(zpl: string, copies = 1): Promise<void> {
  const c = await ensure();
  const bytes = new TextEncoder().encode(zpl.repeat(Math.max(1, Math.min(10, copies))));
  const size = 160;
  for (let i = 0; i < bytes.length; i += size) {
    const part = bytes.slice(i, i + size);
    if (c.writeValueWithResponse) await c.writeValueWithResponse(part); else await c.writeValue(part);
  }
}

export function forgetPrinter() {
  try { device?.gatt?.disconnect(); } catch { /* already gone */ }
  device = null; char = null;
}

/** Save the label as a .zpl file (for the Zebra app, or a printer on USB / Wi-Fi). */
export function downloadZpl(zpl: string, name: string) {
  const url = URL.createObjectURL(new Blob([zpl], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name.replace(/[^A-Za-z0-9._-]+/g, "_")}.zpl`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
