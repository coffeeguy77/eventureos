=== Web Culture Connector ===
Stable tag: 1.2.1
Requires at least: 6.0
Requires PHP: 7.4
License: GPLv2 or later

Lets the Web Culture command centre (EventureOS → Web Culture → Nerd Herd) check this site and run maintenance.

== Setup ==
1. Plugins → Add New → Upload Plugin → choose webculture-connector.zip → Activate.
2. Tools → Web Culture → copy the Connection key.
3. Add the site URL and key to the site's record in the command centre.

== API (all under /wp-json/webculture/v1) ==
GET  /ping          connection test
GET  /status        versions, pending updates, environment checks, last log entries
POST /check         refresh update information, then return /status
POST /update        body {"type":"core|plugins|themes|translations|all","items":[...optional plugin files or theme slugs]}
                    runs updates, keeps active plugins active, purges caches, loads the homepage before and after
POST /cache/purge   SiteGround, WP Rocket, W3TC, LiteSpeed, Elementor CSS, object cache
GET  /health        loads the homepage and reports HTTP code / fatal errors
GET  /log?limit=50  maintenance history

== Authentication ==
Either an administrator (logged in, or an Application Password), or a signed request:
  X-WCC-Timestamp: unix seconds (must be within 5 minutes)
  X-WCC-Nonce:     16–64 chars [A-Za-z0-9_-], single use
  X-WCC-Signature: hex HMAC-SHA256 of
                   timestamp + "\n" + nonce + "\n" + METHOD + "\n" + route + "\n" + raw body
                   using the connection key. route example: /webculture/v1/status
Creating a new key in Tools → Web Culture stops the old key working straight away.

== Site lock (unpaid hosting) ==
POST /lock    (signed requests only) body {"pay_url":"https://…","invoice":"INV-1234","amount":"$99.00","provider":"Web Culture","contact_email":"…","message":"…"}
POST /unlock  (signed requests only) body {"note":"…"}
GET  /lock    current lock state
While locked, visitors get HTTP 503 with a "temporarily unavailable" page and a Pay now button (search engines keep
rankings). Administrators, wp-admin, login, REST, AJAX and cron keep working. Locks/unlocks are logged.
Site administrators can't unlock it from the site; the Deactivate link is hidden while locked.

== Updates ==
The plugin updates itself from https://www.eventureos.com.au/downloads/webculture-connector.json
