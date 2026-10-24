/**
 * Test mode — try every checkout without paying, then clear it all away. Pure.
 *
 * The test code (GIFTCARDTEST) makes a class booking, gift certificate, shop order or coffee gift card free. Whatever it
 * makes is marked is_test: it never takes a class seat, is hidden from the calendar, reports and lists, its emails say
 * TEST, certificates say "Test — not valid", office alerts aren't sent, and Settings → Testing clears it all.
 * A test gift certificate or gift card only works on another test — never on a real booking or order.
 */

export const TEST_CODE = "GIFTCARDTEST";

/** Is this the test code? (any case, spaces ignored) */
export const isTestCode = (code: string | null | undefined) => (code ?? "").replace(/\s+/g, "").toUpperCase() === TEST_CODE;

export interface TestingSettings { enabled: boolean }

/** organisations.settings.testing — the test code is on unless the business switches it off. */
export function readTesting(settings: unknown): TestingSettings {
  const t = ((settings ?? {}) as Record<string, unknown>).testing as Record<string, unknown> | undefined;
  return { enabled: t?.enabled !== false };
}

/** "TEST — Your booking is confirmed" */
export const testSubject = (subject: string, test: boolean | null | undefined) => (test ? `TEST — ${subject}` : subject);

/** What a test offer looks like to the checkouts: everything free, nothing counted against a real code. */
export const TEST_LABEL = "Test checkout — nothing to pay, nothing real is created";
