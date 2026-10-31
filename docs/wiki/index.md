# EventureOS wiki

The operating system for event businesses. This wiki is written from the code in this repository: what the app actually does, how it is put together, and how to run it.

The root [README](../../README.md) still describes an early slice of the product. Treat this wiki as the current picture. Engineering rules for changing the code live in [docs/CONVENTIONS.md](../CONVENTIONS.md). The Academy (Learn) operator guide lives in [docs/learn.md](../learn.md).

## Start here

| Page | What it is for |
|---|---|
| [Overview](overview.md) | What EventureOS is, who uses it, and what every business gets |
| [Architecture](architecture.md) | Stack, folders, tenancy, and how a request is served |
| [Features](features.md) | The staff app: dashboard through reports |
| [User flows](user-flows.md) | How work moves from enquiry to payment, and the other journeys |
| [Apps](apps.md) | Optional modules switched on per business |
| [Public sites](public-sites.md) | Pages customers, students, staff and the public open without the office login |
| [Data model](data-model.md) | Tables, relationships, and the rules Postgres enforces |
| [APIs](apis.md) | HTTP routes: public forms, webhooks, OAuth, cron |
| [Auth and permissions](auth-and-permissions.md) | Roles, row-level security, and the other sign-ins |
| [Integrations](integrations.md) | Gmail, Google Calendar, Xero, Stripe, email, and the rest |
| [Local setup](local-setup.md) | Run the app on your machine |
| [Configuration](configuration.md) | Environment variables and organisation settings |
| [Deployment](deployment.md) | Vercel, Supabase, and the scheduled jobs |
| [Platform admin](platform-admin.md) | The EventureOS operator console |

## How the product is split

```
Office staff  →  /dashboard and the rest of the signed-in app
Customers     →  /p/<slug>          (portal)
Field staff   →  /my-jobs and /crew/<slug>
Public        →  /<slug>, /book, /shop, /site, /hire, /cafe, /jobs, /academy, /q, /pay
Operators     →  /admin             (platform admins only)
```

Money, mail and calendars stay in the tools the business already uses. EventureOS connects to them; it does not replace Gmail or Xero.
