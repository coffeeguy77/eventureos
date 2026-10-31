# Public sites

[Wiki](index.md) · [Apps](apps.md) · [User flows](user-flows.md) · [APIs](apis.md)

These routes do not require an office login. Middleware lists them in `PUBLIC_PATHS` (`lib/supabase/middleware.ts`). A business’s own domain is handled first, in `middleware.ts`, by `customDomain()` (`lib/site/host.ts`): the host is looked up and the request is rewritten onto that business’s pages, including SEO redirects.

`/` on the EventureOS host is the product sales page (`components/marketing/sales-page.tsx`), not a customer’s site.

## Map

| URL | Who it is for | Code |
|---|---|---|
| `/` | People evaluating EventureOS | `app/page.tsx` |
| `/apps` | The public app catalogue | `app/apps/page.tsx` |
| `/<slug>` | The business’s short address. Classes if booking is enabled, otherwise the website home | `app/[org]/page.tsx` |
| `/site/<slug>` | The website builder’s public pages, including `/apply/<token>` | `app/site/` |
| `/book/<slug>` | Class booking, gifts, student account, agency / case managers, certificates | `app/book/` |
| `/shop/<slug>` | Online shop, cart, account, gift cards, subscriptions, order status | `app/shop/` |
| `/hire/<slug>` | Public hire, catering, drinks, machines, repairs, printing, shop, quote | `app/hire/` |
| `/cafe/<slug>` | Cafe: order, reserve, roasting club, wholesale | `app/cafe/` |
| `/order/<token>` | One wholesale customer’s ordering link | `app/order/` |
| `/academy/<slug>` | Learners: lessons, quizzes, coach, roast simulator, certificates, training rooms | `app/academy/` |
| `/jobs/<slug>` | Barista job board. Workers and employers each verify by email | `app/jobs/` |
| `/p/<slug>` | Customer portal: events, payments, documents, terms, support tickets | `app/p/` |
| `/crew/<slug>` | Crew app: board, shifts, away, pay, kitchen | `app/crew/` |
| `/q/<token>` | A published quote | `app/q/` |
| `/pay/<token>` | Pay one invoice. `/pay/statement/<token>` is a statement | `app/pay/` |
| `/login`, `/signup` | Office sign-in | `app/(auth)/` |

Tokens in the path (quote, pay, order, gift, booking manage links) are unguessable. Do not put intake API keys in any of these pages. Those keys are server-to-server only.

## Sign-in on a public site

These are not `organisation_users` rows and they are not Supabase passwords.

| Site | How |
|---|---|
| Portal | Supabase auth, role `customer`, linked from `contacts.portal_user_id` |
| Crew | The person is on `crew_members`. Office users are not redirected here |
| Class student | Email code, `booking_student_logins` / `booking_student_sessions`, httpOnly cookie |
| Case manager | The same pattern on `booking_case_manager_*` |
| Shop customer | `shop_logins` / `shop_sessions` |
| Employer (job board) | `job_employer_logins` / `job_employer_sessions` |
| Learner | Academy verify page, then a learner row |

Cookies for those sessions are `httpOnly`, `sameSite: lax`, and `secure` in production.

## Website enquiry form

Settings → Website enquiry form shows the snippet. The endpoint accepts JSON, url-encoded, or multipart:

`POST /api/public/enquiry/<slug>?key=<public_form_key>`

Fields: name, email, phone, company, event type, event date, guests, budget, venue, message, title. Several aliases are accepted (`full_name`, `mobile`, `guest_count`, and others — see the route). `website` is a honeypot. An optional `redirect` is the thank-you URL for a plain HTML form. CORS is open for POST. The RPC checks the key and rate-limits.

## Embeds and files

`/embed.js`, `/downloads`, `/fonts` and `/media` are public so a business site can load them. Documents in storage are not public; the app serves them through `lib/documents/serve.ts`. A path that starts with `media:/media/` redirects at `APP_URL`.

## Search engines

The EventureOS host serves `/robots.txt` and `/sitemap.xml` as public paths with no session work. A custom domain uses `/api/site/robots` and `/api/site/sitemap`. Portal, pay links and quote links send `noindex` where the page sets robots metadata (the portal layout does).

## Test checkouts

On class booking, gift certificates, shop orders and coffee gift cards, the code `GIFTCARDTEST` (any case, spaces ignored) is a free test. Rows are `is_test`. They are hidden from calendars, reports and lists, emails are prefixed `TEST`, and certificates say they are not valid. Settings → Testing clears them. The code is on unless the business switches testing off (`organisations.settings.testing.enabled !== false`).
