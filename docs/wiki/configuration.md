# Configuration

[Wiki](index.md) · [Local setup](local-setup.md) · [Integrations](integrations.md) · [Deployment](deployment.md)

Two places hold configuration: environment variables on the server, and `organisations.settings` plus the Settings screens for each business.

Never put a server secret in a `NEXT_PUBLIC_` variable. The publishable Supabase key is the exception that is meant to be public; RLS is the protection.

## Required to boot

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Project URL. `.env.example` points at the `eventureos` project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | Publishable key. Safe to expose |

`lib/env.ts` throws if either is missing. Copy `.env.example` to `.env.local` for local development. On Vercel, set them in Project → Settings → Environment Variables.

## Server secrets

Set these as sensitive on Vercel. Leave them empty locally until you need that feature.

| Variable | Used for |
|---|---|
| `INTEGRATION_SERVER_KEY` | Random 32-byte hex. Its SHA-256 must match `private.server_keys` where `name = 'integration'`. Rotate the env var and the row together |
| `OAUTH_STATE_SECRET` | Signs OAuth `state`. If it is empty, `CRON_SECRET` is accepted instead |
| `CRON_SECRET` | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Also a fallback OAuth state secret |
| `SYNC_TRIGGER_SECRET` | The same purpose as `CRON_SECRET`, for the Supabase `pg_cron` caller. Must match the Vault secret `sync_trigger_secret` |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron, webhooks, pay-link lookups, custom-domain lookup. Without it, “Sync now” still works and background sync does not |
| `APP_URL` | Public origin for OAuth redirects, links in emails, and Stripe return URLs. Production value in `.env.example` is `https://www.eventureos.com.au`. No trailing slash needed; the code strips one |
| `NEXT_PUBLIC_APP_URL` | Fallback if `APP_URL` is unset |

`appBaseUrl()` then falls through to the request origin, then `VERCEL_PROJECT_PRODUCTION_URL`, then `https://www.eventureos.com.au`.

## Integrations

| Variable | Used for |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail, second Gmail, Google Calendar |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | Xero |
| `XERO_SCOPES` | Optional. Space-separated scope string that replaces the default |
| `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET` | Platform Stripe Connect. All three are needed for Connect to be “ready”; the webhook secret is required for the platform webhook to accept events |
| `ANTHROPIC_API_KEY` | Enquiry classification, reply drafts, Learn coach, supplier-invoice reading |
| `ANTHROPIC_WORKSPACE_ID` | Optional workspace header on Anthropic calls |
| `AI_MODEL` | Overrides the default classification model |
| `AI_REPLY_MODEL` | Overrides the default reply-draft model |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Cafe Instagram connect |

A business can also store its own Anthropic key. `lib/ai/key.ts` prefers that key and falls back to `ANTHROPIC_API_KEY`. The lookup is cached for a minute.

Stripe for a single business can be that business’s own secret key, stored as an integration credential, instead of Connect. That path does not need the platform Stripe env vars. See [Integrations](integrations.md).

## Email

| Variable | Used for |
|---|---|
| `RESEND_API_KEY` | Sending. `emailConfigured()` is this variable being non-empty |
| `EMAIL_FROM` | Default from-address. If unset: `EventureOS <noreply@eventureos.com.au>` |
| `RESEND_WEBHOOK_SECRET` | Verifies `/api/resend/webhook`. Delivery tracking on the quote page is on only when this is set |
| `INBOUND_EMAIL_DOMAIN` | Domain for forwarding addresses. If unset, the domain is parsed from `EMAIL_FROM` |
| `DEMO_REQUEST_EMAIL` | Where demo requests from the sales page and from Settings → Apps are sent |

## Rarely set

| Variable | Used for |
|---|---|
| `CAFE_APP_URL_OVERRIDE` | Cafe public URL when `VERCEL` is not `1`. Ignored on Vercel |
| `NODE_ENV` | `secure` flag on shop, student, employer and case-manager cookies. `production` sets the flag |

`OUT` appears only in PDF unit tests, to write a file. It is not a product setting.

## Per organisation

Edited in the product, stored on `organisations` or in `settings`.

| Setting | Where | Default in the original schema |
|---|---|---|
| Timezone | Settings → Organisation | `Australia/Sydney` |
| Currency | Settings → Organisation | `AUD`. Changing it does not convert existing amounts |
| Plan and status | Platform admin | Plan `trial`, status `active` |
| `quote_acceptance_action` | Settings → Automations | `deposit_invoice`. Also `full_invoice` or `manual` |
| `deposit_percent` | Automations | 30 |
| `default_payment_terms_days` | Automations | 14 |
| `quote_follow_up_days` | Automations | 3 |
| Pay before the event | Automations | Off. When on, an invoice due after the event date is due now |
| Booking approval | Automations | Off, short-notice (with a day count), or all |
| Customer may edit | Automations | Whether a customer can change a booking detail |
| Public form key | Settings → Website enquiry form | Required for `/api/public/enquiry/<slug>` |
| Financial year start | Read by the dashboard | Month 7 (July) when `fy_start_month` is unset |
| Testing | Settings → Testing | On, until an owner or admin switches it off |
| Hire enabled | Settings → Organisation, or the Hire app | Off until switched on |
| App access list | Platform admin → the client, and Settings → Apps | `null` means every app except Hosting and Nerd Herd |
| Payment reminder rules | Automations | Off until switched on |
| Website comeback reminders | Website | Off until switched on |

Automation rules are rows in `automation_rules`, not env vars. `create_organisation` turns two of them on immediately: follow up unanswered quotes, and quote accepted → confirm the event, add it to the calendar, raise the deposit invoice, and notify the assignee. “New enquiry → assign” and “invoice paid in Xero” are not created until someone adds them under Settings → Automations. The four standard rules are listed in [Features](features.md).

Calendar connections, services, signatures, team section lists, and each app’s own settings (shop, wholesale, hosting menu label, Learn selling, and so on) are tables or nested jsonb edited on those screens. They are not environment variables.
