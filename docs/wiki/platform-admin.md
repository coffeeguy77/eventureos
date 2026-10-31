# Platform admin

[Wiki](index.md) · [Apps](apps.md) · [Auth and permissions](auth-and-permissions.md) · [Deployment](deployment.md)

`/admin` is the EventureOS operator console. It is not a role inside a customer’s organisation. `app/admin/layout.tsx` calls `is_super_admin()` and returns 404 for anyone else. That function is true only when `auth.uid()` is in `platform_admins`.

The link “Platform admin” appears at the bottom of the office sidebar when the signed-in user passes that check. The admin header links back to `/dashboard`.

## Pages

| Path | What it shows |
|---|---|
| `/admin` | Counts from `admin_platform_stats`: organisations, how many were active in the last 30 days, users, events, emails processed, published quote versions, MRR at list price for active paid plans, connected integrations by provider. Health from `admin_system_health`: database latency, cron job state, automation errors in 24 hours, integration errors, sync failures, open support sessions |
| `/admin/organisations` | Every organisation (`admin_organisations`). Status and plan can be changed (`admin_set_organisation_status`) |
| `/admin/clients/new` | Create a client organisation from the operator side, rather than through public sign-up |
| `/admin/clients/[id]` | One client: plan, which apps they have, and support actions |
| `/admin/plans` | Plan catalogue and the app ticks |
| `/admin/audit` | Support-session audit |
| `/admin/demo-requests` | Rows in `demo_requests`, from the sales page |

Provider labels on the overview are Gmail, Google Calendar and Xero. Statuses shown: connected, syncing, error, disconnected, not connected.

## Apps and plans

Which apps a business may open is decided here and enforced by `appAllowed()` in the office layout. Hosting and Nerd Herd stay off until they are ticked. The public marketing list of apps is `/apps` and reads the same `APPS` array, so the sales page and the lock cannot describe different products.

Plans are a label on `organisations.plan` (`trial` by default). `PLAN_LABEL` in the settings constants is what the office settings page prints. MRR on the admin overview is list price for active paid plans, not a sum of Stripe charges.

## Support sessions

From a client page, an admin starts a session with a reason and a length in minutes (`admin_start_support_session`). That inserts a time-limited `organisation_users` row titled `EventureOS Support`.

While it is active:

- The office app shows a support banner with the expiry.
- Emails, sign-offs and reply-to addresses use the business’s contact name and email, not the admin’s.
- The activity log actor is “EventureOS Support”.
- The section list is not applied.

`admin_end_support_session` ends it early. Otherwise it stops when `expires_at` passes, because `getContext()` ignores expired memberships. Active sessions are counted on the overview.

## Status

`admin_set_organisation_status` sets `active`, `suspended` or `cancelled`. Suspended office members are redirected to `/suspended`. The integration cron skips any organisation that is not active. Cancelling does not delete rows.

## What this console does not do

It does not bypass RLS for ordinary browsing of a customer’s events. A support session is a real membership, and queries still run as that user. It does not edit Gmail or Xero directly. It does not show integration tokens.
