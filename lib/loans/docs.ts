/**
 * The documents a broker usually needs, as a starting checklist for a new loan file (the broker can add, change or
 * remove items on the file). Financial years are the last two finished Australian ones (July–June).
 */

export interface DocTemplate { label: string; hint?: string; kind: string; perApplicant?: boolean }

/** The last two finished financial years, e.g. in Nov 2026 → ["FY24/25", "FY25/26"]. */
export function lastTwoFYs(today: string): { label: string; start: string; end: string }[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const lastEnd = m >= 7 ? y : y - 1; // the most recent 30 June that has passed
  return [lastEnd - 1, lastEnd].map((end) => ({
    label: `FY${String(end - 1).slice(2)}/${String(end).slice(2)}`,
    start: `${end - 1}-07-01`, end: `${end}-06-30`,
  }));
}

export function defaultDocs(today: string): DocTemplate[] {
  const fy = lastTwoFYs(today).map((f) => f.label).join(" & ");
  return [
    { label: "Driver's licence (front and back)", kind: "licence", perApplicant: true },
    { label: "Passport", kind: "passport", perApplicant: true },
    { label: "Medicare card", kind: "medicare", perApplicant: true },
    { label: `Notice of Assessment ${fy}`, kind: "noa", perApplicant: true },
    { label: `Individual tax returns ${fy}`, kind: "tax_return", perApplicant: true },
    { label: "Last 2 payslips", hint: "If you pay yourself director's wages or are an employee", kind: "payslip", perApplicant: true },
    { label: `Company tax returns ${fy}`, hint: "If available", kind: "company_tax" },
    { label: `Company profit and loss and balance sheet ${fy}`, hint: "Connect Xero and these are pulled for you", kind: "financials" },
    { label: "Home loan statements — last 6 months", kind: "home_loan" },
    { label: "Credit card, personal and car loan statements — last 3 months", kind: "debt_statement" },
    { label: "Latest rates notice for each property", kind: "rates" },
    { label: "Rental statements — last 3 months, or current lease agreements", kind: "rental" },
  ];
}

/** Gmail search words for each kind of document (attachments only, last two years). */
export const GMAIL_SEARCH: Record<string, string> = {
  noa: '"notice of assessment"',
  tax_return: '("tax return" OR "income tax return" OR itr)',
  company_tax: '("company tax return" OR "company return")',
  payslip: '(payslip OR "pay slip" OR "pay advice")',
  home_loan: '("home loan" statement) OR ("loan statement")',
  debt_statement: '("credit card" statement) OR ("car loan" statement) OR ("personal loan" statement)',
  rates: '("rates notice" OR "rates and charges" OR "general rates")',
  rental: '("rental statement" OR "owner statement" OR "lease agreement" OR "residential tenancy agreement")',
  financials: '("profit and loss" OR "balance sheet" OR "financial statements")',
};

/** The privacy statement shown before sending, until the broker writes their own (Loan files → Settings). */
export const defaultPrivacy = (org: string) =>
  `${org} collects, uses and stores your personal information to assess and arrange your loan and to meet our legal obligations. We may share it with lenders, mortgage insurers, valuers, aggregators and others reasonably involved in your application — never for any other purpose without your consent. You can access or correct the information we hold, or ask us about it, at any time; ask us for a copy of our Privacy Policy.`;
