# Overview

[Wiki](index.md) · [Architecture](architecture.md) · [Features](features.md) · [User flows](user-flows.md)

EventureOS is a multi-tenant web app for businesses that quote, book and deliver events: caterers, mobile bars and coffee carts, event hire, venues, planners and related trades. The sales page (`app/page.tsx`) describes it as event booking software and a CRM in one system, working with Gmail, Xero and Stripe.

The line the team sees in the sidebar is **“The early bird gets the booking.”** Customers never see that slogan.

## The path the core product is built around

Enquiry → client → event → quote → acceptance → calendar → delivery → invoice → payment.

That path is the core every organisation gets. Extra modules (classes, shop, hire, kitchen, hosting, and others) are [apps](apps.md) switched on per business.

## Who signs in

| Person | Where they land | How |
|---|---|---|
| Owner, admin, manager, sales | `/dashboard` | Email and password, or a one-time email code |
| Field staff (`staff` role) | `/my-jobs` | Same office login, limited menu |
| Casual crew on the staff list | `/crew/<slug>` | Staff app, separate from the office menu |
| Customer | `/p/<slug>` | Portal login linked to a contact |
| Student, shop customer, employer, case manager | Their public site | One-time email code, not an office user |
| Platform operator | `/admin` | An office user who is also in `platform_admins` |

A person can belong to more than one organisation. The current one is stored in the `eos_org` cookie. The sidebar shows a business switcher when they have more than one.

## What every business gets

From `lib/apps.ts` (`CORE`):

| Area | What it does |
|---|---|
| Enquiries | Website forms and Gmail in one inbox, with AI classification when a key is set |
| Clients and CRM | History, jobs, emails and money for each client |
| Quotes | Price lists and rules, accepted online |
| Events and calendar | Jobs, rosters, and Google Calendar |
| Invoices and payments | Card payments with Stripe, synced to Xero |
| Customer portal | Quotes, invoices and receipts for the client |
| To-do and reports | What needs doing, and how the business is going |

Settings also cover the team, branding, automations, calendars, email signatures, the website enquiry form, and a test-checkout mode.

## What is switched on separately

Fifteen apps live in the catalogue (`lib/apps.ts`). Hosting and Nerd Herd are **on request**: a business does not get them unless a platform admin ticks them. The others are available by default for organisations created before per-app access existed (`access === null`), and exactly the ticked set when an access list exists. Hire also has its own on/off switch in organisation settings.

See [Apps](apps.md) for each one, and [Platform admin](platform-admin.md) for who turns them on.

## What this is not

The integrations marketplace lists Outlook, Microsoft Calendar, Square, MYOB, QuickBooks, Mailchimp, Zapier and Make as **coming soon**. They are cards only (`availability: "coming_soon"` in `lib/integrations/registry.ts`). Stripe and Twilio are live on their own settings pages even though the same registry still marks those two cards as coming soon. See [Integrations](integrations.md).

The product does not run a local database. Postgres, Auth, Storage and row-level security are the hosted Supabase project named in `.env.example`.
