=== Web Culture Connector ===
Stable tag: 1.4.1
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
POST /deploy        body {"type":"theme|plugin","zip":"<base64 of .zip>","activate":true|false,"slug":"folder-slug"}
                    installs/overwrites a theme or plugin from the sent package, optionally activates it, purges caches

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

== Backups (1.4.0) ==
POST /backup/start {"label":"…","scope":"full|code|database","budget":20}  begins a backup and works for up to budget seconds
POST /backup/step  {"id":"…","budget":20}                             carry on until status is "done"
GET  /backups                                                          finished backups (manifest of each)
POST /backup/download-link {"id":"…","part":"database.sql.gz|files-001.zip"}  10-minute single-use link (signed only)
POST /backup/restore {"id":"…"}                                       restore the database, in slices (signed only)
POST /backup/delete {"id":"…"}                                        (signed only)
Backups live in wp-content/wcc-backups/<random id>/ (web access denied); the newest 5 are kept (option wcc_backup_keep).

== Content tools (1.4.0) ==
GET  /site/info · POST /site/settings {"settings":{…},"summary":"…"}
GET  /content/list?type=any&search= · GET /content/item?id= · POST /content/item {"item":{…},"summary":"…"}
POST /content/replace {"id","find","replace","summary"}
GET  /elementor/outline?id= · GET /elementor/element?id=&path= · POST /elementor/patch {"id","ops":[…],"summary"}
GET  /media/list?search= · POST /media/item {"media":{"id","alt","title","caption"}} · POST /media/upload
GET  /menus/items?menu= · POST /menus/item {"item":{…}}
POST /rest {"method","path","body","query","summary"}   anything else through WordPress's REST API (not users/plugins/themes/settings)
GET  /changes · POST /undo {"change_id"}                each change keeps an undo copy (last 8 per page)

== Automatic updates (1.4.1) ==
The connector keeps itself up to date: WordPress's background updater installs new versions of this plugin (about twice a day) even when automatic updates are off for other plugins, and the command centre pushes the newest version to any site still behind.
