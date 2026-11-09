# User flows

[Wiki](index.md) · [Features](features.md) · [Auth and permissions](auth-and-permissions.md) · [Integrations](integrations.md)

These are the paths the code implements. Names in brackets are routes or database functions you can search for.

## Join a business

1. **New account.** `/signup` collects name, email and a password of at least 8 characters. If Supabase returns a session, the person goes to `/onboarding`. Otherwise they confirm the email via `/auth/callback?next=/onboarding`.
2. **Create the organisation.** Onboarding asks for a business name, a workspace id (the slug), and a business type. `create_organisation` makes them the owner and sets the `eos_org` cookie. They land on `/dashboard`.
3. **Invited instead.** Settings → Team sends an invitation (`organisation_invitations`). The next sign-in calls `accept_my_invitations()`. Onboarding does the same before it offers to create a new organisation. Roles you can invite: admin, manager, sales, staff. Owner is not an invite role.
4. **Another organisation.** An existing member opens `/onboarding?new=1`.
5. **Forgot the password.** `/login/code` emails a one-time code (`signInWithOtp`, and it will not create a user). The message is the same whether or not the email has an account. The code signs them in and `/login/new-password` sets a new password.

A suspended organisation sends the member to `/suspended`. A portal-only contact is sent to `/p/<slug>`. A crew member who is not an office user is sent to `/crew/<slug>`.

## Enquiry to paid event

This is the core loop.

1. **The enquiry arrives** in one of these ways:
   - Someone types it in (`/enquiries/new`).
   - The website form posts to `/api/public/enquiry/<slug>` with the form key. `capture_website_enquiry` rate-limits, matches an existing customer, and notifies the team. A honeypot field named `website` is left empty; bots that fill it get a fake success.
   - Gmail sync classifies a message (`email_classification`: event enquiry, existing event, quote discussion, general, supplier, spam, needs review).
   - Quote intake (`POST /api/public/quote-intake`) creates the customer match, the enquiry, the event and a **draft** quote. Sending the same `external_id` again is safe.
2. **Triage.** Status starts at new or needs review. The dashboard and the enquiry badge count those two. A team-wide notification is written either way. Round-robin assignment runs only when the “new enquiry” rule exists and is enabled. A new organisation does not have that rule until someone adds it under Settings → Automations.
3. **Convert.** From the enquiry workspace, convert to an event (`convert_enquiry_to_event`). The event number is the next value from `organisation_counters`.
4. **Quote.** Build lines from services and packages, then publish. The customer gets `/q/<token>`. Opening it marks the version viewed (`portal_mark_quote_viewed`). They accept or decline (`portal_respond_to_quote`), or a staff member records the answer.
5. **Acceptance.** New organisations are created with this rule already enabled. With approval set to off: the event is confirmed, a calendar entry is created, and an invoice is raised — deposit (default 30%), full amount, or none if invoicing is manual. Terms default to 14 days, or due now if “pay before the event” is on and the event is sooner. The assignee is notified. Turning the rule off records the acceptance and notifies you, and does nothing else.
6. **Approval.** If approval is “all”, or “short notice” and the event is inside the configured number of days, the event waits. An owner or admin approves from the banner on the event. Until then the invoice is not raised.
7. **No reply.** `pg_cron` runs `run_scheduled_automations` every 15 minutes. After `quote_follow_up_days` (default 3) with the follow-up rule on, it creates a high-priority “Follow up quote” task. Past `expiry_date`, the version becomes expired.
8. **Deliver.** Schedule tab, crew, kitchen order, documents, tasks. Confirmed work syncs to Google Calendar when that connection is on.
9. **Get paid.** The invoice has a pay link. Stripe Checkout collects the card payment onto the business’s Stripe account. The webhook records the payment. If the invoice lives in Xero, Xero remains the source of truth for the amount and the paid state; the “invoice paid in Xero” rule records the deposit and updates the portal.

## Customer portal

1. Staff invite a contact (the invite email is a portal email, not an office role).
2. The contact signs in at `/p/<slug>/login` and only sees that customer’s quotes, events, invoices and documents.
3. They can accept a quote, pay an invoice, upload a requested document (`portal_add_document`, stored under `<org_id>/portal/...`), and send a message (`portal_messages`).
4. Nerd Herd clients also see support tickets at `/p/<slug>/support` when that app is on.
5. Customers cannot read staff-only tables. The office portal page lists who has logged in and what they did (`actor_type = customer` on the activity log).

## Field staff and crew

- **Office field staff** (`role = staff`) sign in to the same app and only see `/my-jobs` and `/my-signature`. They see jobs they are rostered on (`event_staff`). Job details (hours, coffees, catering) appear only when `sees_job_details` is set. Prices and invoices stay hidden, in the menu and in RLS.
- **Crew** who are on `crew_members` but are not office users are redirected to `/crew/<slug>`. That app has the board, a shift, time away, pay, and a kitchen view. Regular shifts are generated eight weeks ahead.

## Classes

Public booking is `/book/<slug>` (also the short address `/<slug>` when classes are enabled). A student picks a course and session, pays by card, and manages the booking from a token link. Waitlists fill when a seat frees. Gift vouchers and promo codes apply at checkout. Agencies and case managers have their own sign-in and are invoiced rather than charged per seat. Certificates are issued from templates when a student finishes.

Test mode: the code `GIFTCARDTEST` makes the checkout free and marks the row `is_test`. It does not take a real seat. Settings → Testing lists them and can delete them. A test voucher only works on another test.

The cron sends reminders, thank-yous, scheduled gift certificates, and releases unpaid seat holds.

## Shop, wholesale, hire, cafe

- **Shop** (`/shop/<slug>`): catalogue, cart, account, subscriptions, gift cards, grind options. Orders can also be imported from WooCommerce order emails when that import is switched on. Subscriptions still billed by WooCommerce are not charged by EventureOS. The cron charges due subscriptions, ends pauses, and sends scheduled gift cards.
- **Wholesale** (`/order/<token>`): each customer has an unguessable ordering link and their own prices. The office gets run sheets and invoices. Ordermentum-style order emails can be imported on the Gmail sync.
- **Public hire site** (`/hire/<slug>`): the business’s own pages for equipment, catering, drinks, machines, printing and repairs. The office board for stock and bookings is `/rentals`, and only when Hire is enabled.
- **Cafe** (`/cafe/<slug>`): order, reserve, roasting club, wholesale. Instagram connect is a separate OAuth flow for this site.

## Learn (Academy)

Office: `/learn`. Learners: `/academy/<slug>`. The course content, plans and the training-room marketplace are documented in [docs/learn.md](../learn.md). Everything ships switched off. The cron ends expired passes and renews monthly plans only while selling is on.

## Quote from another system, and WordPress

- **Quote intake** is server-to-server. Settings → Integrations → Quote intake issues an `eos_live_…` key. `POST /api/public/quote-intake` with `Authorization: Bearer` that key. No CORS, so the key is not for a web page.
- **WordPress / Bookly** uses the same style of key, marked as the WordPress provider. `POST /api/public/wordpress` with `action: ping` or `action: bookly_sync`. Resending a Bookly id updates the same booking.

## Platform support

A platform admin starts a timed support session (`admin_start_support_session`). The office app then shows a banner. Mail and sign-off use the business’s own name and email, not the support person’s. The activity log still says “EventureOS Support”. The session expires (`expires_at` on the membership) or the admin ends it.
