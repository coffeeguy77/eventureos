=== EventureOS Bookings ===
Contributors: eventureos
Tags: bookings, classes, courses, gift certificates, stripe
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Your EventureOS booking form on your WordPress site, and a bridge that copies Bookly bookings into EventureOS.

== Description ==

* Booking form block and shortcode: [eventureos_booking] — options: course="course-link-name", page="gift", min_height="700"
* Responsive: fits phones, resizes itself, card payments open on Stripe's secure page.
* Optional Bookly sync: sends your Bookly bookings (students, dates, seats) to EventureOS every 10 minutes, so seats are counted in one place while both run. Read-only — the plugin never changes Bookly.

== Setup ==

1. Settings → EventureOS Bookings: enter your EventureOS business link name (the part after /book/ in your booking page address).
2. Add the "EventureOS booking" block, or the shortcode, to a page.
3. To copy Bookly bookings: in EventureOS go to Bookings → Website & settings → Make a plugin key, paste it here and tick "Sync Bookly".
