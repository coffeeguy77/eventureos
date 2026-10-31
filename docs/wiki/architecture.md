# Architecture

[Wiki](index.md) · [Overview](overview.md) · [Data model](data-model.md) · [Auth and permissions](auth-and-permissions.md) · [Deployment](deployment.md)

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 App Router, React 19, TypeScript (strict) |
| Data and auth | Supabase: Postgres, Auth, Storage, row-level security |
| UI | Tailwind CSS 3, shared components in `components/ui` and `components/records` |
| Host | Vercel. `docs/CONVENTIONS.md` records the region as `syd1` |
| Email | Resend (send and inbound). Gmail stays the mailbox when that integration is connected |
| Payments | Stripe Checkout, including Stripe Connect for the platform account |
| AI | Anthropic Messages API (`lib/ai/claude.ts`), used for enquiry classification, reply drafts, the Learn coach, and reading supplier invoices |
| PDFs | `pdf-lib` and `unpdf` (supplier-invoice reading). `unpdf` is a Node server dependency (`next.config.ts`) |

Node 20 or newer (`package.json` `engines`). Path alias `@/*` points at the repository root (`tsconfig.json`).

There is no `supabase/config.toml`. Schema changes are SQL files in `supabase/migrations`, applied to the hosted project. The app never talks to a database running on the developer machine.

## How a request is served

```
Browser
  → middleware.ts
       custom domain?  lib/site/host.ts rewrites to that business's site
       else            lib/supabase/middleware.ts refreshes the session
  → App Router page, server action, or app/api route
  → createClient() in lib/supabase/server.ts   (the signed-in user)
     or createServiceClient()                  (cron, webhooks, public tokens)
  → Postgres, with row-level security
```

`middleware.ts` runs on almost every path (static files and images are excluded). Public paths skip the login redirect. See the list in [Auth and permissions](auth-and-permissions.md).

Server Components and server actions call `requireOrg()` (`lib/context.ts`). That loads the user, their active memberships, and the organisation in the `eos_org` cookie. Queries still go through the user-scoped Supabase client. The convention is to filter `organisation_id` in the query as well, so the intent is obvious even though RLS is what enforces it.

Server actions live in an `actions.ts` next to the page (`"use server"`). They validate input and throw an `Error` with a plain-English message. Meaningful changes call `logActivity()` (`lib/activity.ts`) so the audit trail is a sentence a person can read.

Do not put the service-role key in request handling for signed-in pages. It is for background jobs, webhooks, and lookups that have no user session (a pay link, an inbound email, a public form that has already checked its key inside a security-definer function).

## Folders

| Path | Role |
|---|---|
| `app/(app)/` | Signed-in office app. The layout checks the role, section list, and app locks |
| `app/(auth)/` | Login, sign-up, email code, new password |
| `app/admin/` | Platform admin. Hidden unless `is_super_admin()` |
| `app/api/` | Route handlers: OAuth, webhooks, cron, public intake |
| `app/p`, `app/crew`, `app/book`, `app/shop`, `app/site`, `app/hire`, `app/cafe`, `app/jobs`, `app/academy`, `app/q`, `app/pay`, `app/order` | Public and customer-facing sites |
| `app/onboarding/` | Create an organisation |
| `components/` | UI, shell (sidebar, top bar), and feature components |
| `lib/` | Domain logic. One folder per area (`bookings`, `shop`, `integrations`, …) |
| `supabase/migrations/` | Schema, RLS, functions. Numbered, additive |
| `supabase/seed/` | Demo organisations. `generate_seed.py` writes `seed.sql` |
| `public/` | Brand assets and per-business media |

`app/(app)/layout.tsx` is the gate for the office UI: `canOpen()` for the role and any section list, then `appAllowed()` so a locked app redirects to Settings → Apps.

## Tenancy

Every tenant table carries `organisation_id`. Relationships that must not cross tenants use a **composite foreign key** `(id, organisation_id)`, so a quote cannot point at another organisation’s customer even if someone crafts the id.

Helper functions (security definer, so policies do not recurse):

| Function | Meaning after migration `0020` |
|---|---|
| `is_super_admin()` | Row in `platform_admins` |
| `is_org_member(org)` | Any role, including customer |
| `is_org_staff(org)` | Office: owner, admin, manager, sales. Field staff are excluded |
| `is_org_team(org)` | Office plus field staff. Customers excluded |
| `is_org_manager(org)` | Owner, admin, manager. Required for invoices, payments, and integration settings |

`canManage()` in `lib/context.ts` is the same three manager roles, used by the UI. The database is the real limit. See [Auth and permissions](auth-and-permissions.md).

Integration tokens are not readable by any client role. The app reaches them only through RPCs (`get_integration_tokens`, `save_integration_connection`, `update_integration_access_token`, `disconnect_integration`, and the service-role variant used by cron).

Published quote versions are immutable (a trigger). The audit log (`activity_logs`) is append-only.

## Two clocks for background work

| Runner | What it does |
|---|---|
| `pg_cron` every 15 minutes | `run_scheduled_automations()`: quote follow-ups, overdue invoices that are not in Xero, expired quotes |
| `pg_cron` + `pg_net` | Calls `/api/cron/sync` every 10 minutes for Gmail, and at :05 and :35 for Google Calendar (`0029_frequent_sync.sql`) |
| Vercel Cron | `vercel.json` hits `/api/cron/sync` daily at 17:00 UTC. The route comment says Hobby only allows a daily cron; the frequent sync is the Supabase job |

`/api/cron/sync` also runs booking reminders, the job board, shop subscriptions, Learn renewals, payment reminders, wholesale and shop email imports, ClassBento imports, kitchen notices, recurring invoices, supplier-invoice reads, and hosting checks. The full list is in [APIs](apis.md) and [Deployment](deployment.md).

## UI conventions worth knowing

Colours are `brand-*` (violet accent), `ink`, `line`, `canvas`. Money goes through `money()`, dates through `fmtDate` / `fmtDateTime` / `relative` in the organisation timezone (`lib/format.ts`). Status colours come from `lib/status.ts`. Record pages surface the next action (`lib/next-action.ts`). The layout is desktop-first and must work at 375px wide.

Global search is `⌘K` (`global_search` RPC). Quick-create on a phone offers a new enquiry, event, quote, client or invoice.
