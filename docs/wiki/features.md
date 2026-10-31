# Features

[Wiki](index.md) · [User flows](user-flows.md) · [Apps](apps.md) · [Public sites](public-sites.md)

This page is the signed-in office app: `app/(app)/`. Optional modules are in [Apps](apps.md). Customer-facing URLs are in [Public sites](public-sites.md).

The sidebar (`components/shell/sidebar.tsx`) is the menu. Labels can be renamed per organisation (hosting’s label comes from its settings). Hire and Franchise only appear when that flag is on. Field staff only see **My jobs**.

## Dashboard — `/dashboard`

The home page for everyone except field staff. It loads, in the organisation timezone:

- Events in the next 30 days, and a 7-day calendar strip
- Open enquiries, draft and sent quotes, invoices awaiting payment
- Payments received this month
- Email threads that need a reply or a review
- Open tasks, recent activity, portal messages
- For owners and managers: revenue by stream (financial year starts in July unless `settings.fy_start_month` says otherwise) and staffing gaps for the next 30 days

## To-do — `/tasks`

Open tasks across the organisation. The sidebar badge counts tasks that are not done and are due by the end of tomorrow. Tasks hang off events, enquiries and clients. Automations create follow-up tasks; paid-invoice follow-ups close themselves on the cron run.

## Enquiries — `/enquiries`

The inbox. Statuses: new, needs review, contacted, qualified, quote required, quote sent, negotiating, won, lost, archived. Sources include website, email, phone, referral, Instagram, Facebook, manual and other.

A website form posts to `capture_website_enquiry` (see [APIs](apis.md)). Gmail sync files mail into threads and can open an enquiry. Quote intake from another system creates an enquiry, an event and a draft quote together.

The enquiry workspace is where you match a client, reply, and **convert to an event** (`convert_enquiry_to_event`). New website enquiries can be assigned round-robin when that automation is on.

## CRM — `/crm`

Two boards: enquiries and events. Stages come from `app/(app)/crm/stages.ts`. Won enquiries and completed events stay on the board for 60 days. Filter to “mine” with `?owner=me`. Each card shows the next action from `lib/next-action.ts`.

## Clients — `/clients`

Companies and individuals (`customers`), with contacts. A contact can be linked to a portal user (`portal_user_id`). The client page holds events, quotes, invoices, notes, emails and documents. Customer-specific prices live in `customer_prices`.

## Quotes — `/quotes`

A quote is a draft header (`quotes`) plus sections and lines (`quote_sections`, `quote_items`). `line_total` is generated. Publishing (`publish_quote`) writes an immutable snapshot (`quote_versions`) with totals and acceptance fields.

The customer opens `/q/<token>`. Staff can also record accepted or declined (`staff_record_quote_response`). A sent version can be viewed, accepted, declined, expired or superseded. Unpublished edits set `has_unpublished_changes`.

Services and packages for the builder are in Settings → Services & pricing (`services`, `service_packages`). Saved starting points are `quote_templates`. Discounts are supported (migration `0037`).

On acceptance, if the `quote.accepted` rule is enabled, the app confirms the event, adds a calendar entry, raises a deposit or full invoice (or leaves invoicing manual), and notifies the assignee. Owners can require approval for every booking or only short-notice ones before that runs. See [User flows](user-flows.md).

## Events — `/events`

Each event has a number (`EV-<n>`), a client, date and time, venue, guest count, status and an assignee. Statuses: enquiry, planning, quoted, awaiting approval, confirmed, completed, cancelled. Multi-day events use a days list.

The workspace tabs are: Overview, Communication, Quote, Schedule, Tasks, Documents, Invoice, Payments, Activity.

Overview holds the details editor, the people on the job (`event_staff`, `event_crew`), a kitchen order when catering is quoted, and the next-action banner. Schedule shows calendar entries and same-day clashes on the same calendar. Communication is the email threads. Invoice and Payments are the money for that job.

## Calendar — `/calendar`

Local calendars and, when connected, Google calendars (`calendar_connections`). Entries (`calendar_events`) are an event, site visit, setup, hold or other. Confirmed work is pushed to the Google calendars you choose. Busy time can be pulled back. Resources and colours are Settings → Calendars & resources.

## Invoices — `/invoices`

Statuses: draft, awaiting payment, part paid, paid, overdue, void. `balance` is generated. A pay link is a 64-character `pay_token` at `/pay/<token>`. Credits are `invoice_credits`. Recurring invoices (`recurring_invoices`) are raised by the daily cron before the Xero sync so they can be pushed in the same run.

Invoices that have a Xero id take their status from Xero. The scheduled “mark overdue” job skips those. Payment reminders (before the event, and when overdue) send only for businesses that switch them on, and only between 9am and 5pm in the organisation timezone.

## Payments — `/payments`

Payments recorded in EventureOS, including card payments from Stripe Checkout. When Stripe and Xero are both connected, the Stripe settings page asks which Xero account receives the money. Saved cards are `customer_cards`. Instalment schedules are `payment_plans` and `payment_plan_instalments`; the cron charges an instalment that is due when a card is on file.

## Accounts — `/accounts`

Money owing: statements, collection notes and emails, a resolution centre, fee rules, and “you promised to pay today” emails (8am–5pm local). Twilio, when connected, sends texts from this area. Sub-pages: Resolution centre, Email results, Templates, Fees & terms.

## Wages — `/wages`

An app, but it sits in the main menu when it is allowed. Shifts come from events and from regular series (`staff_shift_series`, filled eight weeks ahead by cron). Staff can claim extra hours (`staff_hour_claims`). The page shows what is owed and what is paid (`staff_payments`). Past jobs and the shift editor are separate pages. Field staff see their own pay in the crew app, not this screen.

## Reports — `/reports`

Managers. Periods: this month, last 3 months, last 12 months, or custom. Enquiry sources, a funnel, and time-to-reply style figures. Sales people cannot open it.

## Customer portal (office side) — `/portal`

The public portal is `/p/<slug>`. This office page shows who has a login, recent customer activity, messages, document requests, and the shared document library. Branding (logo, colour, contact details) is Settings → Branding & portal.

## Settings — `/settings`

| Page | Who edits | What it is |
|---|---|---|
| Organisation | Owner, admin | Name, type, email, phone, ABN, address, website, timezone, currency. Timezone drives “today”, reminders and follow-ups. Changing currency does not convert old amounts |
| Apps | Owner, admin | Which catalogue apps this business can see. Locks are enforced by the layout |
| Branding & portal | | Logo, colour, portal wording |
| Team | | Invites, roles, section limits, “add me to every event”, “sees job details” |
| Email signatures | | Shared signatures and versions. Each person also has `/my-signature` |
| Services & pricing | | The quote price list |
| Calendars & resources | | Local calendars and Google calendar mapping |
| Automations | Managers toggle; owners and admins change the numbers | Deposit percent, payment terms, follow-up days, approval policy, and the four standard rules. A new organisation starts with “follow up unanswered quotes” and “quote accepted” already on |
| Website enquiry form | | The public form key and the embed snippet |
| Integrations | Managers | Gmail, second Gmail, Google Calendar, Xero, Stripe, Twilio, quote intake, import review |
| Email forwarding & sending | | Resend inbound address and the business’s own sending domain |
| Testing | Owner, admin | Test checkouts with the code `GIFTCARDTEST`, then clear them |

Hire’s on/off switch is on the organisation page when the business is not on the newer per-app access list.

## Also in the office app

| Path | What it is |
|---|---|
| `/my-jobs` | Field staff home. Jobs they are rostered on. No prices or invoices |
| `/my-bonuses` | Sales bonuses (`sales_bonuses`) for the signed-in person |
| `/my-signature` | That person’s email signature |
| `/xero-quotes/[id]` | A quote that lives in Xero, opened from the import |
| `/notifications` | The top-bar list is loaded in the layout; this path is always allowed by section limits |

Search, notifications, organisation switch and quick-create live in the top bar (`components/shell/topbar.tsx`). On a phone the same destinations are a tab bar plus a More sheet (`components/shell/mobile-nav.tsx`).
