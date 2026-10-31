# Integrations

[Wiki](index.md) · [APIs](apis.md) · [Configuration](configuration.md) · [Deployment](deployment.md)

Settings → Integrations is the office screen. The provider list is `PROVIDERS` in `lib/integrations/registry.ts`. A provider is either `live` (Connect works) or `coming_soon` (a card only).

Connection status for the live providers is a row in `integrations`. Tokens are not on that row.

## Live through the OAuth marketplace

| Provider | What it does | Required env |
|---|---|---|
| Gmail | Two-way sync. Mail stays in Gmail. Replies sent from EventureOS go out through that Gmail account. Enquiry capture, classification, and a historical import | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OAUTH_STATE_SECRET` or `CRON_SECRET` |
| Second Gmail | A separate mailbox, for example a manager who receives supplier invoices. Nothing is imported until you turn on a rule and preview it. Used for Pricing invoices and for enquiries that match rules you set | Same Google client |
| Google Calendar | Pushes confirmed events, site visits and setups to the calendars you choose, without duplicating them. Can show busy time from Google | Same Google client |
| Xero | Matches contacts to customers, brings in invoice and payment history, pushes new invoices. Xero stays the source of truth for amounts and payment status. Credit notes are read-only | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, and the state secret |

Optional for those four: `ANTHROPIC_API_KEY` (classification and drafts; Gmail only) and `SUPABASE_SERVICE_ROLE_KEY` (background sync). “Sync now” on the settings page works without the service-role key. The cron does not.

Xero scopes can be overridden with `XERO_SCOPES` (space-separated). Reconnecting is how a business picks up a new scope, for example listing bank accounts on the Stripe page. There is a recode screen (`/settings/integrations/xero/recode`) that remaps Xero invoice lines by item.

The review queue is `/settings/integrations/review`: `import_candidates` from Gmail and Xero, with a suggested customer, a score and reasons.

Redirect URI for a provider is `{APP_URL}/api/integrations/{provider}/callback`. The second Gmail account returns through the Gmail callback, because that URI is the one registered with Google.

## Live on their own pages

The registry still marks these cards `coming_soon`. The product pages are real. Use the pages, not the card.

### Stripe — `/settings/integrations/stripe`

Customers pay an invoice from `/pay/<token>` or the portal. Money lands in the business’s own Stripe account.

Two ways to connect:

- **Stripe Connect.** The platform account (`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`) acts on the connected account via the `Stripe-Account` header. One webhook URL for every business: `/api/stripe/webhook`. In the Stripe dashboard this endpoint must listen to events on connected accounts: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.application.deauthorized`.
- **The business’s own secret key.** Stored as the integration token. That business’s webhook is `/api/stripe/webhook/<org-id>`.

When Xero is also connected, the page asks which Xero bank account (or account code) receives the payment. If Xero is not connected, the payment is recorded in EventureOS only.

Checkout metadata includes `eventureos_invoice_id`, `eventureos_org_id` and `invoice_number`. A double-click within a minute for the same invoice and amount reuses one Checkout session.

### Twilio — `/settings/integrations/twilio`

Texts from Accounts: reminders, statement links, payment-plan schedules. The page asks for the Account SID, auth token, and a sender (an approved name of up to 11 characters, a Twilio number, or a Messaging Service SID). Replies cannot come back to a sender name; the message tells the customer to call or email. Only mobile numbers are texted. The connect action checks the credentials with Twilio before saving.

## Email without Gmail

Settings → Email forwarding & sending uses Resend.

- **Sending.** `RESEND_API_KEY`. The from-address defaults to `EventureOS <noreply@eventureos.com.au>` unless `EMAIL_FROM` is set. A business can add its own domain; the cron checks DNS while a domain is pending (`checkPendingDomains`).
- **Forwarding.** Each business can have an inbound address. `email.received` on `/api/resend/webhook` is read the same way Gmail mail is (enquiries, client mail, tickets). `INBOUND_EMAIL_DOMAIN` overrides the domain; otherwise it is taken from `EMAIL_FROM`.
- **Tracking.** Opens and clicks are stored when `RESEND_WEBHOOK_SECRET` is set. The quote page says whether tracking is on.

`/api/t/o/<id>` is the open-tracking pixel for a send.

## Quote intake and WordPress

Not OAuth. Settings → Integrations → Quote intake, and Bookings → Website & plugin, each issue an `eos_live_…` key.

| Endpoint | Creates |
|---|---|
| `POST /api/public/quote-intake` | Customer match, enquiry, event, draft quote. Idempotent on `external_id` |
| `POST /api/public/wordpress` | A ping, or a Bookly sync. Idempotent on the Bookly id |

The payload shape for quotes is version 1 in `lib/intake/normalise.ts`. Keys are hashed before they are stored.

## Instagram

Cafe only. `/api/instagram/connect` uses the Instagram Graph login (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`). It is not one of the `PROVIDERS` cards.

## Email imports on the Gmail sync

These run inside `/api/cron/sync` when Gmail is included, and only for businesses that have switched that import on:

| Import | Source |
|---|---|
| Supplier invoices | Gmail and the second Gmail account, for Pricing |
| Wholesale orders | Order emails such as Ordermentum |
| Shop orders | WooCommerce order emails (coffee orders and subscription renewals; class bookings are left out) |
| Class bookings | ClassBento “new booking” emails |

## Coming soon

Cards only. No connect route, no token, no sync:

Outlook, Microsoft Calendar, Square, MYOB, QuickBooks, Mailchimp, Zapier, Make.

The sales page says the same thing in shorter form: Gmail, Google Calendar, Xero and Stripe are the connections; Outlook, Microsoft 365, MYOB and QuickBooks are not supported yet. Twilio is live for Accounts texts even though that sentence does not mention it.

## Sync schedule

| Job | Schedule | Mechanism |
|---|---|---|
| Gmail (and the second account) | Every 10 minutes | `pg_cron` → `trigger_integration_sync('gmail')` → `GET /api/cron/sync?providers=gmail` |
| Google Calendar | Minute 5 and 35 of each hour | `trigger_integration_sync('google_calendar')` |
| Full sync, including Xero and the housekeeping jobs | Daily at 17:00 UTC | Vercel Cron, `vercel.json` |
| Quote follow-ups, non-Xero overdue invoices, quote expiry | Every 15 minutes | `pg_cron` calls `run_scheduled_automations()` inside the database. No HTTP |

The frequent HTTP jobs need a Vault secret named `sync_trigger_secret` whose value matches `SYNC_TRIGGER_SECRET` on Vercel. The migration comment says to create it with `vault.create_secret` and never commit the value. The URL baked into `trigger_integration_sync` is `https://www.eventureos.com.au/api/cron/sync`.

“Sync now” in the product runs as the signed-in manager and does not wait for either clock.
