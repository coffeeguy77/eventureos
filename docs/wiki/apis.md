# APIs

[Wiki](index.md) · [Integrations](integrations.md) · [Auth and permissions](auth-and-permissions.md) · [Deployment](deployment.md)

Almost every mutation in the office app is a **server action** (`"use server"` in an `actions.ts` beside the page), not a REST route. The routes under `app/api/` are the ones an outside system calls: OAuth redirects, webhooks, public forms, and cron.

There is no public API for reading an organisation’s clients or events. Those queries run as the signed-in user through Supabase, and RLS applies.

## Office and platform auth

| Method | Path | What it does |
|---|---|---|
| GET | `/auth/callback` | Supabase email-confirmation redirect. Sends new users toward onboarding |

Sign-in, sign-up, the email code and password change are server actions in `app/(auth)/actions.ts`.

## OAuth

| Method | Path | What it does |
|---|---|---|
| GET | `/api/integrations/<provider>/connect` | Starts OAuth for a live provider. Provider is `gmail`, `google_calendar` or `xero`. The second Gmail account uses Gmail’s redirect |
| GET | `/api/integrations/<provider>/callback` | OAuth return. State is signed with `OAUTH_STATE_SECRET` or, if that is unset, `CRON_SECRET` |
| GET | `/api/stripe/connect` | Stripe Connect start, for the platform account |
| GET | `/api/stripe/connect/callback` | Stripe Connect return |
| GET | `/api/instagram/connect` | Instagram login for the cafe site. Needs `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` |
| GET | `/api/instagram/callback` | Instagram return. Short-lived token is exchanged for a long-lived one |

Redirect URIs are built from `APP_URL` (`appBaseUrl()` in `lib/integrations/registry.ts`). If `APP_URL` is unset, the request origin is used, then `VERCEL_PROJECT_PRODUCTION_URL`, then `https://www.eventureos.com.au`.

## Webhooks

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/stripe/webhook` | `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` | Platform Connect webhook. Checkout completed (including async payment) and account deauthorised. Stripe must be set to “events on connected accounts” |
| POST | `/api/stripe/webhook/<org>` | The organisation’s webhook secret | A business that connected Stripe with its own secret key, not Connect |
| POST | `/api/resend/webhook` | Svix signature, `RESEND_WEBHOOK_SECRET` | `email.received` is inbound mail for a forwarding address. Other events update `email_send_recipients` (delivered, bounced, complained, failed, delayed, and opens or clicks if tracking is on) |

A bad signature is rejected. Inbound processing returns 500 when it fails so Resend retries.

## Cron

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/api/cron/sync` | `Authorization: Bearer` `CRON_SECRET` or `SYNC_TRIGGER_SECRET` | Background work. `maxDuration` is 300 seconds. Without a service-role key it returns success and does not sync |

Query `providers` limits the integration sync:

- omitted — Gmail, second Gmail, Google Calendar and Xero, plus the housekeeping jobs below
- `gmail` — also runs the second Gmail account
- `gmail,google_calendar` — the shape the frequent Supabase jobs use
- `email_setup` — only forwarding-address setup and sending-domain DNS checks, then returns

On a full run the route also: fills regular shifts eight weeks ahead; booking reminders and unpaid holds; job-board letters and closing expired posts; shop subscription billing; Learn pass expiry and renewals; website “finish your checkout” reminders (only if enabled); invoice payment reminders (9am–5pm local, only if enabled); promised-payment emails; payment-plan charges; closing to-do items whose invoice is now paid; wholesale, shop and ClassBento email imports when Gmail is in the run; kitchen change emails; recurring invoices (before Xero, so they push in the same run); then each connected integration; then hosting sync and billing (after Xero).

Suspended organisations are skipped. A provider that runs past the time budget is marked skipped.

Database automations (`run_scheduled_automations`) do not use this route. `pg_cron` calls that function every 15 minutes.

## Public intake

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/public/enquiry/<slug>` | `key` query or body field, the organisation’s `public_form_key` | Website enquiry. CORS open. See [Public sites](public-sites.md) |
| POST | `/api/public/quote-intake` | `Authorization: Bearer eos_live_…` or `X-Eventureos-Key` | Finished quote from another system. JSON only, 256 KB max, no CORS. Creates a draft quote. Same `external_id` is idempotent |
| GET | `/api/public/quote-intake` | — | Describes the endpoint. Not the way to submit |
| POST | `/api/public/wordpress` | Bearer key whose provider is `wordpress` | `ping`, or `bookly_sync` of services and appointments. 4 MB max |
| POST | `/api/public/quote-link` | — | Resolves a public quote link |
| POST | `/api/public/track/<slug>` | — | Records a public-site hit |
| GET | `/api/public/cart-stop` | — | Cart-abandonment stop link |
| POST | `/api/public/machines` | — | Coffee-machine website enquiry |
| POST | `/api/public/printing` | — | New print job and artwork |
| POST | `/api/public/printing/approve` | — | Customer approves a print quote |
| POST | `/api/public/printing/done` | — | Marks a print step done |
| POST | `/api/public/printing/more` | — | Customer asks for more on a print job |
| GET | `/api/public/hosting/status` | — | Public hosting status |

Quote-intake and WordPress keys are checked by hashing the bearer token and calling `intake_connection`. A WordPress key is rejected on the quote-intake route, and the reverse.

## Files and downloads

| Method | Path | What it does |
|---|---|---|
| GET | `/api/book/certificate/<token>` | Certificate PDF |
| GET | `/api/book/gift/<token>` | Gift PDF |
| GET | `/api/book/ics/<token>` | Calendar file for a booking |
| GET | `/api/jobs/c/<token>` | Job-board candidate file |
| GET | `/api/jobs/o/<token>` | Job-board employer file |
| GET | `/api/offers/<id>/poster` | QR poster for an offer. Requires an office session |
| GET | `/api/t/o/<id>` | Tracked open for a sent email |
| GET | `/api/site/robots` | robots.txt for a custom domain |
| GET | `/api/site/sitemap` | sitemap for a custom domain |

## Imports

| Method | Path | What it does |
|---|---|---|
| GET, POST | `/api/import/<kind>` | Legacy certificate import. `kind=certificates` posts rows. `kind=certificate-files` lists or uploads files still missing. Authorised with an import key (`import_keys`), checked in `lib/imports/server.ts`. Unknown kinds return 404 |

## Calling Supabase from the app

Office pages use `createClient()` and then `.from()` or `.rpc()`. Functions a teammate will meet:

| RPC | Used for |
|---|---|
| `create_organisation` | Onboarding |
| `accept_my_invitations` | After sign-in |
| `global_search` | ⌘K |
| `convert_enquiry_to_event` | Enquiry → event |
| `capture_website_enquiry` | Public form |
| `publish_quote`, `build_quote_snapshot` | Publishing |
| `staff_record_quote_response` | Staff records accept or decline |
| `portal_branding`, `portal_claim_access`, `portal_mark_quote_viewed`, `portal_respond_to_quote`, `portal_add_document` | Portal |
| `get_integration_tokens` and the save / refresh / disconnect RPCs | OAuth tokens |
| `is_super_admin`, `admin_platform_stats`, `admin_system_health`, `admin_organisations`, `admin_set_organisation_status`, `admin_start_support_session`, `admin_end_support_session` | Platform admin |
| `run_scheduled_automations` | pg_cron only. Execute is revoked from client roles |
| `trigger_integration_sync` | pg_cron only. Reads the Vault secret and calls the cron URL |

The full function list changes with each migration. Search `supabase/migrations` for `create or replace function` before assuming a signature.
