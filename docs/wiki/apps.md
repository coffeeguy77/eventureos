# Apps

[Wiki](index.md) · [Features](features.md) · [Public sites](public-sites.md) · [Platform admin](platform-admin.md)

Apps are the modules a business might not use. One list in `lib/apps.ts` drives the sidebar, the page lock in `app/(app)/layout.tsx`, Settings → Apps, Platform admin → Plans & apps, and the public catalogue at `/apps`.

`ON_REQUEST` is Hosting and Nerd Herd. With no access list stored (`null`), every other app is allowed and those two are not. When a list is stored, only the ticked keys are allowed. A locked path redirects to `/settings/apps?locked=<key>`.

Hire has a second switch: `settings` on the organisation (`readHireSettings`). The sidebar flag is on only when the app is allowed **and** that switch is on. Franchise appears in the sidebar only when the app is allowed **and** the website has a franchise page or a franchise form.

The descriptions below are the catalogue copy in `lib/apps.ts`, which matches the screens.

## Hire — `/rentals`

Hire out equipment without double-booking it. Items, stock and rates. The cheapest mix of half-day, day and week is calculated for the length of the hire. Stock is checked live, including turnaround. Packages add the pieces that go together. The today board shows what is going out, coming back, and overdue. Pick lists, delivery dockets, return counts and bonds. Use and earnings per item.

Office pages: Today, Bookings, Availability, Items & rates, Settings. The public catalogue is `/hire/<slug>`, which is a wider site (catering, drinks, machines, printing, repairs) and not only the rental stock. See [Public sites](public-sites.md).

Tables: `hire_items`, `hire_bookings`, `hire_booking_lines`.

## Classes & courses — `/bookings`

Sell seats in classes, workshops and courses. Online booking and card payment, waitlists that fill when a seat frees, gift vouchers and promo codes, certificates, agency and case-manager billing, and a calendar block when a session is full.

Public booking is `/book/<slug>`. WordPress Bookly can be copied in via the plugin endpoint. ClassBento “new booking” emails can be imported when that option is on.

Tables: `booking_courses`, `booking_sessions`, `booking_students`, `bookings`, `booking_gifts`, `booking_agencies`, `booking_case_managers` and their login tables, `booking_certificates`, `booking_certificate_templates`, `booking_student_logins`, `booking_student_sessions`.

## Academy — `/learn`

An online course in the business’s name: levels, modules, lessons, quizzes, badges, challenges, an AI coach, paid access, and a venue-hire marketplace. Learners use `/academy/<slug>`.

Operator steps, prices and what was deliberately not moved from the old course app are in [docs/learn.md](../learn.md). It ships switched off. No learner email is sent unless the welcome email is ticked.

Tables: `learn_levels`, `learn_modules`, `learn_lessons`, `learn_badges`, `learn_challenges`, `learn_trainer_items`, `learn_learners`, `learn_progress`, `learn_quiz_attempts`, `learn_badge_awards`, `learn_challenge_done`, `learn_roasts`, `learn_ai_usage`, `learn_access`, `learn_payments`, `learn_venues`, `learn_venue_bookings`.

## Shop — `/store`

Products, options, stock, subscriptions, gift cards, coupons, banners, parcels, and customer accounts. The public shop is `/shop/<slug>`. Australia Post shipping has its own office page (`/store/ship`). WooCommerce order emails can be imported; subscriptions WooCommerce still bills are not charged here.

Tables: `shop_products`, `shop_variants`, `shop_customers`, `shop_logins`, `shop_sessions`, `shop_addresses`, `shop_coupons`, `shop_banners`, `shop_subscriptions`, `shop_parcels`, `shop_gift_cards`, `shop_orders`.

## Offers — `/offers`

Promo codes for classes, gift certificates and the shop. Each offer can have a share link, a printable QR poster (`/api/offers/<id>/poster`), and a ribbon on the website.

## Wholesale — `/wholesale`

Trade customers order from their own link (`/order/<token>`) at their price-group prices, with a minimum order. The office has a run sheet, orders, customers, products and settings. Order emails (for example Ordermentum) import on the Gmail sync when that option is on.

Tables: `wholesale_customers`, `wholesale_products`, `wholesale_group_prices`, `wholesale_orders`, `wholesale_order_lines`.

## Kitchen — `/kitchen`

A day sheet, what to make, and a supplier order list from upcoming catering and the recipes. Recipes have ingredients and nutrition. Food labels. Confirmed catering changes are emailed to people ticked as kitchen, from the cron.

Tables: `catering_ingredients`, `catering_recipe_lines`. Menu and orders also hang off events and quote lines.

## Wages — `/wages`

Shifts from events and the roster, extra hours staff add for approval, and what is owed. Staff see their own pay in the crew app. Covered with the office features in [Features](features.md) because the screen is in the main menu.

Tables: `crew_members`, `crew_member_emails`, `event_crew`, `staff_shifts`, `staff_shift_series`, `staff_payments`, `staff_hour_claims`, `staff_unavailability`.

## Website — `/website`

Pages, menus and a theme (light, dark, or brand nav; heading and corner choices in `lib/site/theme.ts`). The public site is `/site/<slug>`, and a custom domain is rewritten to it by middleware. SEO redirects and hit counts (`site_url_hits`) are there so a business can keep rankings when URLs change. `robots.txt` and `sitemap.xml` for a custom domain are `/api/site/robots` and `/api/site/sitemap`.

Booking, hire, shop and enquiry forms are part of the same site. Cart-abandonment reminders run from the cron only when the business switches them on. They are off by default.

## Franchise — `/franchise`

A landing page, an application form the business can edit (`/franchise/questions`), and a pipeline from enquiry to approval (`franchise_applications`). The public apply link is `/site/<slug>/apply/<token>`.

## Pricing — `/pricing`

Supplier invoices read from Gmail (and the second Gmail account). Each line’s price is kept over time. Rises and odd invoices are flagged. The office can compare suppliers before ordering. Reading a PDF invoice uses `unpdf`. AI extraction uses the organisation’s Anthropic key when one is set.

Pages: Prices, Invoices, Suppliers, and an item history. Tables: `price_suppliers`, `price_invoices`, `price_lines`, `price_email_imports`.

## Printing — `/printing`

Customers upload artwork on the public printing page. Quotes are priced by the lineal metre, plus setup and cutting. The customer approves online. The job becomes an invoice in one step.

Public: `/hire/<slug>/printing`. API: `/api/public/printing`, plus `approve`, `done` and `more`. Tables: `print_jobs`, `print_files`.

## Coffee machines — `/machines`

Machines for sale, a chooser (coffees a day, milk, water, budget), a repairs page that can say which brands are not serviced, service jobs priced as a callout and first hour then an hourly rate, and a quick sale that builds a draft invoice from the price list. Invoices go to Xero line by line.

Public: `/hire/<slug>/machines` and `/hire/<slug>/repairs`. Enquiries from the site are emailed to the business. Table: `machine_jobs`.

## Hosting — `/hosting` (on request)

WHM and SiteGround accounts matched to invoices. Overdue notices from the business’s own templates. Suspend and unsuspend, dry-run by default. The cron syncs servers and rechecks billing after the Xero sync, so payments are fresh.

The sidebar label is whatever Hosting settings call it (`readHosting(settings).menuLabel`).

Pages: Accounts, Site checks, Billing check, Recurring invoices, Servers, Settings & notices. Tables: `hosting_servers`, `hosting_server_credentials`, `hosting_accounts`, `hosting_events`, `recurring_invoices`. A public status URL is `/api/public/hosting/status`.

## Nerd Herd — `/nerd-herd` (on request)

The help desk for a web agency. Tickets from the support inbox, the client portal, or a phone call. Maintenance plans raise an invoice and open the job; work starts when it is paid. Checklists and a history per site. Client pages collect websites, hosting, ads, plans and how reliably they pay. Clients see tickets, sites and invoices in the portal.

Pages: Help desk, Tickets, Maintenance, Websites, Plans, Settings. Tables: `websites`, `support_tickets`, `support_ticket_updates`.

## Section limits

Settings → Team can limit a person (other than the owner) to a subset of these sections. Presets in `lib/access.ts`: Accounts, Sales, Operations, Web designer. Someone with a list still sees the dashboard and their own profile pages. See [Auth and permissions](auth-and-permissions.md).
