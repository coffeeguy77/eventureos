# Deployment

[Wiki](index.md) · [Configuration](configuration.md) · [APIs](apis.md) · [Architecture](architecture.md)

Production is a Next.js app on Vercel talking to the hosted Supabase project. `docs/CONVENTIONS.md` records the Vercel region as `syd1`. The public site is `https://www.eventureos.com.au` (`APP_URL`, and the fallback in `appBaseUrl()`).

## What gets deployed

`npm run build` runs `next build`. `npm start` is `next start`. The Vercel project uses the same scripts. `next.config.ts` turns off the `X-Powered-By` header, enables strict mode, and keeps `unpdf` external so PDF reading of supplier invoices stays a normal Node dependency.

There is no Dockerfile and no `supabase/config.toml`. Database changes are not applied by the Next.js deploy. They are SQL files in `supabase/migrations`, applied to the Supabase project. A new migration that the app already calls will fail in production until that file has been applied.

## Environment

Set the variables in [Configuration](configuration.md) on the Vercel project. Production and preview are different origins. OAuth providers must have the redirect URI for each origin you actually use. Preview deployments that do not set `APP_URL` will build redirect URLs from `VERCEL_PROJECT_PRODUCTION_URL` or the hard-coded production host, which will not match a preview URL. Set `APP_URL` on purpose.

`CRON_SECRET` must be set for Vercel Cron to be accepted. `SYNC_TRIGGER_SECRET` must match the Supabase Vault secret if the 10-minute Gmail sync is to run.

## Scheduled work

Three clocks:

| Clock | Schedule | Code |
|---|---|---|
| Vercel Cron | `0 17 * * *` (17:00 UTC daily) | `vercel.json` → `GET /api/cron/sync` with `CRON_SECRET` |
| Supabase `pg_cron` + `pg_net` | Gmail every 10 minutes. Google Calendar at :05 and :35 | `trigger_integration_sync` in `0029_frequent_sync.sql`, bearer `SYNC_TRIGGER_SECRET` |
| Supabase `pg_cron` | Every 15 minutes | `run_scheduled_automations()` — no HTTP hop |

The route comment on `/api/cron/sync` says Vercel Hobby only runs the HTTP cron once a day, which is why Gmail is also triggered from the database. A full Vercel run is the one that includes Xero, recurring invoices, hosting, shop billing, Learn renewals, and the other housekeeping listed in [APIs](apis.md). The Gmail-only call still runs booking jobs, the job board, Learn, payment reminders, promise-to-pay emails, plan charges, kitchen notices, and the email imports that are tied to Gmail. Shop billing, pricing, website reminders, recurring invoices and hosting are skipped when `providers` is set.

`run_scheduled_automations` does three things: follow-up tasks for quotes with no reply, overdue status for invoices that are **not** in Xero, and expiry of quotes past `expiry_date`. Xero invoices take their status from Xero.

Seat holds for unpaid class bookings have their own `pg_cron` tidy when the extension is installed (`0049_bookings.sql`, every 5 minutes).

## Custom domains

A business domain is stored against the organisation. `middleware.ts` calls `customDomain()` before the session middleware. The lookup uses the service-role key. Unknown hosts fall through to the normal EventureOS app. SEO redirects for that domain are applied in the same step. Robots and sitemap for the custom domain are the `/api/site/*` routes.

## Storage

Files live in the Supabase Storage bucket `documents`. Office uploads use `<organisation_id>/...`. Portal uploads use `<organisation_id>/portal/...`. The bucket is not a public website. Downloads go through the app.

## Health

Platform admin → Overview calls `admin_platform_stats` and `admin_system_health`. The health payload includes whether the database answered, whether `pg_cron` is installed, the last automation job, failures in the last 24 hours, integration errors, and how many support sessions are active. Use that page when a sync looks stuck. See [Platform admin](platform-admin.md).

## What a deploy does not do

- It does not run `supabase/seed/seed.sql`.
- It does not rotate `INTEGRATION_SERVER_KEY`. If you rotate it, update `private.server_keys` in the same change or token RPCs will fail.
- It does not register OAuth apps, Stripe webhooks, or the Resend webhook. Those are one-time settings in Google Cloud, Xero, Stripe and Resend, pointed at the URLs in [APIs](apis.md).
- It does not enable Hosting or Nerd Herd for a business. That is a row a platform admin sets.

## Region and data

The Supabase project in `.env.example` is `ap-southeast-2`. Organisation timezones default to `Australia/Sydney` and are used for “today”, reminder windows and follow-ups. Money defaults to AUD. None of that is inferred from the visitor’s browser.
