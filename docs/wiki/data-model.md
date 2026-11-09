# Data model

[Wiki](index.md) · [Architecture](architecture.md) · [Auth and permissions](auth-and-permissions.md) · [Apps](apps.md)

Postgres on the hosted Supabase project. Schema is the ordered files in `supabase/migrations`. This page groups the tables. Column-level detail is in those files; do not treat this list as a substitute for the migration that added a column later.

## Rules that apply everywhere

- Tenant rows have `organisation_id`. Policies use `is_org_staff`, `is_org_manager`, `is_org_team` or a narrower check. Customers do not read staff tables.
- A child that must belong to the same organisation as its parent uses a composite foreign key `(id, organisation_id)`.
- `updated_at` is maintained by `set_updated_at()`.
- Human-readable numbers (enquiry, event, quote, invoice) come from `next_org_number()` and `organisation_counters`. Search and the record pages show them as `ENQ-<n>`, `EV-<n>` and `Q-<n>`.
- `organisations.settings` is jsonb. It holds quote behaviour, deposit percent, follow-up days, payment terms, the public form key, business details (including ABN), financial-year start, and the settings objects for hire, hosting, testing, the website, and other apps. Read them through the helpers in `lib/`, not by guessing keys.
- `integration_credentials` has no client-role select. Tokens move through RPCs. `private.server_keys` holds the hash of `INTEGRATION_SERVER_KEY`.
- Published `quote_versions` are immutable. `activity_logs` is append-only.
- Generated columns: `quote_items.line_total`, `invoices.balance`.

## Platform

| Table | Purpose |
|---|---|
| `users` | Profile for an `auth.users` id. Name, email, avatar, `ui_prefs` |
| `platform_admins` | Who may open `/admin` |
| `organisations` | The tenant. Slug, plan, status (`active`, `suspended`, `cancelled`), timezone, currency, settings |
| `organisation_users` | Membership. Role, title, status, `expires_at` (support sessions), `access` (section list), `auto_add_to_events`, `sees_job_details` |
| `organisation_invitations` | Pending invites. Role is admin, manager, sales or staff |
| `organisation_counters` | Per-org sequences |
| `platform_settings` | Platform-wide settings |
| `demo_requests` | Requests from the sales page |
| `private.server_keys` | Server key hashes |
| `private.form_submissions` | Public form submissions kept server-side |
| `private.org_split_map`, `private.org_split_backup` | Records from splitting an organisation |

`org_role` is `owner`, `admin`, `manager`, `sales`, `staff`, `customer`. `sales` was added after the original enum (Postgres requires the new value to commit before it is used).

## Clients, enquiries, events

| Table | Purpose |
|---|---|
| `customers` | Individual or company. Contact details, tags, Xero contact id |
| `contacts` | People at a customer. `portal_user_id` links a portal login. One can be primary |
| `enquiries` | The inbox row. Status, source, assignment, next action, link to a customer and event |
| `events` | The job. Number, date, times, venue, guests, budget, status, assignee |
| `event_contacts` | Extra contacts on an event |
| `event_staff` | Office users rostered on the event, with a role label |
| `event_crew` | Crew members on the event |
| `notes` | Notes on a record |
| `tasks` | To-do. Status open / in progress / done. Priority low / normal / high / urgent |
| `documents` | File metadata. Storage bucket `documents`, path `<org_id>/...` |
| `notifications` | In-app notices. A user id means it is for that person |
| `activity_logs` | The audit sentence, the actor, and a `changes` payload when fields change |

Enquiry statuses and event statuses are listed in [Features](features.md). Email classification is its own enum on threads.

## Quotes and money

| Table | Purpose |
|---|---|
| `services`, `service_packages` | The price list used by the quote builder |
| `quote_templates` | Reusable quote structures |
| `quotes` | Draft header, status, current version, unpublished-changes flag, expiry |
| `quote_sections`, `quote_items` | The draft lines |
| `quote_versions` | Immutable published snapshot, totals, acceptance name and reason |
| `customer_prices` | A price override for one customer |
| `invoices` | Including `pay_token`, Xero ids, kind, status. Balance is generated |
| `invoice_credits` | Credits applied to an invoice |
| `payments` | Money received |
| `customer_cards` | Saved cards (Stripe) |
| `payment_plans`, `payment_plan_instalments` | Instalments charged by the cron |
| `recurring_invoices` | Invoices raised on a schedule |
| `sales_bonuses` | Commission rows for `/my-bonuses` |
| `xero_quotes` | Quotes imported from Xero history |
| `collection_notes`, `collection_emails` | Accounts chasing |
| `account_issues`, `account_fees` | Resolution centre and fee rules |

Invoice statuses: draft, awaiting payment, part paid, paid, overdue, void. Quote statuses: draft, sent, viewed, accepted, declined, expired, superseded.

## Mail and calendars

| Table | Purpose |
|---|---|
| `email_threads`, `email_messages` | Conversations synced from Gmail or inbound forwarding |
| `email_blocklist` | Spam the business has blocked |
| `email_signatures`, `email_signature_versions`, `signature_profiles` | Signatures |
| `email_sends`, `email_send_recipients` | Mail EventureOS sent through Resend, and delivery events |
| `document_link_views` | Opens of a document link |
| `inbound_connections`, `inbound_deliveries` | Quote-intake and WordPress keys (the key is stored as a hash) and what they delivered |
| `import_candidates` | Suggested matches from Gmail or Xero, with a score, for the review screen |
| `import_keys` | Keys for the certificate import route |
| `calendar_connections` | A local or Google calendar, colour, resource, sync flag |
| `calendar_events` | A block on that calendar. Kind: event, site visit, setup, hold, other |

## Automations and integrations

| Table | Purpose |
|---|---|
| `automation_rules` | Trigger plus actions. The four standard triggers are `enquiry.created`, `quote.no_reply`, `quote.accepted`, `invoice.paid` |
| `automation_runs` | One row per run, with status and result |
| `integrations` | One row per provider per organisation. Status, account label, settings, last sync, last error |
| `integration_credentials` | Tokens. Not readable from the client |
| `integration_sync_logs` | Sync history. Managers only |

## Portal

`portal_messages` is the thread between the office and a customer. Portal uploads are documents whose storage path is under `<org_id>/portal/`.

## Crew and wages

`crew_members`, `crew_member_emails`, `event_crew`, `staff_shifts`, `staff_shift_series`, `staff_payments`, `staff_hour_claims`, `staff_unavailability`.

## App tables

Each optional app owns the tables named on [Apps](apps.md). In short:

- Classes: `booking_*`
- Job board: `job_profiles`, `job_employers`, `job_posts`, `job_threads`, `job_messages`, `job_invites`, `geo_cache`, plus employer login tables
- Shop: `shop_*`
- Wholesale: `wholesale_*`
- Learn: `learn_*`
- Hire: `hire_items`, `hire_bookings`, `hire_booking_lines`
- Pricing: `price_suppliers`, `price_invoices`, `price_lines`, `price_email_imports`
- Printing: `print_jobs`, `print_files`
- Hosting: `hosting_servers`, `hosting_server_credentials`, `hosting_accounts`, `hosting_events`
- Nerd Herd: `websites`, `support_tickets`, `support_ticket_updates`
- Franchise: `franchise_applications`
- Machines: `machine_jobs`
- Kitchen recipes: `catering_ingredients`, `catering_recipe_lines`
- Public website carts and events: `site_events`, `site_carts`, `site_url_hits`

## PostgREST joins that have two paths

When a table points at another twice, the embed must name the foreign key. The ones contributors hit most often (`docs/CONVENTIONS.md`):

- From quotes to the current version: `quote_versions!quotes_current_version_id_organisation_id_fkey`
- From a version back to the quote: `quotes!quote_versions_quote_id_organisation_id_fkey`
- Organisation members to users: `users!organisation_users_user_id_fkey`
- Enquiries to events: `events!enquiries_event_id_organisation_id_fkey`
- Events to the primary contact: `contacts!events_primary_contact_id_organisation_id_fkey`

## Demo data

`supabase/seed/seed.sql` is generated by `supabase/seed/generate_seed.py`. Dates are relative to the day it is generated. Re-running it removes and recreates only the two demo organisations and their users. See [Local setup](local-setup.md).
