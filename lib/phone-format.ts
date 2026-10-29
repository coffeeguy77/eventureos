/**
 * Australian phone numbers, tidied: Xero lets people type the number into the country, area and number boxes in
 * any combination ("0476 804" + "0476804565"), which used to be joined into one long wrong number. These rules pick
 * the real number out and format it the usual way. Pure — unit tested with node:test.
 */
const d = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** "0412345678" → "0412 345 678"; "0262734567" → "02 6273 4567"; "1300123456" → "1300 123 456". */
export function formatAu(digits: string): string {
  let n = digits;
  if (/^61\d{9}$/.test(n)) n = `0${n.slice(2)}`;
  if (/^[2-478]\d{8}$/.test(n)) n = `0${n}`;
  if (/^04\d{8}$/.test(n) || /^05\d{8}$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(n)) return `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  if (/^1[38]00\d{6}$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  if (/^13\d{4}$/.test(n)) return `${n.slice(0, 2)} ${n.slice(2)}`;
  if (/^\d{8}$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4)}`;
  return n;
}

/** A number from Xero's three boxes (country, area, number). */
export function fromXeroParts(p: { PhoneCountryCode?: string | null; PhoneAreaCode?: string | null; PhoneNumber?: string | null }): string | null {
  const raw = (p.PhoneNumber ?? "").trim();
  if (!raw) return null;
  const num = d(raw), area = d(p.PhoneAreaCode), cc = d(p.PhoneCountryCode);
  // a full number typed into the number box: ignore whatever is in the other boxes
  if (num.length >= 9) return formatAu(num);
  // a local number with a proper area code (02, 03, 07, 08 or 2, 3…)
  if (/^0?[2378]$/.test(area) && num.length === 8) return formatAu(`0${area.replace(/^0/, "")}${num}`);
  if (area && area.length <= 4 && !num.startsWith(area) && (area + num).length >= 9) return formatAu(area + num);
  // overseas numbers keep their country code (Australia's is left off)
  if (cc && cc !== "61" && cc.length <= 3 && num.length >= 6) return `+${cc} ${num}`;
  return formatAu(num) || raw;
}

/**
 * Tidy a stored number, splitting "Phone: 6260 6713 / Mobile: 0422 891 024" into separate numbers, and fixing ones
 * that were joined from Xero's boxes ("+0476 804 0476804565" → "0476 804 565").
 */
export function cleanStored(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[\r\n;/|]+|(?=\b(?:mobile|mob|phone|ph|office|work|fax|home)\s*:)/i).map((s) => s.replace(/^[^\d+]*/, "").trim()).filter(Boolean);
  const out: string[] = [];
  const add = (f: string) => { if (f && !out.includes(f)) out.push(f); };
  for (const p of parts) {
    const all = d(p);
    if (!all) continue;
    // overseas: "+63 917 827 5455", "0011+64 21 518 125"
    const intl = /^(?:\+(?!0|61|1[38]00)|0011)/.test(p.replace(/[^\d+]/g, ""));
    if (intl) { add(`+${all.replace(/^0011/, "")}`); continue; }
    // two mobiles typed together
    if (/^0\d{9}0\d{9}$/.test(all)) { add(formatAu(all.slice(0, 10))); add(formatAu(all.slice(10))); continue; }
    let pick = all;
    if (/^610\d{9}$/.test(all)) pick = all.slice(2);       // +61 02 6242 4677
    else if (all.length > 10) {
      // joined boxes ("+0476 804 0476804565", "02 0262959781"): the full number is at the end
      const last10 = all.slice(-10);
      if (/^(0[2-578]\d{8}|1[38]00\d{6})$/.test(last10)) pick = last10;
      else {
        const groups = p.split(/[^\d]+/).filter(Boolean).sort((a, b) => b.length - a.length);
        if (groups[0].length >= 8) pick = groups[0];
      }
    }
    add(formatAu(pick));
  }
  return out;
}
