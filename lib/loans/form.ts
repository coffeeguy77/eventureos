/**
 * The loan application form, as data: steps → fields. The client's link renders it; the broker's live view reads the
 * same list, so both always show the same questions with the same labels.
 *
 * Answers are one flat object: applicant questions are stored as "a1.first_name", "a2.first_name" …, everything else
 * by key; repeatable lists ("vehicles") are arrays of rows.
 */

export type FieldType = "text" | "email" | "tel" | "date" | "money" | "number" | "select" | "textarea" | "yesno"
  /** tap buttons, one answer */ | "choice"
  /** tap buttons, any number (stored "A|B") */ | "multi"
  /** a tick box (stored "yes" or "") */ | "check";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  /** half width on wider screens */
  half?: boolean;
  /** only asked when another answer (same applicant) matches */
  /** a multi answer counts as matching when any of its picks is in the list */
  when?: { key: string; in: string[] };
  /** can be left blank without counting against progress */
  optional?: boolean;
  /** whose it is: stored "Applicant 1" / "Joint", shown with the applicants' names */
  owner?: boolean;
}

export interface ListDef {
  key: string;
  label: string;
  /** what one row is called ("vehicle") */
  item: string;
  fields: Field[];
  hint?: string;
}

export interface Step {
  key: string;
  title: string;
  intro?: string;
  /** asked once per applicant */
  perApplicant?: Field[];
  fields?: Field[];
  lists?: ListDef[];
  /** special steps rendered by the page itself */
  special?: "documents" | "connect" | "review";
}

const OWNER = (n: number) => [...Array.from({ length: n }, (_, i) => `Applicant ${i + 1}`), ...(n > 1 ? ["Joint"] : [])];

/** Owner values are stored as "Applicant 1" … so renaming someone never breaks them; shown with their name. */
export function ownerLabel(v: string, names: string[]): string {
  const m = /^Applicant (\d)$/.exec(v ?? "");
  if (m) return names[+m[1] - 1] || v;
  return v === "Joint" && names.length > 1 ? `Joint (${names.join(" & ")})` : v;
}

/** The consents every applicant gives before sending (the broker's Credit Guide is shown alongside). */
export const CONSENTS: Field[] = [
  { key: "c_privacy", label: "I've read and agree to the privacy statement", type: "check" },
  { key: "c_credit_guide", label: "I've received and read the Credit Guide", type: "check" },
  { key: "c_credit_check", label: "I authorise credit checks to be carried out", type: "check", hint: "Lets the broker and the lenders they approach get your credit report." },
  { key: "c_best_interests", label: "I understand my broker must act in my best interests", type: "check" },
  { key: "c_declaration", label: "I declare the information I've given is true and complete", type: "check", hint: "To the best of my knowledge. False information can affect the application." },
];

/** Loan purposes that decide which questions are asked (a client can pick several). */
export const BUYING = ["Buy a home", "Buy an investment", "Construction / building"];
export const SECURED = ["Refinance", "Equity release", "Debt consolidation"];
export const HOME_LOAN = [...BUYING, ...SECURED];

export const EMPLOYMENT = ["Employee (PAYG)", "Company director", "Self-employed / sole trader", "Contractor", "Retired", "Not working"];

export function steps(applicants: number): Step[] {
  const owner = OWNER(applicants);
  return [
    {
      key: "about", title: "About you", intro: "Your details as they appear on your ID.",
      perApplicant: [
        { key: "first_name", label: "First name", type: "text", half: true },
        { key: "last_name", label: "Surname", type: "text", half: true },
        { key: "dob", label: "Date of birth", type: "date", half: true },
        { key: "mobile", label: "Mobile", type: "tel", half: true },
        { key: "email", label: "Email", type: "email" },
        { key: "address", label: "Home address", type: "text" },
        { key: "address_since", label: "Lived there since", type: "date", half: true },
        { key: "residential", label: "You", type: "select", options: ["Own it with a loan", "Own it outright", "Rent", "Live with family", "Other"], half: true },
        { key: "marital", label: "Relationship status", type: "select", options: ["Married", "De facto", "Single", "Separated", "Divorced", "Widowed"], half: true },
        { key: "dependants", label: "Dependants (children under 18)", type: "number", half: true },
        { key: "licence_no", label: "Driver's licence number", type: "text", half: true },
        { key: "licence_state", label: "Licence state", type: "select", options: ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"], half: true },
      ],
    },
    {
      key: "loan", title: "Your loan", intro: "What you're looking to do — skip anything you're unsure of, we can talk it through.",
      fields: [
        { key: "purpose", label: "What's the loan for?", type: "multi", options: ["Buy a home", "Buy an investment", "Refinance", "Construction / building", "Equity release", "Debt consolidation", "Business", "Car or equipment"], hint: "Pick all that apply" },
        { key: "amount", label: "How much would you like to borrow?", type: "money", half: true, hint: "Leave blank if you're not sure" },
        // buying or building
        { key: "property_type", label: "What type of property?", type: "choice", options: ["House", "Apartment / unit", "Townhouse", "Vacant land", "Rural", "Commercial"], when: { key: "purpose", in: BUYING } },
        { key: "first_home", label: "Have you (or anyone applying) bought property before?", type: "choice", options: ["Yes", "No", "Not sure"], when: { key: "purpose", in: BUYING } },
        { key: "property_value", label: "Purchase price (or build cost)", type: "money", half: true, when: { key: "purpose", in: BUYING } },
        { key: "deposit", label: "Deposit you have", type: "money", half: true, hint: "Savings plus any usable equity in another property", when: { key: "purpose", in: BUYING } },
        { key: "deposit_source", label: "Where is the deposit coming from?", type: "multi", options: ["Savings", "Equity in a property", "Gift from family", "Sale of a property", "First home grant", "Super (FHSS)", "Other"], when: { key: "purpose", in: BUYING } },
        // borrowing against a property they own
        { key: "security_address", label: "Which property will the loan be secured against?", type: "text", when: { key: "purpose", in: SECURED } },
        { key: "security_value", label: "Estimated value of that property", type: "money", half: true, when: { key: "purpose", in: SECURED } },
        { key: "refi_balance", label: "Current loan balance to refinance", type: "money", half: true, when: { key: "purpose", in: ["Refinance"] } },
        { key: "refi_why", label: "Why refinance?", type: "multi", options: ["Lower rate", "Lower repayments", "Better features", "Cash out", "Fixed rate ending", "Change of lender service"], when: { key: "purpose", in: ["Refinance"] } },
        { key: "consolidate_amount", label: "Total of the debts to roll in", type: "money", half: true, hint: "List them under Other debts", when: { key: "purpose", in: ["Debt consolidation"] } },
        { key: "equity_for", label: "What will the equity be used for?", type: "text", when: { key: "purpose", in: ["Equity release"] } },
        // not property
        { key: "asset_what", label: "What are you buying?", type: "text", half: true, hint: "Make, model and year, or the equipment", when: { key: "purpose", in: ["Car or equipment"] } },
        { key: "asset_price", label: "Price", type: "money", half: true, when: { key: "purpose", in: ["Car or equipment"] } },
        { key: "asset_trade", label: "Deposit or trade-in", type: "money", half: true, optional: true, when: { key: "purpose", in: ["Car or equipment"] } },
        { key: "business_for", label: "What is the business loan for?", type: "textarea", when: { key: "purpose", in: ["Business"] } },
        // how they'd like the home loan set up
        { key: "rate_type", label: "Interest rate", type: "choice", options: ["Variable", "Fixed", "Split", "Not sure — need advice"], when: { key: "purpose", in: HOME_LOAN } },
        { key: "repay_type", label: "Repayments", type: "choice", options: ["Principal & interest", "Interest only", "Not sure — need advice"], when: { key: "purpose", in: HOME_LOAN } },
        { key: "io_years", label: "Interest-only period", type: "choice", options: ["1 year", "2 years", "3 years", "4 years", "5 years"], when: { key: "repay_type", in: ["Interest only"] } },
        { key: "frequency", label: "How often would you like to repay?", type: "choice", options: ["Weekly", "Fortnightly", "Monthly", "Not sure"] },
        { key: "features", label: "Any of these of interest?", type: "multi", options: ["Offset account", "Redraw", "Extra repayments"], optional: true, hint: "Optional — your broker can explain them", when: { key: "purpose", in: HOME_LOAN } },
        { key: "timeframe", label: "When do you need it?", type: "choice", options: ["As soon as possible", "Within a month", "1–3 months", "Just exploring"] },
        { key: "loan_notes", label: "Anything else we should know?", type: "textarea", optional: true },
      ],
    },
    {
      key: "work", title: "Work & income", intro: "Before tax, per year, unless it says otherwise.",
      perApplicant: [
        { key: "employment", label: "Employment", type: "select", options: EMPLOYMENT, half: true },
        { key: "occupation", label: "Occupation / role", type: "text", half: true },
        { key: "employer", label: "Employer or business name", type: "text", half: true, when: { key: "employment", in: EMPLOYMENT.slice(0, 4) } },
        { key: "abn", label: "Business ABN", type: "text", half: true, when: { key: "employment", in: ["Company director", "Self-employed / sole trader", "Contractor"] } },
        { key: "employed_since", label: "Started there", type: "date", half: true, when: { key: "employment", in: EMPLOYMENT.slice(0, 4) } },
        { key: "salary", label: "Salary or wages (gross, yearly)", type: "money", half: true },
        { key: "directors_wages", label: "Director's wages (yearly)", type: "money", half: true, when: { key: "employment", in: ["Company director"] } },
        { key: "other_income", label: "Other income (yearly)", type: "money", half: true, hint: "Bonuses, overtime, dividends, Centrelink" },
        { key: "other_income_what", label: "What is the other income?", type: "text", half: true },
      ],
      lists: [{
        key: "businesses", label: "Business income (your companies and trusts)", item: "business",
        hint: "From the latest financial statements. Don't include wages or fees already entered above.",
        fields: [
          { key: "name", label: "Company or trust", type: "text", half: true },
          { key: "owner", label: "Whose", type: "select", owner: true, options: owner, half: true, hint: "Joint is split evenly" },
          { key: "fy", label: "Financial year", type: "text", half: true, hint: "e.g. FY24/25" },
          { key: "result", label: "Result", type: "choice", options: ["Profit", "Loss"], half: true },
          { key: "net_profit", label: "Net profit or loss before tax", type: "money", half: true },
          { key: "addbacks", label: "Add-backs", type: "money", half: true, optional: true, hint: "Optional — e.g. depreciation, interest, one-off costs" },
          { key: "exclude", label: "Leave out of income (e.g. a trust loss nobody pays)", type: "check", optional: true },
          { key: "note", label: "Notes", type: "text", optional: true },
        ],
      }],
    },
    {
      key: "property", title: "Properties", intro: "Every property you own, including your home.",
      lists: [{
        key: "properties", label: "Properties", item: "property",
        fields: [
          { key: "address", label: "Address", type: "text" },
          { key: "owner", label: "Owner", type: "select", owner: true, options: owner, half: true },
          { key: "use", label: "Used as", type: "select", options: ["Home", "Investment", "Holiday", "Vacant land", "Commercial"], half: true },
          { key: "value", label: "Estimated value", type: "money", half: true },
          { key: "lender", label: "Loan with", type: "text", half: true, hint: "Leave blank if no loan" },
          { key: "balance", label: "Loan balance", type: "money", half: true },
          { key: "repayment", label: "Repayment per month", type: "money", half: true },
          { key: "rent", label: "Rent received", type: "money", half: true, hint: "Leave blank if it isn't rented" },
          { key: "rent_period", label: "Rent is paid", type: "choice", options: ["Per week", "Per month"], half: true },
          { key: "own_business", label: "Rented to my own business (rent counted in full)", type: "check", optional: true },
        ],
      }],
    },
    {
      key: "assets", title: "Assets", intro: "Your best estimate is fine.",
      lists: [
        { key: "vehicles", label: "Motor vehicles", item: "vehicle", fields: [
          { key: "owner", label: "Owner", type: "select", owner: true, options: owner, half: true },
          { key: "make", label: "Make, model and year", type: "text", half: true },
          { key: "value", label: "Estimated value", type: "money", half: true },
        ] },
        { key: "savings", label: "Savings and bank accounts", item: "account", fields: [
          { key: "owner", label: "Account holder", type: "select", owner: true, options: owner, half: true },
          { key: "bank", label: "Financial institution", type: "text", half: true },
          { key: "amount", label: "Balance", type: "money", half: true },
        ] },
        { key: "super", label: "Superannuation", item: "super fund", fields: [
          { key: "owner", label: "Whose", type: "select", owner: true, options: owner.filter((o) => o !== "Joint"), half: true },
          { key: "fund", label: "Fund name", type: "text", half: true },
          { key: "amount", label: "Balance", type: "money", half: true },
        ] },
        { key: "other_assets", label: "Other assets", item: "asset", hint: "Shares, business equity, boats, collections …", fields: [
          { key: "what", label: "What it is", type: "text", half: true },
          { key: "owner", label: "Owner", type: "select", owner: true, options: owner, half: true },
          { key: "value", label: "Estimated value", type: "money", half: true },
        ] },
      ],
      fields: [{ key: "contents", label: "Home contents (estimated value)", type: "money", half: true }],
    },
    {
      key: "debts", title: "Other debts", intro: "Home loans go under Properties. Everything else here.",
      lists: [
        { key: "cards", label: "Credit cards", item: "card", fields: [
          { key: "owner", label: "Whose", type: "select", owner: true, options: owner, half: true },
          { key: "lender", label: "Bank", type: "text", half: true },
          { key: "limit", label: "Limit", type: "money", half: true },
          { key: "balance", label: "Owing now", type: "money", half: true },
        ] },
        { key: "loans", label: "Car, personal and other loans", item: "loan", fields: [
          { key: "owner", label: "Whose", type: "select", owner: true, options: owner, half: true },
          { key: "type", label: "Type", type: "select", options: ["Car loan", "Personal loan", "Lease", "Business loan", "Buy now pay later", "Tax debt", "Other"], half: true },
          { key: "lender", label: "Lender", type: "text", half: true },
          { key: "balance", label: "Owing now", type: "money", half: true },
          { key: "repayment", label: "Repayment per month", type: "money", half: true },
        ] },
      ],
    },
    {
      key: "spending", title: "Living costs", intro: "Rough monthly figures for the household.",
      fields: [
        { key: "exp_groceries", label: "Groceries", type: "money", half: true },
        { key: "exp_utilities", label: "Power, gas, water, phone, internet", type: "money", half: true },
        { key: "exp_transport", label: "Car running costs and transport", type: "money", half: true },
        { key: "exp_insurance", label: "Insurance (health, car, home, life)", type: "money", half: true },
        { key: "exp_education", label: "Childcare and school fees", type: "money", half: true },
        { key: "exp_rent", label: "Rent or board (if you rent)", type: "money", half: true },
        { key: "exp_other", label: "Everything else", type: "money", half: true, hint: "Clothing, entertainment, subscriptions, medical" },
      ],
    },
    {
      key: "ahead", title: "Looking ahead", intro: "Lenders need to know the loan will still suit you down the track.",
      fields: [
        { key: "changes", label: "Do you expect changes in the next few years that could affect your repayments?", type: "choice", options: ["No", "Yes"], hint: "For example retiring, starting or growing a family, an income drop, or a big expense coming up." },
        { key: "changes_what", label: "What's changing?", type: "multi", options: ["Retiring", "Having a baby / parental leave", "Reduced income", "Changing jobs", "Large expense coming up", "Other"], when: { key: "changes", in: ["Yes"] } },
        { key: "changes_how", label: "How would you manage your repayments through this?", type: "textarea", when: { key: "changes", in: ["Yes"] } },
      ],
    },
    { key: "documents", title: "Documents", special: "documents", intro: "Upload, forward or find them in your email." },
    { key: "connect", title: "Connect", special: "connect", intro: "Optional — saves you finding statements yourself." },
    {
      key: "review", title: "Consent & send", special: "review",
      perApplicant: CONSENTS,
    },
  ];
}

/** Every single answer key for a step (lists count as one key). */
export function stepKeys(step: Step, applicants: number): string[] {
  const keys: string[] = [];
  for (let a = 1; a <= applicants; a++) for (const f of step.perApplicant ?? []) keys.push(`a${a}.${f.key}`);
  for (const f of step.fields ?? []) keys.push(f.key);
  for (const l of step.lists ?? []) keys.push(l.key);
  return keys;
}

/** Is a field asked, given the answers so far? */
export function fieldShown(f: Field, answers: Record<string, unknown>, prefix = ""): boolean {
  if (!f.when) return true;
  const v = answers[`${prefix}${f.when.key}`] ?? answers[f.when.key];
  return typeof v === "string" && v.split("|").some((x) => f.when!.in.includes(x));
}

/** How much of each step is answered: 0–1. Lists count once a row exists (or "none" ticked). */
export function stepProgress(step: Step, applicants: number, answers: Record<string, unknown>): number {
  if (step.special) return 0;
  let asked = 0, done = 0;
  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "");
  for (let a = 1; a <= applicants; a++) for (const f of step.perApplicant ?? []) {
    if (!fieldShown(f, answers, `a${a}.`) || f.optional) continue;
    asked++; if (has(answers[`a${a}.${f.key}`])) done++;
  }
  for (const f of step.fields ?? []) { if (!fieldShown(f, answers) || f.optional) continue; asked++; if (has(answers[f.key])) done++; }
  for (const l of step.lists ?? []) { asked++; if (has(answers[l.key]) || answers[`${l.key}__none`] === true) done++; }
  return asked ? done / asked : 0;
}

/** A label for any answer key ("a2.salary" → "Applicant 2 · Salary or wages"). */
export function labelFor(key: string, applicants: number, names: string[] = []): string {
  const m = /^a(\d)\.(.+)$/.exec(key);
  for (const s of steps(applicants)) {
    if (m) { const f = s.perApplicant?.find((x) => x.key === m[2]); if (f) return `${names[+m[1] - 1] || `Applicant ${m[1]}`} · ${f.label}`; continue; }
    const f = s.fields?.find((x) => x.key === key); if (f) return f.label;
    const base = key.split(/[.[]/)[0].replace(/__none$/, "");
    const l = s.lists?.find((x) => x.key === base); if (l) return l.label;
  }
  return key;
}

/** Clean what the browser sends: known keys only, strings trimmed and capped, lists capped. */
export function cleanAnswers(raw: unknown, applicants: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 500) => (v == null ? "" : String(v).slice(0, max));
  for (const s of steps(applicants)) {
    for (let a = 1; a <= applicants; a++) for (const f of s.perApplicant ?? []) { const k = `a${a}.${f.key}`; if (k in r) out[k] = str(r[k]); }
    for (const f of s.fields ?? []) if (f.key in r) out[f.key] = str(r[f.key], f.type === "textarea" ? 4000 : 500);
    for (const l of s.lists ?? []) {
      if (`${l.key}__none` in r) out[`${l.key}__none`] = r[`${l.key}__none`] === true;
      if (!(l.key in r)) continue;
      const rows = Array.isArray(r[l.key]) ? (r[l.key] as unknown[]).slice(0, 30) : [];
      out[l.key] = rows.map((row) => {
        const o: Record<string, string> = {}; const rr = (row ?? {}) as Record<string, unknown>;
        for (const f of l.fields) o[f.key] = str(rr[f.key]);
        return o;
      });
    }
  }
  return out;
}
