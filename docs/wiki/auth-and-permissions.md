# Auth and permissions

[Wiki](index.md) · [Architecture](architecture.md) · [Data model](data-model.md) · [Public sites](public-sites.md)

Two layers decide what a person can do. The menu (`lib/access.ts`, enforced again in `app/(app)/layout.tsx`) keeps the UI honest. **Row-level security is the real boundary.** A crafted request cannot read another tenant, and a sales user cannot select invoices.

## Office sign-in

Supabase Auth, email and password, via `signInWithPassword`. Email confirmation is required when Supabase does not return a session at sign-up. The callback route is `/auth/callback`.

Forgot-password is a one-time code (`signInWithOtp` with `shouldCreateUser: false`), then `updateUser({ password })`. The UI does not say whether the email exists, except when Supabase rate-limits the send.

Passwords must be at least 8 characters. The app surfaces Supabase’s leaked-password and “same password” errors in plain language.

After a successful sign-in the app calls `accept_my_invitations()`.

Middleware (`lib/supabase/middleware.ts`) refreshes the session cookie. Signed-out visitors hitting a private path go to `/login?next=…`. Signed-in visitors hitting `/login` or `/signup` go to `/dashboard`.

`createClient()` retries a 401 whose body says `issued at future` up to three times, one second apart. That covers a new token rejected because Auth and the database clocks differ slightly.

## Roles

`OrgRole` in `lib/types.ts`: `owner`, `admin`, `manager`, `sales`, `staff`, `customer`.

| Role | Menu (`lib/access.ts`) | Database |
|---|---|---|
| Owner | Everything, including billing and the team | Manager policies, and owner-only product rules (approval, organisation profile) |
| Admin | Everything, including settings and the team | Same manager policies. Organisation profile is owner or admin |
| Manager | Day-to-day: enquiries, quotes, events, invoices, payments | `is_org_manager`. Can toggle automations. Cannot edit the organisation profile |
| Sales | Enquiries, clients, events, quotes, calendar. No invoices, payments, reports, settings, wages, website, Learn, franchise, pricing, accounts, printing or hosting | `is_org_staff` (office) but not `is_org_manager`, so invoice and payment policies exclude them |
| Staff | `/my-jobs` and `/my-signature` only | `is_org_team` but not `is_org_staff`. Rostered jobs only. No prices |
| Customer | No office app. Redirected to `/p/<slug>` | Portal RPCs and the policies written for `actor_type = customer` |

`canManage()` is owner, admin or manager. `canOpen(role, path, access)` is what the layout calls before rendering a page. Field staff who open anything else are redirected to `/my-jobs`.

Sales is blocked from those paths even if someone puts them in a section list. The blocked list is `SALES_BLOCKED` in `lib/access.ts`.

## Section lists

`organisation_users.access` is a list of path prefixes, or null. Null means “everything this role allows”. Owners ignore the list. Anyone else with a list only sees those sections, plus `/dashboard`, `/my-signature`, `/my-bonuses`, `/notifications` and `/profile`.

The selectable sections and the four presets (Accounts, Sales, Operations, Web designer) are `SECTIONS` and `ACCESS_PRESETS` in `lib/access.ts`. Settings → Team writes the list. `cleanAccess()` drops anything that is not a known section.

This is a menu and page lock. RLS still applies underneath. Giving a sales user the invoices section in a hand-edited row would not let them read `invoices`, because the policy calls `is_org_manager`.

## Membership rules

`getContext()` loads memberships that are `active` and not past `expires_at`. Customer memberships are separated out (`portalOrgs`). A membership whose organisation row cannot be read is treated as a suspended organisation.

The current organisation is the `eos_org` cookie, or the first membership by name. Switching organisation sets that cookie (`app/(app)/shell-actions.ts`).

A support session is a membership whose title is `EventureOS Support`. The profile name and email shown on outgoing mail become the business’s, and the activity actor stays “EventureOS Support”. Support sessions do not apply the section list (`access` is forced to null).

## What managers can see that sales cannot

Migration `0020` is the source of these policies:

- `invoices` and `payments`: select for managers
- `integration_sync_logs` and `import_candidates`: managers
- `integrations`: select for office staff, update for managers
- `automation_rules`: insert and update for managers
- `notifications`: office staff see org-wide notices and their own; field staff see only their own
- `organisation_users`: a person sees their own row; the team sees the team list (names for rosters); platform admins see all
- `event_staff`: office staff manage the roster; a field staff user can read the row that points at themselves

Deletes of tenant records are limited to managers and above in the core policies. The audit log has no update or delete policy for ordinary roles.

## Platform admins

`platform_admins.user_id` is the whole of `is_super_admin()`. The admin layout calls that RPC and returns 404 for everyone else. There is no separate admin password. See [Platform admin](platform-admin.md).

## Other sign-ins

Portal customers use Supabase Auth and the `customer` role. Everyone else on a public site uses a one-time email code and an httpOnly session cookie scoped to that organisation. Those tables are listed in [Public sites](public-sites.md). They never receive an office role.

## Tokens and secrets

| Secret | Who can read it |
|---|---|
| Publishable Supabase key | The browser. RLS is what protects rows |
| Service-role key | Server only: cron, webhooks, public token lookups |
| Integration OAuth tokens | RPCs. The table is not granted to the client |
| `INTEGRATION_SERVER_KEY` | Server. Its SHA-256 must match `private.server_keys` where `name = 'integration'` |
| Quote-intake and WordPress keys | Shown once when created. Stored as a hash. Compared in `intake_connection` |
| Invoice `pay_token`, quote token, wholesale order token | The link itself. The pay token is 64 hex characters |

Public form keys are per organisation and are checked inside `capture_website_enquiry` before any row is written. The function runs as security definer and is granted to `anon`.

## Suspended and cancelled

`organisations.status` is `active`, `suspended` or `cancelled`. Suspended members of the office app are sent to `/suspended`. The cron skips integrations whose organisation is not active.
